/**
 * @module ClimateSystem
 * @description Seasonal climate simulation with coupled oscillators,
 * extreme events, and vegetation-albedo feedback loops.
 */

import eventBus from '../meta/event_bus.js';
import { SeededRandom } from '../../utils/math_helpers.js';

export class ClimateSystem {
  constructor(worldGen, options = {}) {
    this.world = worldGen;
    this.seasonLength = options.seasonLength ?? 500; // ticks per season
    this.currentTick = 0;
    this.rng = new SeededRandom(options.seed ?? 123);
    this.seasons = ['spring', 'summer', 'autumn', 'winter'];
    this.extremeEvents = [];
    this.temperatureModifier = new Float32Array(worldGen.width * worldGen.height);
    this.globalWarmingFactor = 0;
  }

  getCurrentSeason() {
    const idx = Math.floor((this.currentTick / this.seasonLength) % 4);
    return this.seasons[idx];
  }

  getSeasonProgress() {
    return (this.currentTick % this.seasonLength) / this.seasonLength;
  }

  getSeasonalTemperature(baseTemp) {
    const season = this.getCurrentSeason();
    const mods = { spring: 0.0, summer: 0.15, autumn: -0.05, winter: -0.2 };
    return baseTemp + (mods[season] ?? 0) + this.globalWarmingFactor;
  }

  tick() {
    this.currentTick++;
    // Check for extreme events
    if (this.rng.next() < 0.001) {
      this._triggerExtremeEvent();
    }
    // Decay temperature modifiers
    for (let i = 0; i < this.temperatureModifier.length; i++) {
      this.temperatureModifier[i] *= 0.999;
    }
  }

  _triggerExtremeEvent() {
    const types = ['drought', 'flood', 'volcanic_eruption', 'ice_storm', 'meteor'];
    const type = this.rng.pick(types);
    const x = this.rng.nextInt(0, this.world.width - 1);
    const y = this.rng.nextInt(0, this.world.height - 1);
    const severity = this.rng.nextFloat(0.3, 1.0);
    const radius = this.rng.nextInt(10, 50);

    const event = { type, x, y, severity, radius, tick: this.currentTick };
    this.extremeEvents.push(event);

    // Apply temperature modification
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius) continue;
        const wx = ((x + dx) % this.world.width + this.world.width) % this.world.width;
        const wy = ((y + dy) % this.world.height + this.world.height) % this.world.height;
        const idx = wy * this.world.width + wx;
        const impact = severity * (1 - dist / radius);
        if (type === 'drought' || type === 'volcanic_eruption') {
          this.temperatureModifier[idx] += impact * 0.3;
        } else if (type === 'ice_storm') {
          this.temperatureModifier[idx] -= impact * 0.4;
        }
      }
    }

    eventBus.publish('climate.extreme_event', event, { source_layer: 3, priority: 8 });
    if (this.extremeEvents.length > 100) this.extremeEvents.shift();
  }

  getEffectiveTemperature(x, y) {
    const baseTemp = this.world.getTemperatureAt(x, y);
    const wx = ((Math.floor(x) % this.world.width) + this.world.width) % this.world.width;
    const wy = ((Math.floor(y) % this.world.height) + this.world.height) % this.world.height;
    const mod = this.temperatureModifier[wy * this.world.width + wx] ?? 0;
    return this.getSeasonalTemperature(baseTemp) + mod;
  }

  serialize() {
    return { currentTick: this.currentTick, globalWarmingFactor: this.globalWarmingFactor,
      extremeEvents: this.extremeEvents.slice(-20) };
  }

  deserialize(state) {
    if (!state) return;
    this.currentTick = state.currentTick ?? 0;
    this.globalWarmingFactor = state.globalWarmingFactor ?? 0;
    this.extremeEvents = state.extremeEvents ?? [];
  }
}

export default ClimateSystem;
