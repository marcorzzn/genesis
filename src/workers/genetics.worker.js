/**
 * @module GeneticsWorker
 * @description Web Worker for offloading genetic computation (speciation, crossover, mutation).
 */

self.onmessage = function(e) {
  const { type, data } = e.data;

  switch (type) {
    case 'evaluate_fitness': {
      const results = data.entities.map(entity => ({
        id: entity.id,
        fitness: entity.energy * 0.3 + entity.age * 0.1 + (entity.alive ? 50 : 0)
      }));
      self.postMessage({ type: 'fitness_results', data: results });
      break;
    }

    case 'calculate_distances': {
      const { entities, threshold } = data;
      const pairs = [];
      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const dx = entities[i].x - entities[j].x;
          const dy = entities[i].y - entities[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < threshold) {
            pairs.push({ a: entities[i].id, b: entities[j].id, distance: dist });
          }
        }
      }
      self.postMessage({ type: 'distance_results', data: pairs });
      break;
    }

    default:
      console.warn('[GeneticsWorker] Unknown message type:', type);
  }
};
