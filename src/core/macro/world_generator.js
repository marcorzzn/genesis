/**
 * @module WorldGenerator
 * @description Procedural world generation using fractal Simplex noise.
 * Generates biomes from 3 axes: altitude, humidity, temperature.
 * Supports toroidal wrapping for planetary simulation.
 */

import { createNoise2D } from 'simplex-noise';
import { SeededRandom } from '../../utils/math_helpers.js';
import eventBus from '../meta/event_bus.js';

export const BiomeType = {
  DEEP_OCEAN: 0, OCEAN: 1, BEACH: 2, GRASSLAND: 3, FOREST: 4,
  JUNGLE: 5, DESERT: 6, TUNDRA: 7, MOUNTAIN: 8, SNOW_PEAK: 9,
  SWAMP: 10, SAVANNA: 11
};

export const BiomeColors = {
  [BiomeType.DEEP_OCEAN]: [10, 20, 80],
  [BiomeType.OCEAN]: [20, 50, 120],
  [BiomeType.BEACH]: [194, 178, 128],
  [BiomeType.GRASSLAND]: [86, 152, 50],
  [BiomeType.FOREST]: [34, 100, 34],
  [BiomeType.JUNGLE]: [20, 80, 20],
  [BiomeType.DESERT]: [194, 164, 80],
  [BiomeType.TUNDRA]: [160, 180, 190],
  [BiomeType.MOUNTAIN]: [120, 110, 100],
  [BiomeType.SNOW_PEAK]: [230, 235, 240],
  [BiomeType.SWAMP]: [60, 90, 50],
  [BiomeType.SAVANNA]: [160, 150, 60]
};

export class WorldGenerator {
  constructor(options = {}) {
    this.width = options.width ?? 512;
    this.height = options.height ?? 512;
    this.seed = options.seed ?? 42;

    const rng = new SeededRandom(this.seed);
    const alea = () => rng.next();
    this.noiseAlt = createNoise2D(alea);
    this.noiseHum = createNoise2D(() => rng.next());
    this.noiseTemp = createNoise2D(() => rng.next());

    this.heightMap = null;
    this.humidityMap = null;
    this.temperatureMap = null;
    this.biomeMap = null;
    this.resourceMap = null;

    this.octaves = options.octaves ?? 8;
    this.lacunarity = options.lacunarity ?? 2.0;
    this.persistence = options.persistence ?? 0.5;
  }

  /** Generate all terrain maps */
  generate() {
    const size = this.width * this.height;
    this.heightMap = new Float32Array(size);
    this.humidityMap = new Float32Array(size);
    this.temperatureMap = new Float32Array(size);
    this.biomeMap = new Uint8Array(size);
    this.resourceMap = new Float32Array(size);

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = y * this.width + x;
        const nx = x / this.width;
        const ny = y / this.height;

        this.heightMap[idx] = this._fbm(this.noiseAlt, nx, ny);
        this.humidityMap[idx] = this._fbm(this.noiseHum, nx + 100, ny + 100) * 0.5 + 0.5;
        // Temperature: base from latitude gradient + noise
        const latGradient = 1.0 - Math.abs(ny - 0.5) * 2;
        this.temperatureMap[idx] = latGradient * 0.7 + this._fbm(this.noiseTemp, nx + 200, ny + 200) * 0.3;
        // Altitude reduces temperature
        const alt = this.heightMap[idx];
        this.temperatureMap[idx] -= Math.max(0, alt - 0.5) * 0.6;

        this.biomeMap[idx] = this._classifyBiome(alt, this.humidityMap[idx], this.temperatureMap[idx]);
        this.resourceMap[idx] = this._calculateResources(this.biomeMap[idx], this.humidityMap[idx]);
      }
    }

    eventBus.publish('world.generated', {
      width: this.width, height: this.height, seed: this.seed
    }, { source_layer: 3 });
  }

  /** Fractal Brownian Motion */
  _fbm(noise, x, y) {
    let value = 0, amplitude = 1, frequency = 1, maxAmp = 0;
    for (let i = 0; i < this.octaves; i++) {
      // Toroidal wrapping via circular coordinates
      const angle1 = x * Math.PI * 2;
      const angle2 = y * Math.PI * 2;
      const nx = Math.cos(angle1) * frequency;
      const ny = Math.sin(angle1) * frequency;
      const nz = Math.cos(angle2) * frequency;
      const nw = Math.sin(angle2) * frequency;
      // Use 2D noise with mapped coordinates for seamless wrapping
      value += noise(nx + nz, ny + nw) * amplitude;
      maxAmp += amplitude;
      amplitude *= this.persistence;
      frequency *= this.lacunarity;
    }
    return value / maxAmp;
  }

  _classifyBiome(altitude, humidity, temperature) {
    if (altitude < -0.3) return BiomeType.DEEP_OCEAN;
    if (altitude < -0.05) return BiomeType.OCEAN;
    if (altitude < 0.02) return BiomeType.BEACH;
    if (altitude > 0.7) return BiomeType.SNOW_PEAK;
    if (altitude > 0.5) return BiomeType.MOUNTAIN;
    if (temperature < 0.2) return BiomeType.TUNDRA;
    if (temperature > 0.7 && humidity < 0.3) return BiomeType.DESERT;
    if (temperature > 0.7 && humidity > 0.7) return BiomeType.JUNGLE;
    if (temperature > 0.5 && humidity < 0.4) return BiomeType.SAVANNA;
    if (humidity > 0.7 && altitude < 0.15) return BiomeType.SWAMP;
    if (humidity > 0.5) return BiomeType.FOREST;
    return BiomeType.GRASSLAND;
  }

  _calculateResources(biome, humidity) {
    const baseResources = {
      [BiomeType.DEEP_OCEAN]: 0.1, [BiomeType.OCEAN]: 0.3, [BiomeType.BEACH]: 0.4,
      [BiomeType.GRASSLAND]: 0.7, [BiomeType.FOREST]: 0.9, [BiomeType.JUNGLE]: 1.0,
      [BiomeType.DESERT]: 0.1, [BiomeType.TUNDRA]: 0.2, [BiomeType.MOUNTAIN]: 0.3,
      [BiomeType.SNOW_PEAK]: 0.05, [BiomeType.SWAMP]: 0.6, [BiomeType.SAVANNA]: 0.5
    };
    return (baseResources[biome] ?? 0.5) * (0.5 + humidity * 0.5);
  }

  getBiomeAt(x, y) {
    const wx = ((x % this.width) + this.width) % this.width;
    const wy = ((y % this.height) + this.height) % this.height;
    return this.biomeMap[Math.floor(wy) * this.width + Math.floor(wx)];
  }

  getHeightAt(x, y) {
    const wx = ((x % this.width) + this.width) % this.width;
    const wy = ((y % this.height) + this.height) % this.height;
    return this.heightMap[Math.floor(wy) * this.width + Math.floor(wx)];
  }

  getResourceAt(x, y) {
    const wx = ((x % this.width) + this.width) % this.width;
    const wy = ((y % this.height) + this.height) % this.height;
    return this.resourceMap[Math.floor(wy) * this.width + Math.floor(wx)];
  }

  getTemperatureAt(x, y) {
    const wx = ((x % this.width) + this.width) % this.width;
    const wy = ((y % this.height) + this.height) % this.height;
    return this.temperatureMap[Math.floor(wy) * this.width + Math.floor(wx)];
  }

  getHumidityAt(x, y) {
    const wx = ((x % this.width) + this.width) % this.width;
    const wy = ((y % this.height) + this.height) % this.height;
    return this.humidityMap[Math.floor(wy) * this.width + Math.floor(wx)];
  }

  /** Generate image data for canvas rendering */
  getImageData() {
    const data = new Uint8ClampedArray(this.width * this.height * 4);
    for (let i = 0; i < this.width * this.height; i++) {
      const color = BiomeColors[this.biomeMap[i]] ?? [100, 100, 100];
      const shade = 0.6 + this.heightMap[i] * 0.4;
      data[i * 4] = Math.floor(color[0] * shade);
      data[i * 4 + 1] = Math.floor(color[1] * shade);
      data[i * 4 + 2] = Math.floor(color[2] * shade);
      data[i * 4 + 3] = 255;
    }
    return new ImageData(data, this.width, this.height);
  }

  serialize() {
    return { width: this.width, height: this.height, seed: this.seed,
      octaves: this.octaves, lacunarity: this.lacunarity, persistence: this.persistence };
  }

  deserialize(state) {
    if (!state) return;
    Object.assign(this, state);
    this.generate();
  }
}

export default WorldGenerator;
