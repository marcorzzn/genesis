/**
 * @module GovernanceSystem
 * @description Emergent legal and governance system.
 * Models transition from norms→taboos→laws based on population density.
 */

import eventBus from '../../core/meta/event_bus.js';

export class GovernanceSystem {
  constructor() {
    this.norms = new Map();    // clanId -> norms[]
    this.taboos = new Map();   // clanId -> taboos[]
    this.laws = new Map();     // clanId -> laws[]
    this.nextNormId = 0;
  }

  /** Spontaneously generate a norm when population reaches threshold */
  checkNormGeneration(clanId, populationSize, recentEvents) {
    if (populationSize < 10) return null;

    // Check for repeated conflict patterns
    const conflictCount = recentEvents.filter(e => e.type?.includes('conflict')).length;
    if (conflictCount > 3) {
      const norm = this._createNorm(clanId, 'no_violence', 'Violence within the group is forbidden', populationSize);
      return norm;
    }

    // Check for resource disputes
    const resourceDisputes = recentEvents.filter(e => e.type?.includes('resource_dispute')).length;
    if (resourceDisputes > 2) {
      const norm = this._createNorm(clanId, 'shared_resources', 'Resources in communal areas must be shared', populationSize);
      return norm;
    }

    return null;
  }

  _createNorm(clanId, type, description, popSize) {
    const id = this.nextNormId++;
    const norm = { id, clanId, type, description, compliance: 0.5, established: 0 };

    if (!this.norms.has(clanId)) this.norms.set(clanId, []);
    this.norms.get(clanId).push(norm);

    // Norms become taboos at medium population
    if (popSize > 50) {
      if (!this.taboos.has(clanId)) this.taboos.set(clanId, []);
      this.taboos.get(clanId).push({ ...norm, penalty: 'social_ostracism' });
    }

    // Taboos become laws at high population
    if (popSize > 200) {
      if (!this.laws.has(clanId)) this.laws.set(clanId, []);
      this.laws.get(clanId).push({ ...norm, penalty: 'imprisonment', enforcer: 'chief' });
      eventBus.publish('governance.law_created', { clanId, description }, { source_layer: 4 });
    }

    return norm;
  }

  getLaws(clanId) { return this.laws.get(clanId) ?? []; }
  getNorms(clanId) { return this.norms.get(clanId) ?? []; }

  serialize() {
    return {
      norms: [...this.norms.entries()], taboos: [...this.taboos.entries()],
      laws: [...this.laws.entries()], nextNormId: this.nextNormId
    };
  }

  deserialize(state) {
    if (!state) return;
    this.norms = new Map(state.norms ?? []);
    this.taboos = new Map(state.taboos ?? []);
    this.laws = new Map(state.laws ?? []);
    this.nextNormId = state.nextNormId ?? 0;
  }
}

export default GovernanceSystem;
