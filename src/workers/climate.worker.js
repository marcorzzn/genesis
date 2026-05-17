/**
 * @module ClimateWorker
 * @description Web Worker for climate simulation calculations.
 */

self.onmessage = function(e) {
  const { type, data } = e.data;

  switch (type) {
    case 'compute_temperature': {
      const { width, height, season, baseTemps } = data;
      const result = new Float32Array(width * height);
      const seasonMod = { spring: 0.0, summer: 0.15, autumn: -0.05, winter: -0.2 };
      const mod = seasonMod[season] ?? 0;
      for (let i = 0; i < result.length; i++) {
        result[i] = baseTemps[i] + mod;
      }
      self.postMessage({ type: 'temperature_result', data: result }, [result.buffer]);
      break;
    }

    default:
      console.warn('[ClimateWorker] Unknown message type:', type);
  }
};
