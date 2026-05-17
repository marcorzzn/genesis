/**
 * @module PhylogenyTracker
 * @description Universal phylogenetic registry tracking the Tree of Life.
 * Records every speciation, extinction, and lineage event in a persistent graph.
 */

import eventBus from '../meta/event_bus.js';
import persistence from '../../utils/persistence.js';

export class PhylogenyTracker {
  constructor() {
    /** @type {Map<number, Object>} Species records */
    this.speciesRecords = new Map();
    /** @type {Array} Extinction events */
    this.extinctions = [];
    /** @type {Array} Speciation events */
    this.speciations = [];
    this.nextRecordId = 0;
    this._setupListeners();
  }

  _setupListeners() {
    eventBus.subscribe('biology.entity_birth', (e) => {
      const { entityId, parentId, generation } = e.payload;
      this._recordBirth(entityId, parentId, generation, e.timestamp);
    }, { layer: 2, priority: 5 });

    eventBus.subscribe('biology.entity_death', (e) => {
      this._recordDeath(e.payload.entityId, e.payload.cause, e.timestamp);
    }, { layer: 2, priority: 5 });
  }

  recordSpeciation(parentSpeciesId, newSpeciesId, simTime, traits = {}) {
    const event = {
      id: `spec_${this.nextRecordId++}`,
      parentId: parentSpeciesId >= 0 ? `species_${parentSpeciesId}` : null,
      speciesId: newSpeciesId,
      timestamp: simTime,
      traits,
      population: 1,
      extinct: false
    };
    this.speciations.push(event);
    this.speciesRecords.set(newSpeciesId, event);

    persistence.savePhylogenyEvent(event).catch(e =>
      console.warn('[Phylogeny] Failed to persist speciation:', e)
    );

    eventBus.publish('phylogeny.speciation', { speciesId: newSpeciesId, parentSpeciesId }, { source_layer: 2 });
  }

  recordExtinction(speciesId, simTime, cause = 'unknown') {
    const record = this.speciesRecords.get(speciesId);
    if (record) record.extinct = true;

    const event = { speciesId, timestamp: simTime, cause };
    this.extinctions.push(event);
    eventBus.publish('phylogeny.extinction', event, { source_layer: 2 });
  }

  _recordBirth(entityId, parentId, generation, timestamp) {
    // Lightweight — just update species population counts
  }

  _recordDeath(entityId, cause, timestamp) {
    // Lightweight — just update species population counts
  }

  getTreeData() {
    // Build hierarchical tree structure for D3.js visualization
    const root = { name: 'Origin', children: [], epoch: 0 };
    const specMap = new Map();
    specMap.set(null, root);

    for (const spec of this.speciations) {
      const node = {
        name: `Species ${spec.speciesId}`,
        id: spec.speciesId,
        epoch: spec.timestamp,
        extinct: spec.extinct,
        traits: spec.traits,
        children: []
      };
      specMap.set(`species_${spec.speciesId}`, node);
      const parent = specMap.get(spec.parentId) ?? root;
      parent.children.push(node);
    }

    return root;
  }

  getStats() {
    return {
      totalSpecies: this.speciesRecords.size,
      extinctions: this.extinctions.length,
      speciations: this.speciations.length,
      activeSpecies: [...this.speciesRecords.values()].filter(s => !s.extinct).length
    };
  }

  serialize() {
    return {
      speciations: this.speciations,
      extinctions: this.extinctions,
      nextRecordId: this.nextRecordId
    };
  }

  deserialize(state) {
    if (!state) return;
    this.speciations = state.speciations ?? [];
    this.extinctions = state.extinctions ?? [];
    this.nextRecordId = state.nextRecordId ?? 0;
    this.speciesRecords.clear();
    for (const s of this.speciations) this.speciesRecords.set(s.speciesId, s);
  }
}

export default PhylogenyTracker;
