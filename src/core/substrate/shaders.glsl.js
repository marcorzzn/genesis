/**
 * @module Shaders
 * @description GLSL shader source code for Level 1 substrate simulation.
 * Contains vertex/fragment shaders for: Game of Life, Gray-Scott reaction-diffusion,
 * GPU particle system, and display rendering.
 */

/** Shared fullscreen quad vertex shader */
export const VERTEX_QUAD = `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

/** Conway's Game of Life fragment shader (toroidal) */
export const FRAG_GAME_OF_LIFE = `#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform vec2 u_resolution;
uniform int u_birthMask;
uniform int u_survivalMask;
uniform float u_decay;
in vec2 v_uv;
out vec4 fragColor;

bool hasRule(int mask, int neighbors) {
  return (mask & (1 << neighbors)) != 0;
}

void main() {
  vec2 px = 1.0 / u_resolution;
  float sum = 0.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      if (dx == 0 && dy == 0) continue;
      vec2 neighbor = fract(v_uv + vec2(float(dx), float(dy)) * px);
      sum += texture(u_state, neighbor).r;
    }
  }
  vec4 current = texture(u_state, v_uv);
  float self = current.r;
  int neighbors = int(sum + 0.5);
  bool survives = self > 0.5 && hasRule(u_survivalMask, neighbors);
  bool born = self <= 0.5 && hasRule(u_birthMask, neighbors);
  float alive = (survives || born) ? 1.0 : 0.0;
  float age = alive > 0.5 ? min(1.0, current.g + 0.045) : max(0.0, current.g - u_decay);
  fragColor = vec4(alive, age, float(neighbors) / 8.0, 1.0);
}`;

/** Gray-Scott reaction-diffusion fragment shader */
export const FRAG_REACTION_DIFFUSION = `#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform vec2 u_resolution;
uniform float u_feed;
uniform float u_kill;
uniform float u_diffU;
uniform float u_diffV;
uniform float u_dt;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec2 px = 1.0 / u_resolution;
  vec4 center = texture(u_state, v_uv);
  float u = center.r;
  float v = center.g;

  // 5-point Laplacian with toroidal wrapping
  float lu = -4.0 * u;
  float lv = -4.0 * v;
  vec4 n;
  n = texture(u_state, fract(v_uv + vec2(px.x, 0.0)));  lu += n.r; lv += n.g;
  n = texture(u_state, fract(v_uv + vec2(-px.x, 0.0))); lu += n.r; lv += n.g;
  n = texture(u_state, fract(v_uv + vec2(0.0, px.y)));  lu += n.r; lv += n.g;
  n = texture(u_state, fract(v_uv + vec2(0.0, -px.y))); lu += n.r; lv += n.g;

  float uvv = u * v * v;
  float du = u_diffU * lu - uvv + u_feed * (1.0 - u);
  float dv = u_diffV * lv + uvv - (u_feed + u_kill) * v;

  float newU = clamp(u + du * u_dt, 0.0, 1.0);
  float newV = clamp(v + dv * u_dt, 0.0, 1.0);

  fragColor = vec4(newU, newV, center.b, 1.0);
}`;

/** GPU Particle update shader (Verlet integration) */
export const FRAG_PARTICLE_UPDATE = `#version 300 es
precision highp float;
uniform sampler2D u_particles;    // xy = position, zw = previous position
uniform sampler2D u_velocities;   // xy = velocity, z = life, w = type
uniform vec2 u_resolution;
uniform float u_dt;
uniform vec2 u_gravity;
uniform float u_damping;
in vec2 v_uv;
layout(location = 0) out vec4 o_particles;
layout(location = 1) out vec4 o_velocities;

void main() {
  vec4 part = texture(u_particles, v_uv);
  vec4 vel = texture(u_velocities, v_uv);
  vec2 pos = part.xy;
  vec2 prevPos = part.zw;
  float life = vel.z;

  if (life <= 0.0) {
    o_particles = vec4(0.0);
    o_velocities = vec4(0.0);
    return;
  }

  // Verlet integration
  vec2 acceleration = u_gravity + vel.xy * 0.1;
  vec2 newPos = pos * 2.0 - prevPos + acceleration * u_dt * u_dt;
  newPos = fract(newPos); // toroidal wrap

  float newLife = life - u_dt * 0.01;

  o_particles = vec4(newPos, pos);
  o_velocities = vec4(vel.xy * u_damping, newLife, vel.w);
}`;

/** Display/render shader for visualization */
export const FRAG_DISPLAY = `#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform int u_mode; // 0=GoL, 1=RD, 2=particles
uniform float u_time;
in vec2 v_uv;
out vec4 fragColor;

vec3 hsl2rgb(float h, float s, float l) {
  float c = (1.0 - abs(2.0 * l - 1.0)) * s;
  float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
  float m = l - c * 0.5;
  vec3 rgb;
  float h6 = h * 6.0;
  if (h6 < 1.0) rgb = vec3(c, x, 0.0);
  else if (h6 < 2.0) rgb = vec3(x, c, 0.0);
  else if (h6 < 3.0) rgb = vec3(0.0, c, x);
  else if (h6 < 4.0) rgb = vec3(0.0, x, c);
  else if (h6 < 5.0) rgb = vec3(x, 0.0, c);
  else rgb = vec3(c, 0.0, x);
  return rgb + m;
}

void main() {
  vec4 data = texture(u_state, v_uv);

  if (u_mode == 0) {
    // Game of Life: age and neighborhood-aware glow
    float v = data.r;
    float age = data.g;
    float neighborhood = data.b;
    vec3 young = vec3(0.16, 0.85, 0.66);
    vec3 old = vec3(0.96, 0.78, 0.28);
    vec3 col = mix(vec3(0.018, 0.026, 0.04), mix(young, old, age), max(v, age * 0.45));
    col += neighborhood * vec3(0.02, 0.07, 0.11);
    fragColor = vec4(col, 1.0);
  } else if (u_mode == 1) {
    // Reaction-Diffusion: chemical gradient coloring
    float u = data.r;
    float v = data.g;
    float hue = 0.55 + v * 0.4 - u * 0.1;
    float sat = 0.7 + v * 0.3;
    float lit = 0.05 + u * 0.15 + v * 0.5;
    fragColor = vec4(hsl2rgb(hue, sat, lit), 1.0);
  } else {
    // Particles: point-based rendering
    float life = data.z;
    if (life <= 0.0) {
      fragColor = vec4(0.02, 0.02, 0.04, 1.0);
    } else {
      float hue = data.w * 0.3 + 0.5;
      vec3 col = hsl2rgb(hue, 0.8, 0.3 + life * 0.4);
      fragColor = vec4(col * life, 1.0);
    }
  }
}`;

/** Seed initialization shader */
export const FRAG_SEED = `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_seed;
uniform int u_mode;
in vec2 v_uv;
out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p + u_seed, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  if (u_mode == 0) {
    // GoL: random sparse seed
    float r = hash(gl_FragCoord.xy);
    float alive = r < 0.15 ? 1.0 : 0.0;
    fragColor = vec4(alive, alive * 0.8, alive * 0.3, 1.0);
  } else if (u_mode == 1) {
    // RD: uniform U=1, small V seed in center
    vec2 c = v_uv - 0.5;
    float d = length(c);
    float u = 1.0;
    float v = 0.0;
    // Seed multiple spots
    for (float i = 0.0; i < 5.0; i++) {
      vec2 offset = vec2(hash(vec2(i, u_seed)) - 0.5, hash(vec2(u_seed, i)) - 0.5) * 0.6;
      float dd = length(c - offset);
      if (dd < 0.02 + hash(vec2(i * 3.0, u_seed)) * 0.03) {
        v = 0.5 + hash(vec2(i, i)) * 0.5;
        u = 0.5;
      }
    }
    fragColor = vec4(u, v, 0.0, 1.0);
  } else {
    // Particles: random initial positions
    float r1 = hash(gl_FragCoord.xy);
    float r2 = hash(gl_FragCoord.xy + 100.0);
    float life = hash(gl_FragCoord.xy + 200.0);
    fragColor = vec4(r1, r2, r1, r2); // pos.xy, prevPos.xy
  }
}`;
