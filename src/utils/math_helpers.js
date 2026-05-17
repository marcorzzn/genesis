/**
 * @module MathHelpers
 * @description Shared mathematical utilities for Genesis simulation.
 */

/** @param {number} v @param {number} min @param {number} max @returns {number} */
export function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }

/** @param {number} a @param {number} b @param {number} t @returns {number} */
export function lerp(a, b, t) { return a + (b - a) * t; }

/** @param {number} v @param {number} inMin @param {number} inMax @param {number} outMin @param {number} outMax @returns {number} */
export function mapRange(v, inMin, inMax, outMin, outMax) {
  return outMin + ((v - inMin) / (inMax - inMin)) * (outMax - outMin);
}

/** @param {number} x @param {number} k @returns {number} Sigmoid 0..1 */
export function sigmoid(x, k = 1) { return 1 / (1 + Math.exp(-k * x)); }

/** @param {number} t @param {number} lambda @returns {number} */
export function exponentialDecay(t, lambda) { return Math.exp(-lambda * t); }

/** @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 @returns {number} */
export function distance(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/** @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 @returns {number} */
export function distanceSq(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  return dx * dx + dy * dy;
}

/** Toroidal distance on a wrapped grid */
export function toroidalDistance(x1, y1, x2, y2, width, height) {
  let dx = Math.abs(x2 - x1);
  let dy = Math.abs(y2 - y1);
  if (dx > width / 2) dx = width - dx;
  if (dy > height / 2) dy = height - dy;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Cosine similarity between two arrays */
export function cosineSimilarity(a, b) {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; magA += a[i] * a[i]; magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/** Shannon diversity index for an array of counts */
export function shannonIndex(counts) {
  const total = counts.reduce((s, c) => s + c, 0);
  if (total === 0) return 0;
  let h = 0;
  for (const c of counts) {
    if (c > 0) { const p = c / total; h -= p * Math.log2(p); }
  }
  return h;
}

/** Simple seeded PRNG (xoshiro128**) */
export class SeededRandom {
  constructor(seed = 42) {
    this.s = new Uint32Array(4);
    this.s[0] = seed >>> 0;
    this.s[1] = (seed * 1664525 + 1013904223) >>> 0;
    this.s[2] = (this.s[1] * 1664525 + 1013904223) >>> 0;
    this.s[3] = (this.s[2] * 1664525 + 1013904223) >>> 0;
  }

  next() {
    const s = this.s;
    const result = (((s[1] * 5) << 7 | (s[1] * 5) >>> 25) * 9) >>> 0;
    const t = s[1] << 9;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
    s[2] ^= t; s[3] = (s[3] << 11 | s[3] >>> 21);
    return result / 4294967296;
  }

  nextInt(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; }
  nextFloat(min, max) { return min + this.next() * (max - min); }
  nextBool(prob = 0.5) { return this.next() < prob; }

  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  gaussian(mean = 0, std = 1) {
    const u1 = this.next() || 1e-10;
    const u2 = this.next();
    return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

/** Memory score with emotional decay: M(t) = w_r·e^(-λt) + w_v·cos(θ) + w_i·I + w_c·C */
export function memoryScore(recency, semanticCosine, emotionalIntensity, contextCongruence, t, params = {}) {
  const wr = params.wr ?? 1.0, wv = params.wv ?? 1.0, wi = params.wi ?? 0.5, wc = params.wc ?? 0.3;
  const lambda = params.lambda ?? 0.01;
  return wr * Math.exp(-lambda * t) + wv * semanticCosine + wi * emotionalIntensity + wc * contextCongruence;
}

/** Bass diffusion model: F(t) = (p + q·A(t)/M)·(M - A(t)) */
export function bassDiffusion(adopters, totalPop, innovationRate, imitationRate) {
  if (totalPop <= 0) return 0;
  return (innovationRate + imitationRate * (adopters / totalPop)) * (totalPop - adopters);
}
