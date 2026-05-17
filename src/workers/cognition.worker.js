/**
 * @module CognitionWorker
 * @description Web Worker for cognitive agent processing (memory retrieval, decisions).
 */

self.onmessage = function(e) {
  const { type, data } = e.data;

  switch (type) {
    case 'process_decisions': {
      const results = data.agents.map(agent => {
        // Simplified decision making in worker
        const urgentNeed = Object.entries(agent.needs)
          .sort((a, b) => b[1] - a[1])[0];
        return {
          agentId: agent.id,
          decision: urgentNeed ? urgentNeed[0] : 'idle',
          urgency: urgentNeed ? urgentNeed[1] : 0
        };
      });
      self.postMessage({ type: 'decision_results', data: results });
      break;
    }

    default:
      console.warn('[CognitionWorker] Unknown message type:', type);
  }
};
