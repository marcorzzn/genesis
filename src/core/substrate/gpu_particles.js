/**
 * @module GPUParticles
 * @description GPU particle system wrapper for Level 1 substrate.
 * Manages particle emission, lifetime, and force fields for fluid-like dynamics.
 */

import eventBus from '../meta/event_bus.js';

export class GPUParticles {
  constructor(substrate) {
    this.substrate = substrate;
    this.maxParticles = 100000;
    this.emitters = [];
    this.forceFields = [];
  }

  addEmitter(x, y, rate, spread = 0.1, lifetime = 5.0) {
    const emitter = { x, y, rate, spread, lifetime, active: true, id: this.emitters.length };
    this.emitters.push(emitter);
    return emitter.id;
  }

  removeEmitter(id) {
    if (id >= 0 && id < this.emitters.length) this.emitters[id].active = false;
  }

  addForceField(x, y, strength, radius) {
    this.forceFields.push({ x, y, strength, radius });
  }

  getParticleCount() { return this.maxParticles; }

  serialize() {
    return { emitters: this.emitters.filter(e => e.active), forceFields: this.forceFields };
  }

  deserialize(state) {
    if (!state) return;
    this.emitters = state.emitters ?? [];
    this.forceFields = state.forceFields ?? [];
  }
}

export default GPUParticles;
