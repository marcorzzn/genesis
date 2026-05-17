/**
 * @module LODManager
 * @description Level of Detail manager — dynamically adjusts simulation
 * resolution based on observer zoom level. Implements adaptive throttling
 * to maintain target FPS.
 */

import eventBus from '../meta/event_bus.js';

export const LODLevel = { GLOBAL: 0, REGIONAL: 1, LOCAL: 2, DETAIL: 3 };

export class LODManager {
  constructor() {
    this.currentZoom = 1.0;
    this.viewportX = 0;
    this.viewportY = 0;
    this.viewportWidth = 800;
    this.viewportHeight = 600;
    this.currentLOD = LODLevel.GLOBAL;

    // Adaptive throttling
    this.targetFPS = 60;
    this.minFPS = 30;
    this.currentFPS = 60;
    this.gridResolution = 2048;
    this.maxGridResolution = 4096;
    this.minGridResolution = 512;
    this.updateFrequencies = { substrate: 1, biology: 1, ecology: 5, cognition: 10 };
    this._fpsHistory = [];
    this._adaptiveEnabled = true;
  }

  /** Update viewport from user interaction */
  setViewport(x, y, width, height, zoom) {
    this.viewportX = x;
    this.viewportY = y;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.currentZoom = zoom;

    if (zoom < 0.3) this.currentLOD = LODLevel.GLOBAL;
    else if (zoom < 1.0) this.currentLOD = LODLevel.REGIONAL;
    else if (zoom < 3.0) this.currentLOD = LODLevel.LOCAL;
    else this.currentLOD = LODLevel.DETAIL;
  }

  /** Get the appropriate grid resolution for the current LOD */
  getGridResolution() {
    switch (this.currentLOD) {
      case LODLevel.GLOBAL: return Math.min(this.gridResolution, 512);
      case LODLevel.REGIONAL: return Math.min(this.gridResolution, 1024);
      case LODLevel.LOCAL: return Math.min(this.gridResolution, 2048);
      case LODLevel.DETAIL: return this.gridResolution;
      default: return 1024;
    }
  }

  /** Report current FPS for adaptive throttling */
  reportFPS(fps) {
    this.currentFPS = fps;
    this._fpsHistory.push(fps);
    if (this._fpsHistory.length > 30) this._fpsHistory.shift();

    if (!this._adaptiveEnabled) return;

    const avgFPS = this._fpsHistory.reduce((s, v) => s + v, 0) / this._fpsHistory.length;

    if (avgFPS < this.minFPS) {
      // Reduce quality
      if (this.gridResolution > this.minGridResolution) {
        this.gridResolution = Math.max(this.minGridResolution, Math.floor(this.gridResolution * 0.75));
        eventBus.publish('lod.quality_reduced', { gridResolution: this.gridResolution, fps: avgFPS }, { source_layer: 3 });
      }
      this.updateFrequencies.cognition = Math.min(30, this.updateFrequencies.cognition + 2);
      this.updateFrequencies.ecology = Math.min(20, this.updateFrequencies.ecology + 1);
    } else if (avgFPS > this.targetFPS * 0.9 && this.gridResolution < this.maxGridResolution) {
      // Increase quality
      this.gridResolution = Math.min(this.maxGridResolution, Math.floor(this.gridResolution * 1.1));
      this.updateFrequencies.cognition = Math.max(5, this.updateFrequencies.cognition - 1);
      this.updateFrequencies.ecology = Math.max(2, this.updateFrequencies.ecology - 1);
      eventBus.publish('lod.quality_increased', { gridResolution: this.gridResolution, fps: avgFPS }, { source_layer: 3 });
    }
  }

  /** Check if a layer should update this tick */
  shouldUpdate(layerName, tick) {
    const freq = this.updateFrequencies[layerName] ?? 1;
    return tick % freq === 0;
  }

  /** Check if a position is within the current viewport */
  isVisible(x, y) {
    return x >= this.viewportX && x < this.viewportX + this.viewportWidth / this.currentZoom &&
           y >= this.viewportY && y < this.viewportY + this.viewportHeight / this.currentZoom;
  }

  setAdaptiveThrottling(enabled) { this._adaptiveEnabled = enabled; }

  serialize() {
    return { gridResolution: this.gridResolution, updateFrequencies: { ...this.updateFrequencies } };
  }

  deserialize(state) {
    if (!state) return;
    this.gridResolution = state.gridResolution ?? 2048;
    Object.assign(this.updateFrequencies, state.updateFrequencies ?? {});
  }
}

export default LODManager;
