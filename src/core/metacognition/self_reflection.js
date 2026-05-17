/**
 * @module SelfReflection
 * @description Meta-cognitive self-reflection for advanced agents.
 * Generates abstract thoughts, generalizations, and philosophical questions.
 */

import eventBus from '../meta/event_bus.js';

export class SelfReflection {
  constructor() {
    this.abstractThoughts = new Map(); // agentId -> thoughts[]
    this.reflectionThreshold = 50; // NEAT complexity threshold
    this.reflectionInterval = 200; // ticks between reflections
  }

  /** Check if an agent qualifies for self-reflection */
  canReflect(agent) {
    return agent.network && agent.network.getComplexity() >= this.reflectionThreshold;
  }

  /** Generate abstract thought from concrete experiences */
  reflect(agent, simTime) {
    if (!this.canReflect(agent)) return null;

    const recentMemories = agent.mind?.memory?.getRecentMemories(5) ?? [];
    if (recentMemories.length < 2) return null;

    // Find patterns in recent memories
    const thought = this._generateAbstraction(recentMemories, agent.id);
    if (thought) {
      if (!this.abstractThoughts.has(agent.id)) {
        this.abstractThoughts.set(agent.id, []);
      }
      this.abstractThoughts.get(agent.id).push({ content: thought, timestamp: simTime });

      eventBus.publish('metacognition.abstract_thought', {
        agentId: agent.id, thought, timestamp: simTime
      }, { source_layer: 5 });

      // Check if enough thoughts for philosophical questions
      const thoughts = this.abstractThoughts.get(agent.id);
      if (thoughts.length >= 5 && thoughts.length % 5 === 0) {
        return this._generatePhilosophicalQuestion(thoughts, agent.id, simTime);
      }
    }

    return thought;
  }

  _generateAbstraction(memories, agentId) {
    // Pattern matching: look for repeating themes
    const themes = {};
    for (const mem of memories) {
      const words = mem.description.toLowerCase().split(/\s+/);
      for (const w of words) {
        if (w.length > 3) themes[w] = (themes[w] ?? 0) + 1;
      }
    }

    const topTheme = Object.entries(themes).sort((a, b) => b[1] - a[1])[0];
    if (!topTheme || topTheme[1] < 2) return null;

    const abstractions = [
      `Patterns repeat: ${topTheme[0]} appears consistently in my experiences`,
      `I notice a connection between events involving ${topTheme[0]}`,
      `Perhaps ${topTheme[0]} follows rules I do not yet understand`,
      `My experiences with ${topTheme[0]} suggest an underlying order`,
      `The recurrence of ${topTheme[0]} cannot be mere chance`
    ];

    return abstractions[Math.floor(Math.random() * abstractions.length)];
  }

  _generatePhilosophicalQuestion(thoughts, agentId, simTime) {
    const questions = [
      'Why do things exist rather than nothing?',
      'What controls the forces of nature?',
      'Do others experience the world as I do?',
      'Is there a purpose to our existence?',
      'What lies beyond the edges of the world?',
      'Why do some die while others live?',
      'Can we change the order of things?',
      'Is our fate determined or can we choose?',
      'What are the stars, and why do they move?',
      'Are we alone in thinking about our thinking?'
    ];

    const question = questions[Math.floor(Math.random() * questions.length)];
    eventBus.publish('metacognition.philosophical_question', {
      agentId, question, timestamp: simTime, thoughtCount: thoughts.length
    }, { source_layer: 5, priority: 6 });

    return question;
  }

  getThoughtCount(agentId) {
    return this.abstractThoughts.get(agentId)?.length ?? 0;
  }

  getAllPhilosophicalQuestions() {
    const questions = [];
    // Collected from event bus history
    return questions;
  }

  serialize() {
    return { abstractThoughts: [...this.abstractThoughts.entries()].map(([id, t]) => [id, t.slice(-20)]) };
  }

  deserialize(state) {
    if (!state) return;
    this.abstractThoughts = new Map(state.abstractThoughts ?? []);
  }
}

export default SelfReflection;
