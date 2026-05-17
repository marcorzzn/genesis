/**
 * @module SubstrateEngine
 * @description Level 1 — WebGL2 GPGPU substrate engine with double-buffered
 * ping-pong FBO. Supports Game of Life, Gray-Scott Reaction-Diffusion,
 * and GPU Particle modes switchable at runtime.
 */

import eventBus from '../meta/event_bus.js';
import * as Shaders from './shaders.glsl.js';

/** Substrate simulation modes */
export const SubstrateMode = { GAME_OF_LIFE: 0, REACTION_DIFFUSION: 1, PARTICLES: 2 };

export class SubstrateEngine {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Object} [options]
   * @param {number} [options.width=2048]
   * @param {number} [options.height=2048]
   * @param {number} [options.mode=1]
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.width = options.width ?? 2048;
    this.height = options.height ?? 2048;
    this.mode = options.mode ?? SubstrateMode.REACTION_DIFFUSION;

    this.gl = null;
    this.programs = {};
    this.fbos = [null, null];
    this.textures = [null, null];
    this.currentBuffer = 0;
    this.quadVAO = null;
    this.initialized = false;

    // RD params
    this.feedRate = 0.037;
    this.killRate = 0.06;
    this.diffU = 0.21;
    this.diffV = 0.105;
    this.dt = 1.0;

    this._frameCount = 0;
    this._setupEventListeners();
  }

  /** Initialize WebGL2 context, shaders, textures, and FBOs */
  init() {
    const gl = this.canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });
    if (!gl) { console.error('[Substrate] WebGL2 not supported'); return false; }

    const floatExt = gl.getExtension('EXT_color_buffer_float');
    if (!floatExt) { console.warn('[Substrate] EXT_color_buffer_float not available, using UNSIGNED_BYTE'); }

    this.gl = gl;
    this.hasFloat = !!floatExt;

    this._createQuadVAO();
    this._compilePrograms();
    this._createPingPongBuffers();
    this._seedGrid();

    this.initialized = true;
    eventBus.publish('substrate.initialized', { width: this.width, height: this.height, mode: this.mode }, { source_layer: 1 });
    return true;
  }

  /** Run one simulation step */
  step() {
    if (!this.initialized) return;
    const gl = this.gl;
    const src = this.currentBuffer;
    const dst = 1 - src;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[dst]);
    gl.viewport(0, 0, this.width, this.height);

    let prog;
    if (this.mode === SubstrateMode.GAME_OF_LIFE) {
      prog = this.programs.gol;
      gl.useProgram(prog.program);
      gl.uniform2f(prog.uniforms.u_resolution, this.width, this.height);
    } else if (this.mode === SubstrateMode.REACTION_DIFFUSION) {
      prog = this.programs.rd;
      gl.useProgram(prog.program);
      gl.uniform2f(prog.uniforms.u_resolution, this.width, this.height);
      gl.uniform1f(prog.uniforms.u_feed, this.feedRate);
      gl.uniform1f(prog.uniforms.u_kill, this.killRate);
      gl.uniform1f(prog.uniforms.u_diffU, this.diffU);
      gl.uniform1f(prog.uniforms.u_diffV, this.diffV);
      gl.uniform1f(prog.uniforms.u_dt, this.dt);
    } else {
      prog = this.programs.particles;
      gl.useProgram(prog.program);
      gl.uniform2f(prog.uniforms.u_resolution, this.width, this.height);
      gl.uniform1f(prog.uniforms.u_dt, this.dt);
      gl.uniform2f(prog.uniforms.u_gravity, 0.0, 0.001);
      gl.uniform1f(prog.uniforms.u_damping, 0.99);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[src]);
    gl.uniform1i(prog.uniforms.u_state, 0);

    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    this.currentBuffer = dst;
    this._frameCount++;
  }

  /** Render current state to the canvas */
  render() {
    if (!this.initialized) return;
    const gl = this.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    const prog = this.programs.display;
    gl.useProgram(prog.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[this.currentBuffer]);
    gl.uniform1i(prog.uniforms.u_state, 0);
    gl.uniform1i(prog.uniforms.u_mode, this.mode);
    gl.uniform1f(prog.uniforms.u_time, this._frameCount * 0.016);

    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Read back energy values from GPU (async via PBO when available) */
  getEnergyMap(x, y, w, h) {
    if (!this.initialized) return null;
    const gl = this.gl;

    const readX = Math.max(0, Math.min(x, this.width - 1));
    const readY = Math.max(0, Math.min(y, this.height - 1));
    const readW = Math.min(w, this.width - readX);
    const readH = Math.min(h, this.height - readY);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[this.currentBuffer]);
    const pixels = new Float32Array(readW * readH * 4);
    gl.readPixels(readX, readY, readW, readH, gl.RGBA, gl.FLOAT, pixels);

    return { data: pixels, width: readW, height: readH };
  }

  /** Get energy gradient vector at a point */
  getGradientVector(x, y) {
    const map = this.getEnergyMap(Math.max(0, x - 1), Math.max(0, y - 1), 3, 3);
    if (!map || map.width < 3 || map.height < 3) return { dx: 0, dy: 0 };
    const center = 4 * (1 * map.width + 1);
    const right = 4 * (1 * map.width + 2);
    const left = 4 * (1 * map.width + 0);
    const up = 4 * (2 * map.width + 1);
    const down = 4 * (0 * map.width + 1);
    return {
      dx: (map.data[right] - map.data[left]) * 0.5,
      dy: (map.data[up] - map.data[down]) * 0.5
    };
  }

  /** Reset grid with a new seed */
  resetToSeed(seed = Math.random() * 10000) {
    if (!this.initialized) return;
    const gl = this.gl;

    for (let i = 0; i < 2; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos[i]);
      gl.viewport(0, 0, this.width, this.height);

      const prog = this.programs.seed;
      gl.useProgram(prog.program);
      gl.uniform2f(prog.uniforms.u_resolution, this.width, this.height);
      gl.uniform1f(prog.uniforms.u_seed, seed);
      gl.uniform1i(prog.uniforms.u_mode, this.mode);

      gl.bindVertexArray(this.quadVAO);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    this.currentBuffer = 0;
    this._frameCount = 0;
  }

  /** Set simulation mode at runtime */
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.resetToSeed();
    eventBus.publish('substrate.mode_changed', { mode }, { source_layer: 1 });
  }

  /** Set uniforms from external control */
  setUniforms(params) {
    if (params.feedRate !== undefined) this.feedRate = params.feedRate;
    if (params.killRate !== undefined) this.killRate = params.killRate;
    if (params.diffU !== undefined) this.diffU = params.diffU;
    if (params.diffV !== undefined) this.diffV = params.diffV;
    if (params.dt !== undefined) this.dt = params.dt;
  }

  /** Resize the simulation grid (for adaptive throttling) */
  resize(newWidth, newHeight) {
    this.width = newWidth;
    this.height = newHeight;
    this._destroyBuffers();
    this._createPingPongBuffers();
    this._seedGrid();
  }

  // === Private Methods ===

  _createQuadVAO() {
    const gl = this.gl;
    const verts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

    this.quadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.quadVAO);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  _compilePrograms() {
    this.programs.gol = this._createProgram(Shaders.VERTEX_QUAD, Shaders.FRAG_GAME_OF_LIFE,
      ['u_state', 'u_resolution']);
    this.programs.rd = this._createProgram(Shaders.VERTEX_QUAD, Shaders.FRAG_REACTION_DIFFUSION,
      ['u_state', 'u_resolution', 'u_feed', 'u_kill', 'u_diffU', 'u_diffV', 'u_dt']);
    this.programs.particles = this._createProgram(Shaders.VERTEX_QUAD, Shaders.FRAG_PARTICLE_UPDATE,
      ['u_particles', 'u_resolution', 'u_dt', 'u_gravity', 'u_damping']);
    this.programs.display = this._createProgram(Shaders.VERTEX_QUAD, Shaders.FRAG_DISPLAY,
      ['u_state', 'u_mode', 'u_time']);
    this.programs.seed = this._createProgram(Shaders.VERTEX_QUAD, Shaders.FRAG_SEED,
      ['u_resolution', 'u_seed', 'u_mode']);
  }

  _createProgram(vSrc, fSrc, uniformNames) {
    const gl = this.gl;
    const vs = this._compileShader(gl.VERTEX_SHADER, vSrc);
    const fs = this._compileShader(gl.FRAGMENT_SHADER, fSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'a_position');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[Substrate] Program link error:', gl.getProgramInfoLog(prog));
    }
    const uniforms = {};
    for (const name of uniformNames) uniforms[name] = gl.getUniformLocation(prog, name);
    return { program: prog, uniforms };
  }

  _compileShader(type, src) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('[Substrate] Shader compile error:', gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  _createPingPongBuffers() {
    const gl = this.gl;
    const internalFormat = this.hasFloat ? gl.RGBA32F : gl.RGBA8;
    const type = this.hasFloat ? gl.FLOAT : gl.UNSIGNED_BYTE;

    for (let i = 0; i < 2; i++) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, this.width, this.height, 0, gl.RGBA, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      this.textures[i] = tex;

      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE) {
        console.error('[Substrate] Framebuffer incomplete:', status);
      }
      this.fbos[i] = fbo;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  _seedGrid() { this.resetToSeed(42); }

  _destroyBuffers() {
    const gl = this.gl;
    for (let i = 0; i < 2; i++) {
      if (this.textures[i]) gl.deleteTexture(this.textures[i]);
      if (this.fbos[i]) gl.deleteFramebuffer(this.fbos[i]);
    }
  }

  _setupEventListeners() {
    eventBus.subscribe('divine.energy_injection', (e) => {
      // Inject energy at a location by modifying the texture
      if (!this.initialized) return;
      const { x, y, amount, radius } = e.payload;
      // Convert to grid coordinates and stamp energy
      this._injectEnergyAtPixel(x, y, amount, radius);
    }, { layer: 1, priority: 8 });

    eventBus.subscribe('divine.physics_modification', (e) => {
      const { name, value } = e.payload;
      this.setUniforms({ [name]: value });
    }, { layer: 1, priority: 8 });
  }

  _injectEnergyAtPixel(cx, cy, amount, radius) {
    const gl = this.gl;
    const size = radius * 2;
    const data = new Float32Array(size * size * 4);
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const dist = Math.sqrt((dx - radius) ** 2 + (dy - radius) ** 2);
        if (dist < radius) {
          const idx = (dy * size + dx) * 4;
          const intensity = (1.0 - dist / radius) * amount / 100;
          data[idx] = intensity;
          data[idx + 1] = intensity * 0.5;
        }
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, this.textures[this.currentBuffer]);
    const px = Math.floor(cx - radius);
    const py = Math.floor(cy - radius);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, Math.max(0, px), Math.max(0, py), size, size, gl.RGBA, gl.FLOAT, data);
  }

  destroy() {
    this._destroyBuffers();
    this.initialized = false;
  }

  serialize() {
    return { mode: this.mode, feedRate: this.feedRate, killRate: this.killRate,
      diffU: this.diffU, diffV: this.diffV, dt: this.dt, width: this.width, height: this.height };
  }

  deserialize(state) {
    if (!state) return;
    this.mode = state.mode ?? SubstrateMode.REACTION_DIFFUSION;
    this.feedRate = state.feedRate ?? 0.037;
    this.killRate = state.killRate ?? 0.06;
    this.diffU = state.diffU ?? 0.21;
    this.diffV = state.diffV ?? 0.105;
  }
}

export default SubstrateEngine;
