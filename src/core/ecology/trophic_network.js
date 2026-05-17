/**
 * @module TrophicNetwork
 * @description Dynamic ecological graph where nodes are species and edges
 * represent predator-prey, symbiotic, or parasitic relationships.
 * Supports co-evolution, extinction cascades, and carrying capacity queries.
 */

import { LotkaVolterra } from './lotka_volterra.js';
import eventBus from '../meta/event_bus.js';

export class TrophicNetwork {
  constructor() {
    /** @type {Map<number, Object>} Species nodes */
    this.nodes = new Map();
    /** @type {Map<string, Object>} Edges keyed by "srcId->dstId" */
    this.edges = new Map();
    this.encounterStats = new Map();
  }

  addSpecies(speciesId, traits = {}) {
    this.nodes.set(speciesId, {
      id: speciesId, population: traits.population ?? 10, trophicLevel: traits.trophicLevel ?? 1,
      biomass: traits.biomass ?? 100, climateTolerance: {
        tempMin: traits.tempMin ?? -10, tempMax: traits.tempMax ?? 40,
        humidityMin: traits.humidityMin ?? 0.1, humidityMax: traits.humidityMax ?? 0.9
      }
    });
  }

  removeSpecies(speciesId) {
    this.nodes.delete(speciesId);
    for (const key of [...this.edges.keys()]) {
      if (key.startsWith(`${speciesId}->`) || key.endsWith(`->${speciesId}`)) {
        this.edges.delete(key);
      }
    }
  }

  addInteraction(sourceId, targetId, type = 'predation', strength = 0.5) {
    const key = `${sourceId}->${targetId}`;
    this.edges.set(key, { source: sourceId, target: targetId, type, strength,
      encounters: 0, kills: 0, coevolutionFactor: 0 });
  }

  recordEncounter(sourceId, targetId, wasKill = false) {
    const key = `${sourceId}->${targetId}`;
    const edge = this.edges.get(key);
    if (edge) {
      edge.encounters++;
      if (wasKill) edge.kills++;
      edge.coevolutionFactor = Math.min(1, edge.coevolutionFactor + 0.01);
    }
  }

  /** Update all populations via Lotka-Volterra dynamics */
  update(dt = 0.2) {
    for (const [key, edge] of this.edges) {
      if (edge.type !== 'predation') continue;
      const prey = this.nodes.get(edge.target);
      const pred = this.nodes.get(edge.source);
      if (!prey || !pred) continue;

      const coeffs = LotkaVolterra.estimateCoefficients({
        encounters: edge.encounters, kills: edge.kills,
        preyGrowthRate: 0.1, predDeathRate: 0.05
      });

      const result = LotkaVolterra.step(prey.population, pred.population, coeffs, dt);
      prey.population = result.prey;
      pred.population = result.pred;
    }

    // Check for extinctions
    for (const [id, node] of this.nodes) {
      if (node.population < 0.5) {
        this._triggerExtinction(id);
      }
    }
  }

  _triggerExtinction(speciesId) {
    eventBus.publish('ecology.extinction', { speciesId }, { source_layer: 2, priority: 8 });
    // Cascade check: find dependent species
    for (const [key, edge] of this.edges) {
      if (edge.target === speciesId && edge.type === 'predation') {
        const pred = this.nodes.get(edge.source);
        if (pred) {
          // Predator loses a food source — reduce population
          pred.population *= 0.7;
        }
      }
    }
    this.removeSpecies(speciesId);
  }

  /** Get carrying capacity of a biome based on its species */
  getCarryingCapacity(biomeSpeciesIds) {
    let capacity = 0;
    for (const id of biomeSpeciesIds) {
      const node = this.nodes.get(id);
      if (node) capacity += node.biomass * 0.1;
    }
    return capacity;
  }

  /** Check if a species can survive in given climate conditions */
  canSurviveIn(speciesId, temperature, humidity) {
    const node = this.nodes.get(speciesId);
    if (!node) return false;
    const tol = node.climateTolerance;
    return temperature >= tol.tempMin && temperature <= tol.tempMax &&
           humidity >= tol.humidityMin && humidity <= tol.humidityMax;
  }

  /** Get data for D3.js force-directed graph visualization */
  getGraphData() {
    const nodes = [...this.nodes.values()].map(n => ({
      id: n.id, population: n.population, trophicLevel: n.trophicLevel
    }));
    const links = [...this.edges.values()].map(e => ({
      source: e.source, target: e.target, type: e.type, strength: e.strength
    }));
    return { nodes, links };
  }

  serialize() {
    return {
      nodes: [...this.nodes.entries()],
      edges: [...this.edges.entries()]
    };
  }

  deserialize(state) {
    if (!state) return;
    this.nodes = new Map(state.nodes ?? []);
    this.edges = new Map(state.edges ?? []);
  }
}

export default TrophicNetwork;
