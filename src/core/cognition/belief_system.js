/**
 * @module BeliefSystem
 * @description Emergent belief and religion system.
 * Agents generate explanations for unexplainable events, creating
 * myths, rituals, and religions that spread via social contagion (SIR model).
 */

import { bassDiffusion } from '../../utils/math_helpers.js';
import eventBus from '../meta/event_bus.js';

export class Belief {
  constructor(id, content, sourceAgentId, simTime) {
    this.id = id;
    this.content = content;
    this.sourceAgentId = sourceAgentId;
    this.createdAt = simTime;
    this.adherents = new Set();
    this.confidence = 0.5;
    this.type = 'myth'; // myth, ritual, law, science
    this.contradicts = []; // IDs of contradicting beliefs
  }
}

export class BeliefSystem {
  constructor() {
    this.beliefs = new Map();
    this.nextBeliefId = 0;
    this.religionClusters = []; // Groups of co-held beliefs
  }

  /** Create a belief from an unexplained event */
  generateBelief(agentId, eventDescription, simTime) {
    const templates = [
      `The sky-spirits caused ${eventDescription}`,
      `${eventDescription} is punishment for our sins`,
      `${eventDescription} marks the birth of a new era`,
      `The ancestors sent ${eventDescription} as a sign`,
      `${eventDescription} occurs when the world-serpent stirs`
    ];
    const content = templates[Math.floor(Math.random() * templates.length)];

    const belief = new Belief(this.nextBeliefId++, content, agentId, simTime);
    belief.adherents.add(agentId);
    this.beliefs.set(belief.id, belief);

    eventBus.publish('beliefs.created', { beliefId: belief.id, content, agentId }, { source_layer: 4 });
    return belief.id;
  }

  /** Spread beliefs through social interaction */
  spreadBelief(beliefId, targetAgentId, socialTrust) {
    const belief = this.beliefs.get(beliefId);
    if (!belief) return false;

    // Adoption probability based on trust, existing adherents, and total agents
    const adoptionProb = 0.1 + socialTrust * 0.3 + Math.min(0.4, belief.adherents.size * 0.01);
    if (Math.random() < adoptionProb) {
      belief.adherents.add(targetAgentId);
      return true;
    }
    return false;
  }

  /** Update belief diffusion using Bass model */
  tick(totalPopulation) {
    for (const [id, belief] of this.beliefs) {
      const newAdopters = bassDiffusion(belief.adherents.size, totalPopulation, 0.01, 0.3);
      // This just tracks the theoretical rate; actual adoption happens via spreadBelief
      belief._theoreticalGrowthRate = newAdopters;
    }
  }

  /** Get belief distribution for telemetry */
  getDistribution() {
    const dist = {};
    for (const [id, belief] of this.beliefs) {
      if (belief.adherents.size > 0) {
        dist[belief.content.substring(0, 40)] = belief.adherents.size;
      }
    }
    return dist;
  }

  /** Cluster beliefs into religions (groups of co-held beliefs) */
  clusterReligions() {
    // Simple: beliefs held by >50% of the same agents are in the same religion
    // (Simplified implementation)
    this.religionClusters = [];
    const beliefArr = [...this.beliefs.values()].filter(b => b.adherents.size > 2);
    const used = new Set();

    for (const b1 of beliefArr) {
      if (used.has(b1.id)) continue;
      const cluster = [b1.id];
      used.add(b1.id);
      for (const b2 of beliefArr) {
        if (used.has(b2.id)) continue;
        // Calculate overlap
        let overlap = 0;
        for (const a of b1.adherents) { if (b2.adherents.has(a)) overlap++; }
        if (overlap > Math.min(b1.adherents.size, b2.adherents.size) * 0.5) {
          cluster.push(b2.id);
          used.add(b2.id);
        }
      }
      if (cluster.length > 1) this.religionClusters.push(cluster);
    }
    return this.religionClusters;
  }

  serialize() {
    return {
      beliefs: [...this.beliefs.entries()].map(([id, b]) => ({
        id, content: b.content, sourceAgentId: b.sourceAgentId,
        createdAt: b.createdAt, adherents: [...b.adherents],
        confidence: b.confidence, type: b.type
      })),
      nextBeliefId: this.nextBeliefId
    };
  }

  deserialize(state) {
    if (!state) return;
    this.nextBeliefId = state.nextBeliefId ?? 0;
    this.beliefs.clear();
    for (const bd of (state.beliefs ?? [])) {
      const b = new Belief(bd.id, bd.content, bd.sourceAgentId, bd.createdAt);
      b.adherents = new Set(bd.adherents ?? []);
      b.confidence = bd.confidence ?? 0.5;
      b.type = bd.type ?? 'myth';
      this.beliefs.set(bd.id, b);
    }
  }
}

export default BeliefSystem;
