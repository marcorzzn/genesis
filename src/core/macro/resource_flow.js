/**
 * @module ResourceFlow
 * @description Inter-regional resource diffusion with transport costs.
 */

export class ResourceFlow {
  constructor(worldGen) {
    this.world = worldGen;
    this.resourceGrid = null;
    this.diffusionRate = 0.01;
  }

  init() {
    const size = this.world.width * this.world.height;
    this.resourceGrid = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      this.resourceGrid[i] = this.world.resourceMap[i];
    }
  }

  /** Diffuse resources between adjacent cells */
  tick() {
    if (!this.resourceGrid) return;
    const w = this.world.width, h = this.world.height;
    const next = new Float32Array(this.resourceGrid);

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const neighbors = [
          this.resourceGrid[(y - 1) * w + x],
          this.resourceGrid[(y + 1) * w + x],
          this.resourceGrid[y * w + (x - 1)],
          this.resourceGrid[y * w + (x + 1)]
        ];
        const avg = neighbors.reduce((s, v) => s + v, 0) / 4;
        const diff = (avg - this.resourceGrid[idx]) * this.diffusionRate;
        // Transport cost: mountainous terrain slows diffusion
        const terrainFactor = 1 - Math.max(0, this.world.heightMap[idx] - 0.3);
        next[idx] += diff * terrainFactor;
      }
    }
    this.resourceGrid = next;
  }

  getResourceAt(x, y) {
    if (!this.resourceGrid) return 0;
    const wx = ((Math.floor(x) % this.world.width) + this.world.width) % this.world.width;
    const wy = ((Math.floor(y) % this.world.height) + this.world.height) % this.world.height;
    return this.resourceGrid[wy * this.world.width + wx];
  }

  addResource(x, y, amount) {
    if (!this.resourceGrid) return;
    const wx = ((Math.floor(x) % this.world.width) + this.world.width) % this.world.width;
    const wy = ((Math.floor(y) % this.world.height) + this.world.height) % this.world.height;
    this.resourceGrid[wy * this.world.width + wx] += amount;
  }

  consumeResource(x, y, amount) {
    if (!this.resourceGrid) return 0;
    const wx = ((Math.floor(x) % this.world.width) + this.world.width) % this.world.width;
    const wy = ((Math.floor(y) % this.world.height) + this.world.height) % this.world.height;
    const idx = wy * this.world.width + wx;
    const available = Math.min(this.resourceGrid[idx], amount);
    this.resourceGrid[idx] -= available;
    return available;
  }

  serialize() { return { diffusionRate: this.diffusionRate }; }
  deserialize(state) { if (state) this.diffusionRate = state.diffusionRate ?? 0.01; }
}

export default ResourceFlow;
