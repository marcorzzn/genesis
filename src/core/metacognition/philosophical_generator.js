/**
 * @module PhilosophicalGenerator
 * @description Generates philosophical questions and proto-scientific hypotheses
 * from accumulated abstract thoughts. Seeds new belief systems and inquiry.
 */

import eventBus from '../meta/event_bus.js';

export class PhilosophicalGenerator {
  constructor() {
    this.questions = [];
    this.hypotheses = [];
  }

  generateFromThoughts(agentId, abstractThoughts, simTime) {
    if (abstractThoughts.length < 3) return null;
    // Determine if this yields a question or hypothesis
    if (Math.random() < 0.6) {
      const q = this._generateQuestion(abstractThoughts);
      this.questions.push({ agentId, content: q, timestamp: simTime });
      eventBus.publish('metacognition.philosophical_question', { agentId, question: q, timestamp: simTime }, { source_layer: 5 });
      return { type: 'question', content: q };
    } else {
      const h = this._generateHypothesis(abstractThoughts);
      this.hypotheses.push({ agentId, content: h, timestamp: simTime, tested: false, confirmed: false });
      eventBus.publish('metacognition.hypothesis', { agentId, hypothesis: h, timestamp: simTime }, { source_layer: 5 });
      return { type: 'hypothesis', content: h };
    }
  }

  _generateQuestion(thoughts) {
    const categories = [
      ['existence', ['Why do I exist?', 'What is the purpose of life?', 'Is there meaning beyond survival?']],
      ['nature', ['What causes storms?', 'Why does fire consume?', 'What makes the seasons change?']],
      ['social', ['Why do some lead and others follow?', 'Is trade fair?', 'Can enemies become friends?']],
      ['metaphysical', ['What happens after death?', 'Do the divine ones watch us?', 'Is the world all there is?']]
    ];
    const cat = categories[Math.floor(Math.random() * categories.length)];
    return cat[1][Math.floor(Math.random() * cat[1].length)];
  }

  _generateHypothesis(thoughts) {
    const templates = [
      'If we plant seeds, food may grow predictably',
      'Fire can be controlled if we understand its needs',
      'The movement of stars may predict the seasons',
      'Mixing certain herbs may cure sickness',
      'Building walls may protect from predators',
      'Those who cooperate thrive more than those who do not'
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  getStats() {
    return { totalQuestions: this.questions.length, totalHypotheses: this.hypotheses.length,
      confirmedHypotheses: this.hypotheses.filter(h => h.confirmed).length };
  }

  serialize() { return { questions: this.questions.slice(-100), hypotheses: this.hypotheses.slice(-50) }; }
  deserialize(state) { if (state) { this.questions = state.questions ?? []; this.hypotheses = state.hypotheses ?? []; } }
}

export default PhilosophicalGenerator;
