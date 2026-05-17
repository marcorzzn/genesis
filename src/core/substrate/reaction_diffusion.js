/**
 * @module ReactionDiffusion
 * @description High-level wrapper for Gray-Scott reaction-diffusion system.
 * Delegates GPU computation to SubstrateEngine but provides a specialized
 * API for biological pattern formation queries used by Level 2.
 */

import eventBus from '../meta/event_bus.js';

export class ReactionDiffusion {
  /** @param {import('./cellular_automata.js').SubstrateEngine} substrate */
  constructor(substrate) {
    this.substrate = substrate;
    this.presets = {
      mitosis:    { feed: 0.0367, kill: 0.0649 },
      coral:      { feed: 0.0545, kill: 0.062 },
      spirals:    { feed: 0.014,  kill: 0.054 },
      spots:      { feed: 0.03,   kill: 0.062 },
      maze:       { feed: 0.029,  kill: 0.057 },
      worms:      { feed: 0.078,  kill: 0.061 },
      bubbles:    { feed: 0.012,  kill: 0.05 },
      chaos:      { feed: 0.026,  kill: 0.051 }
    };
  }

  applyPreset(name) {
    const preset = this.presets[name];
    if (!preset) return;
    this.substrate.setUniforms({ feedRate: preset.feed, killRate: preset.kill });
    eventBus.publish('substrate.rd_preset', { name, ...preset }, { source_layer: 1 });
  }

  getConcentrationAt(x, y) {
    const map = this.substrate.getEnergyMap(x, y, 1, 1);
    if (!map) return { u: 0, v: 0 };
    return { u: map.data[0], v: map.data[1] };
  }

  getRegionStats(x, y, w, h) {
    const map = this.substrate.getEnergyMap(x, y, w, h);
    if (!map) return { avgU: 0, avgV: 0, maxV: 0 };
    let sumU = 0, sumV = 0, maxV = 0;
    const count = map.width * map.height;
    for (let i = 0; i < count; i++) {
      sumU += map.data[i * 4];
      sumV += map.data[i * 4 + 1];
      if (map.data[i * 4 + 1] > maxV) maxV = map.data[i * 4 + 1];
    }
    return { avgU: sumU / count, avgV: sumV / count, maxV };
  }

  getPresetNames() { return Object.keys(this.presets); }
}

export default ReactionDiffusion;
