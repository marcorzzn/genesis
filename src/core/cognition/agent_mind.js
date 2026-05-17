/**
 * @module AgentMind
 * @description Cognitive architecture for sentient agents (Level 4).
 * Combines Behavior Trees, Maslow needs hierarchy, emotional state,
 * memory stream, and optional LLM bridge for decision-making.
 */

import { MemoryStream } from './memory_stream.js';
import eventBus from '../meta/event_bus.js';

/** Maslow need levels */
const NEEDS = ['physiological', 'safety', 'belonging', 'esteem', 'self_actualization'];

export class AgentMind {
  /**
   * @param {string} id
   * @param {Object} [options]
   */
  constructor(id, options = {}) {
    this.id = id;
    this.name = options.name ?? `Agent_${id}`;
    this.memory = new MemoryStream(options.memoryCapacity ?? 200);

    // Emotional state (0-1 each)
    this.emotions = { joy: 0.5, fear: 0.0, anger: 0.0, surprise: 0.0, sadness: 0.0, disgust: 0.0 };

    // Mood: integral of recent emotional experiences with exponential decay
    this.mood = 0.5; // -1 (miserable) to 1 (ecstatic)

    // Maslow needs (0 = fully satisfied, 1 = desperate)
    this.needs = { physiological: 0.5, safety: 0.3, belonging: 0.6, esteem: 0.7, self_actualization: 0.9 };

    // Social
    this.socialBonds = new Map(); // agentId -> { trust, familiarity, lastInteraction }
    this.profession = null;
    this.clan = null;
    this.leader = null;

    // Language
    this.languageId = options.languageId ?? 0;
    this.knownLanguages = new Set([this.languageId]);

    // Beliefs
    this.beliefs = new Map(); // beliefId -> { content, confidence, source }

    // Behavior tree state
    this.currentBehavior = 'idle';
    this.behaviorTimer = 0;
    this.actionQueue = [];

    // LLM bridge (pluggable)
    this.llmBridge = null;

    // Stats
    this.decisionsTotal = 0;
    this.age = 0;
    this.reflectionDepth = 0;
  }

  /** Run one cognitive cycle */
  tick(environment, simTime) {
    this.age++;
    this._updateNeeds(environment);
    this._decayEmotions();
    this._updateMood();

    // Decide behavior based on highest priority need
    const urgentNeed = this._getUrgentNeed();
    const behavior = this._selectBehavior(urgentNeed, environment);
    this.currentBehavior = behavior;
    this.decisionsTotal++;

    return behavior;
  }

  _getUrgentNeed() {
    let maxNeed = '', maxValue = -1;
    for (const [need, value] of Object.entries(this.needs)) {
      if (value > maxValue) { maxValue = value; maxNeed = need; }
    }
    return maxNeed;
  }

  _selectBehavior(urgentNeed, env) {
    switch (urgentNeed) {
      case 'physiological':
        return this.needs.physiological > 0.7 ? 'forage' : 'rest';
      case 'safety':
        return this.emotions.fear > 0.5 ? 'flee' : 'patrol';
      case 'belonging':
        return 'socialize';
      case 'esteem':
        return this.profession ? 'work' : 'learn_profession';
      case 'self_actualization':
        return 'reflect';
      default:
        return 'explore';
    }
  }

  _updateNeeds(env) {
    // Physiological: hunger increases over time
    this.needs.physiological = Math.min(1, this.needs.physiological + 0.001);
    // Safety: influenced by nearby threats
    this.needs.safety = Math.min(1, this.needs.safety + (this.emotions.fear > 0.3 ? 0.01 : -0.005));
    // Belonging: influenced by social bond count
    const bondCount = this.socialBonds.size;
    this.needs.belonging = Math.max(0, 1 - bondCount * 0.1);
    // Esteem: influenced by profession
    this.needs.esteem = this.profession ? Math.max(0, this.needs.esteem - 0.001) : Math.min(1, this.needs.esteem + 0.001);
    // Self-actualization: constant drive
    this.needs.self_actualization = Math.min(1, this.needs.self_actualization + 0.0005);
  }

  _decayEmotions() {
    const decay = 0.98;
    for (const key of Object.keys(this.emotions)) {
      this.emotions[key] *= decay;
      if (key === 'joy') this.emotions[key] = Math.max(0.1, this.emotions[key]); // baseline joy
    }
  }

  _updateMood() {
    const emotionalBalance = (this.emotions.joy + this.emotions.surprise * 0.3) -
      (this.emotions.fear + this.emotions.anger + this.emotions.sadness + this.emotions.disgust) * 0.5;
    this.mood = this.mood * 0.95 + emotionalBalance * 0.05; // exponential moving average
    this.mood = Math.max(-1, Math.min(1, this.mood));
  }

  /** React to an event (stimulus) */
  perceive(eventType, data, simTime) {
    // Generate emotional response
    switch (eventType) {
      case 'food_found':
        this.emotions.joy += 0.3;
        this.needs.physiological = Math.max(0, this.needs.physiological - data.amount * 0.1);
        this.memory.add(`Found food at ${data.location}`, 0.4, { joy: 0.3 }, simTime);
        break;
      case 'threat_detected':
        this.emotions.fear += 0.5;
        this.needs.safety += 0.3;
        this.memory.add(`Threat from ${data.source}`, 0.7, { fear: 0.5 }, simTime);
        break;
      case 'social_interaction':
        this.emotions.joy += 0.2;
        this._updateSocialBond(data.agentId, 0.1, simTime);
        this.memory.add(`Met ${data.agentName}`, 0.3, { joy: 0.2 }, simTime);
        break;
      case 'divine_event':
        this.emotions.surprise += 0.8;
        this.emotions.fear += data.intensity * 0.5;
        this.memory.add(`Witnessed divine event: ${data.description}`, 1.0, { surprise: 0.8, fear: data.intensity * 0.5 }, simTime);
        break;
      case 'death_witnessed':
        this.emotions.sadness += 0.6;
        this.memory.add(`Witnessed death of ${data.name}`, 0.8, { sadness: 0.6 }, simTime);
        break;
    }
  }

  _updateSocialBond(agentId, trustDelta, simTime) {
    const existing = this.socialBonds.get(agentId) ?? { trust: 0, familiarity: 0, lastInteraction: 0 };
    existing.trust = Math.max(-1, Math.min(1, existing.trust + trustDelta));
    existing.familiarity += 0.1;
    existing.lastInteraction = simTime;
    this.socialBonds.set(agentId, existing);
  }

  /** Generate a structured state summary for the LLM bridge */
  generatePrompt(context) {
    const recentMemories = this.memory.getRecentMemories(10);
    return {
      name: this.name,
      age: this.age,
      mood: this.mood,
      emotions: { ...this.emotions },
      needs: { ...this.needs },
      profession: this.profession,
      beliefs: [...this.beliefs.entries()].map(([k, v]) => ({ id: k, ...v })),
      recentMemories: recentMemories.map(m => m.description),
      socialBonds: [...this.socialBonds.entries()].slice(0, 10).map(([id, b]) => ({ agentId: id, trust: b.trust })),
      context
    };
  }

  /** Set an optional LLM bridge for enhanced cognition */
  setLLMBridge(bridge) { this.llmBridge = bridge; }

  serialize() {
    return {
      id: this.id, name: this.name, emotions: { ...this.emotions },
      mood: this.mood, needs: { ...this.needs }, profession: this.profession,
      clan: this.clan, leader: this.leader, languageId: this.languageId,
      knownLanguages: [...this.knownLanguages],
      beliefs: [...this.beliefs.entries()],
      socialBonds: [...this.socialBonds.entries()],
      memory: this.memory.serialize(), age: this.age,
      currentBehavior: this.currentBehavior, reflectionDepth: this.reflectionDepth
    };
  }

  static deserialize(state) {
    const mind = new AgentMind(state.id, { name: state.name, languageId: state.languageId });
    Object.assign(mind.emotions, state.emotions ?? {});
    mind.mood = state.mood ?? 0.5;
    Object.assign(mind.needs, state.needs ?? {});
    mind.profession = state.profession;
    mind.clan = state.clan; mind.leader = state.leader;
    mind.knownLanguages = new Set(state.knownLanguages ?? [0]);
    mind.beliefs = new Map(state.beliefs ?? []);
    mind.socialBonds = new Map(state.socialBonds ?? []);
    mind.memory.deserialize(state.memory);
    mind.age = state.age ?? 0;
    mind.currentBehavior = state.currentBehavior ?? 'idle';
    mind.reflectionDepth = state.reflectionDepth ?? 0;
    return mind;
  }
}

export default AgentMind;
