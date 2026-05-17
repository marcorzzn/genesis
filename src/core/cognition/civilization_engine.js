/**
 * @module CivilizationEngine
 * @description Layer 6/7 bridge: turns dense biological populations into
 * settlements, technologies, professions, norms, and knowledge archives.
 */

import eventBus from '../meta/event_bus.js';
import { SeededRandom, clamp } from '../../utils/math_helpers.js';

const SETTLEMENT_NAMES = [
  'Aster', 'Nadir', 'Velia', 'Origo', 'Kora', 'Silex', 'Mira', 'Ananke'
];

const TECH_CATALOG = [
  {
    id: 'foraging_protocols',
    label: 'Foraging protocols',
    minPopulation: 70,
    minComplexity: 0,
    description: 'Repeated routes become shared ecological memory.'
  },
  {
    id: 'agriculture',
    label: 'Agriculture',
    minPopulation: 120,
    minComplexity: 5,
    description: 'Resource-rich cells are protected and repeatedly harvested.'
  },
  {
    id: 'storage',
    label: 'Storage',
    minPopulation: 150,
    minComplexity: 6,
    requires: ['agriculture'],
    description: 'Surplus becomes temporal control over future scarcity.'
  },
  {
    id: 'ritual_notation',
    label: 'Ritual notation',
    minPopulation: 160,
    minComplexity: 7,
    description: 'Beliefs and events are compressed into repeatable symbols.'
  },
  {
    id: 'writing',
    label: 'Writing',
    minPopulation: 190,
    minComplexity: 8,
    requires: ['ritual_notation'],
    description: 'Memory leaves individual agents and becomes external infrastructure.'
  },
  {
    id: 'mathematics',
    label: 'Mathematics',
    minPopulation: 220,
    minComplexity: 9,
    requires: ['writing'],
    description: 'Regularities in cells, seasons, and trade become formal symbols.'
  },
  {
    id: 'hydraulics',
    label: 'Hydraulics',
    minPopulation: 260,
    minComplexity: 9,
    requires: ['agriculture', 'storage'],
    description: 'Water and transport costs become engineered variables.'
  },
  {
    id: 'civic_law',
    label: 'Civic law',
    minPopulation: 280,
    minComplexity: 10,
    requires: ['writing'],
    description: 'Norms become durable rules with explicit enforcement.'
  }
];

export class CivilizationEngine {
  constructor(options = {}) {
    this.rng = new SeededRandom(options.seed ?? 777);
    this.settlements = new Map();
    this.technologies = new Map();
    this.knowledgeArchive = [];
    this.stage = 'Substrato biologico';
    this.nextSettlementId = 0;
    this._lastProfessionTick = 0;
    this._lastArchiveTick = 0;
  }

  tick(context) {
    const { tick = 0, genetics, worldGen, social, economy, beliefs, governance, eventBus: bus = eventBus } = context;
    if (!genetics || !worldGen) return this.getStats();
    const alive = [...genetics.entities.values()].filter((entity) => entity.alive);
    if (alive.length === 0) return this.getStats();

    if (alive.length >= 70 && this.settlements.size === 0) {
      this._foundSettlement(tick, alive, worldGen, social, economy, beliefs);
    }

    if (this.settlements.size > 0 && tick % 90 === 0) {
      this._updateSettlements(alive, worldGen);
      this._maybeDiscoverProfession(tick, alive, worldGen, economy);
      this._maybeCreateNorm(tick, social, governance, bus);
    }

    if (tick % 120 === 0) this._unlockTechnologies(tick, genetics, economy, beliefs);
    if (tick - this._lastArchiveTick >= 180 && this.technologies.has('writing')) {
      this._archiveKnowledge(tick, genetics, beliefs, economy);
    }

    this.stage = this._deriveStage();
    return this.getStats();
  }

  getStats() {
    return {
      stage: this.stage,
      settlementCount: this.settlements.size,
      technologyCount: this.technologies.size,
      archiveCount: this.knowledgeArchive.length,
      knowledgeIndex: this._knowledgeIndex(),
      technologies: [...this.technologies.values()],
      settlements: [...this.settlements.values()],
      recentArchive: this.knowledgeArchive.slice(-6)
    };
  }

  serialize() {
    return {
      settlements: [...this.settlements.entries()],
      technologies: [...this.technologies.entries()],
      knowledgeArchive: this.knowledgeArchive.slice(-120),
      stage: this.stage,
      nextSettlementId: this.nextSettlementId,
      lastProfessionTick: this._lastProfessionTick,
      lastArchiveTick: this._lastArchiveTick
    };
  }

  deserialize(state) {
    if (!state) return;
    this.settlements = new Map(state.settlements ?? []);
    this.technologies = new Map(state.technologies ?? []);
    this.knowledgeArchive = state.knowledgeArchive ?? [];
    this.stage = state.stage ?? 'Substrato biologico';
    this.nextSettlementId = state.nextSettlementId ?? 0;
    this._lastProfessionTick = state.lastProfessionTick ?? 0;
    this._lastArchiveTick = state.lastArchiveTick ?? 0;
  }

  _foundSettlement(tick, alive, worldGen, social, economy, beliefs) {
    const founders = [...alive].sort((a, b) => b.energy - a.energy).slice(0, Math.min(48, alive.length));
    const center = this._centroid(founders);
    const founder = founders[0];
    const name = SETTLEMENT_NAMES[this.nextSettlementId % SETTLEMENT_NAMES.length];
    const memberIds = founders.slice(1).map((entity) => entity.id);
    const clanId = social?.formClan?.(founder.id, memberIds, name, center) ?? null;
    const id = this.nextSettlementId++;
    const settlement = {
      id,
      name,
      clanId,
      x: center.x,
      y: center.y,
      population: founders.length,
      foundedAt: tick,
      biome: worldGen.getBiomeAt(center.x, center.y),
      resourceMean: this._localResourceMean(center.x, center.y, worldGen),
      stage: 'band'
    };
    this.settlements.set(id, settlement);

    economy?.createMarket?.(`settlement:${id}`);
    economy?.registerGood?.(`settlement:${id}`, 'food', 80, 1);
    economy?.registerGood?.(`settlement:${id}`, 'tools', 8, 4);
    beliefs?.generateBelief?.(founder.id, 'the first stable settlement', tick);

    eventBus.publish('civilization.settlement_founded', {
      settlementId: id,
      name,
      population: founders.length,
      x: center.x,
      y: center.y
    }, { source_layer: 6, priority: 7 });
  }

  _updateSettlements(alive, worldGen) {
    for (const settlement of this.settlements.values()) {
      let population = 0;
      let resourceSum = 0;
      for (const entity of alive) {
        const dx = Math.abs(entity.x - settlement.x);
        const dy = Math.abs(entity.y - settlement.y);
        if (dx < worldGen.width * 0.25 && dy < worldGen.height * 0.25) {
          population++;
          resourceSum += worldGen.getResourceAt(entity.x, entity.y);
        }
      }
      settlement.population = Math.max(1, population);
      settlement.resourceMean = population > 0 ? resourceSum / population : settlement.resourceMean;
      settlement.stage = this._settlementStage(settlement.population);
    }
  }

  _maybeDiscoverProfession(tick, alive, worldGen, economy) {
    if (!economy || tick - this._lastProfessionTick < 240) return;
    const sample = alive[this.rng.nextInt(0, alive.length - 1)];
    const resourceType = this._resourceTypeAt(sample.x, sample.y, worldGen);
    const profession = economy.discoverProfession(sample.id, resourceType, 'central');
    this._lastProfessionTick = tick;
    eventBus.publish('civilization.specialization', {
      profession,
      resourceType,
      agentId: sample.id
    }, { source_layer: 6, priority: 5 });
  }

  _maybeCreateNorm(tick, social, governance, bus) {
    if (!social || !governance) return;
    const recent = bus?.getHistory?.({ limit: 80 }) ?? [];
    for (const clan of social.clans.values()) {
      const norm = governance.checkNormGeneration(clan.id, clan.members.size, recent);
      if (norm) {
        eventBus.publish('civilization.norm_codified', {
          clanId: clan.id,
          description: norm.description
        }, { source_layer: 6, priority: 6 });
      }
    }
  }

  _unlockTechnologies(tick, genetics, economy, beliefs) {
    const stats = genetics.getPopulationStats();
    const beliefCount = beliefs?.beliefs?.size ?? 0;
    const professionCount = economy?.professions?.size ?? 0;

    for (const tech of TECH_CATALOG) {
      if (this.technologies.has(tech.id)) continue;
      const requirementsMet = (tech.requires ?? []).every((id) => this.technologies.has(id));
      if (!requirementsMet) continue;
      if (stats.alive < tech.minPopulation || stats.avgComplexity < tech.minComplexity) continue;
      if (tech.id === 'ritual_notation' && beliefCount < 1) continue;
      if (tech.id === 'writing' && professionCount < 2) continue;

      const unlocked = { ...tech, unlockedAt: tick };
      this.technologies.set(tech.id, unlocked);
      this.knowledgeArchive.push({
        tick,
        type: 'technology',
        title: tech.label,
        note: tech.description
      });
      eventBus.publish('technology.unlocked', unlocked, { source_layer: 6, priority: 7 });
    }
  }

  _archiveKnowledge(tick, genetics, beliefs, economy) {
    const stats = genetics.getPopulationStats();
    const record = {
      tick,
      type: 'archive',
      title: `Census T${tick}`,
      note: `Pop=${stats.alive}, species=${stats.species}, professions=${economy?.professions?.size ?? 0}, beliefs=${beliefs?.beliefs?.size ?? 0}`
    };
    this.knowledgeArchive.push(record);
    if (this.knowledgeArchive.length > 180) this.knowledgeArchive.shift();
    this._lastArchiveTick = tick;
    eventBus.publish('information.archive_recorded', record, { source_layer: 7, priority: 5 });
  }

  _deriveStage() {
    if (this.technologies.has('civic_law')) return 'Istituzioni civiche';
    if (this.technologies.has('mathematics')) return 'Citta simboliche';
    if (this.technologies.has('writing')) return 'Reti dell informazione';
    if (this.technologies.has('agriculture')) return 'Villaggi tecnologici';
    if (this.settlements.size > 0) return 'Proto-civilta';
    return 'Substrato biologico';
  }

  _knowledgeIndex() {
    return clamp(
      (this.technologies.size * 12) +
      (this.knowledgeArchive.length * 1.5) +
      ([...this.settlements.values()].reduce((sum, s) => sum + s.population, 0) * 0.02),
      0,
      100
    );
  }

  _centroid(entities) {
    const sum = entities.reduce((acc, entity) => {
      acc.x += entity.x;
      acc.y += entity.y;
      return acc;
    }, { x: 0, y: 0 });
    return { x: sum.x / entities.length, y: sum.y / entities.length };
  }

  _localResourceMean(x, y, worldGen) {
    let sum = 0;
    let count = 0;
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        sum += worldGen.getResourceAt(x + dx, y + dy);
        count++;
      }
    }
    return sum / Math.max(1, count);
  }

  _resourceTypeAt(x, y, worldGen) {
    const biome = worldGen.getBiomeAt(x, y);
    const height = worldGen.getHeightAt(x, y);
    const resource = worldGen.getResourceAt(x, y);
    if (height > 0.45) return 'ore';
    if (resource > 0.82) return 'food';
    if ([4, 5, 10].includes(biome)) return 'wood';
    if ([1, 2].includes(biome)) return 'fish';
    if ([6, 8].includes(biome)) return 'stone';
    return 'fiber';
  }

  _settlementStage(population) {
    if (population < 60) return 'band';
    if (population < 150) return 'village';
    if (population < 320) return 'town';
    return 'city';
  }
}

export default CivilizationEngine;
