/**
 * @module TheoryOfMind
 * @description BDI (Belief-Desire-Intention) models of other agents.
 * Enables strategic deception, cooperation, and social prediction.
 */

export class TheoryOfMind {
  constructor() {
    this.models = new Map(); // agentId -> Map<otherAgentId, { beliefs, desires, intentions }>
    this.maxRecursionDepth = 3;
  }

  /** Build/update a mental model of another agent */
  updateModel(observerId, targetId, observedBehavior, observedEmotion) {
    if (!this.models.has(observerId)) this.models.set(observerId, new Map());
    const myModels = this.models.get(observerId);

    const existing = myModels.get(targetId) ?? { beliefs: [], desires: [], intentions: [], accuracy: 0.5, observations: 0 };

    // Infer desires from behavior
    const inferredDesire = this._inferDesire(observedBehavior);
    if (inferredDesire && !existing.desires.includes(inferredDesire)) {
      existing.desires.push(inferredDesire);
      if (existing.desires.length > 5) existing.desires.shift();
    }

    // Infer intentions from desires + emotions
    const inferredIntention = this._inferIntention(inferredDesire, observedEmotion);
    if (inferredIntention) {
      existing.intentions = [inferredIntention, ...existing.intentions.slice(0, 4)];
    }

    existing.observations++;
    existing.accuracy = Math.min(0.9, 0.3 + existing.observations * 0.05);
    myModels.set(targetId, existing);
  }

  /** Predict what another agent will do next */
  predictBehavior(observerId, targetId) {
    const myModels = this.models.get(observerId);
    if (!myModels) return null;
    const model = myModels.get(targetId);
    if (!model || model.intentions.length === 0) return null;

    return {
      predictedAction: model.intentions[0],
      confidence: model.accuracy,
      basedOnObservations: model.observations
    };
  }

  /** Recursive theory of mind: "I think they think I think..." */
  getRecursiveModel(agentId, targetId, depth = 1) {
    if (depth > this.maxRecursionDepth) return null;

    const directModel = this.models.get(agentId)?.get(targetId);
    if (!directModel || depth <= 1) return directModel;

    // What does the target think about me?
    const reverseModel = this.models.get(targetId)?.get(agentId);
    return {
      ...directModel,
      theirModelOfMe: reverseModel,
      recursionDepth: depth,
      canDeceive: depth >= 2 && directModel.accuracy > 0.6
    };
  }

  _inferDesire(behavior) {
    const desireMap = {
      'forage': 'hunger_satiation', 'flee': 'safety', 'socialize': 'companionship',
      'work': 'productivity', 'explore': 'curiosity', 'reflect': 'understanding',
      'rest': 'energy', 'patrol': 'security', 'trade': 'wealth'
    };
    return desireMap[behavior] ?? null;
  }

  _inferIntention(desire, emotion) {
    if (!desire) return null;
    if (desire === 'safety' && emotion?.fear > 0.5) return 'will_flee';
    if (desire === 'hunger_satiation') return 'will_forage';
    if (desire === 'companionship') return 'will_approach';
    if (desire === 'wealth') return 'will_trade';
    return 'will_continue';
  }

  serialize() {
    const data = [];
    for (const [agentId, models] of this.models) {
      data.push([agentId, [...models.entries()]]);
    }
    return { models: data };
  }

  deserialize(state) {
    if (!state) return;
    this.models.clear();
    for (const [agentId, entries] of (state.models ?? [])) {
      this.models.set(agentId, new Map(entries));
    }
  }
}

export default TheoryOfMind;
