/**
 * @module GeneticEngine
 * @description Genetic Algorithm engine with tournament selection, aligned crossover,
 * 5 mutation types, and speciation for the biology layer.
 */

import { NEATNetwork } from './neat_network.js';
import { SeededRandom } from '../../utils/math_helpers.js';
import eventBus from '../meta/event_bus.js';

export class Entity {
  constructor(id, x, y, network) {
    this.id = id;
    this.x = x; this.y = y;
    this.angle = Math.random() * Math.PI * 2;
    this.speed = 0;
    this.energy = 100;
    this.maxEnergy = 150;
    this.age = 0;
    this.maxAge = 2000;
    this.alive = true;
    this.speciesId = -1;
    this.parentId = null;
    this.generation = 0;
    this.network = network;
    this.metabolicRate = 0.5 + Math.random() * 0.5;
    this.fatReserves = 0;
    this.efficiency = 0.5 + Math.random() * 0.3;
    this.hibernating = false;
    this.reproductionCooldown = 0;
    this.fitness = 0;
    this.signalFrequency = 0;
    this.color = [Math.random(), Math.random() * 0.5 + 0.5, Math.random()];
    this.size = 2 + Math.random() * 3;
  }
}

export class GeneticEngine {
  constructor(options = {}) {
    this.populationCap = options.populationCap ?? 15000;
    this.tournamentSize = options.tournamentSize ?? 3;
    this.mutationRates = {
      weight: options.weightMutRate ?? 0.8,
      addNode: options.addNodeRate ?? 0.03,
      addLink: options.addLinkRate ?? 0.05,
      morphology: options.morphRate ?? 0.1,
      metabolism: options.metabRate ?? 0.1
    };
    this.compatThreshold = options.compatThreshold ?? 3.0;
    this.rng = new SeededRandom(options.seed ?? 42);

    /** @type {Map<number, Entity>} */
    this.entities = new Map();
    /** @type {Map<number, Entity[]>} Species ID -> members */
    this.species = new Map();
    this.nextEntityId = 0;
    this.nextSpeciesId = 0;
    this.generation = 0;

    // Input: 6 resource dirs + nearest dist + energy + orientation + age + season + threats = 12
    this.inputCount = 12;
    // Output: thrust + steering + reproduce + signal + hibernate = 5
    this.outputCount = 5;
  }

  /** Initialize population with random entities */
  initPopulation(count, worldWidth, worldHeight) {
    for (let i = 0; i < Math.min(count, this.populationCap); i++) {
      const net = NEATNetwork.create(this.inputCount, this.outputCount);
      const x = this.rng.nextFloat(0, worldWidth);
      const y = this.rng.nextFloat(0, worldHeight);
      const entity = new Entity(this.nextEntityId++, x, y, net);
      this.entities.set(entity.id, entity);
    }
    this._speciate();
    eventBus.publish('biology.population_initialized', { count: this.entities.size }, { source_layer: 2 });
  }

  /** Spawn a single entity at an explicit location. Used by observer interventions. */
  spawnEntity(x, y, template = {}) {
    if (this.entities.size >= this.populationCap) return null;
    const net = template.network ?? NEATNetwork.create(this.inputCount, this.outputCount);
    const entity = new Entity(this.nextEntityId++, x, y, net);
    if (template.energy !== undefined) entity.energy = template.energy;
    if (template.color) entity.color = [...template.color];
    if (template.size !== undefined) entity.size = template.size;
    this.entities.set(entity.id, entity);
    this._speciate();
    eventBus.publish('biology.entity_birth', {
      entityId: entity.id,
      parentId: null,
      generation: entity.generation,
      divine: true
    }, { source_layer: 2, priority: 7 });
    return entity;
  }

  /** Run one simulation tick */
  tick(getInputsFn, deltaTime = 1) {
    const deadIds = [];

    for (const [id, entity] of this.entities) {
      if (!entity.alive) { deadIds.push(id); continue; }

      // Get inputs from environment
      const inputs = getInputsFn(entity);
      const outputs = entity.network.activate(inputs);

      // Decode outputs
      const thrust = Math.max(0, Math.min(1, (outputs[0] + 1) / 2));
      const steer = outputs[1] * Math.PI;
      const wantReproduce = outputs[2] > 0.5;
      entity.signalFrequency = (outputs[3] + 1) / 2;
      const wantHibernate = outputs[4] > 0.5;

      // Movement
      entity.angle += steer * 0.1 * deltaTime;
      entity.speed = thrust;
      const moveCost = thrust * entity.metabolicRate * 0.1 * deltaTime;
      entity.x += Math.cos(entity.angle) * entity.speed * deltaTime;
      entity.y += Math.sin(entity.angle) * entity.speed * deltaTime;

      // Metabolism
      const baseCost = entity.metabolicRate * 0.05 * deltaTime;
      entity.energy -= baseCost + moveCost;

      // Hibernation
      if (wantHibernate && entity.fatReserves > 10) {
        entity.hibernating = true;
        entity.energy += entity.fatReserves * 0.01 * deltaTime;
      } else {
        entity.hibernating = false;
      }

      // Fat storage
      if (entity.energy > entity.maxEnergy * 0.8) {
        const excess = entity.energy - entity.maxEnergy * 0.8;
        entity.fatReserves += excess * entity.efficiency * 0.1;
        entity.energy -= excess * 0.1;
      }

      // Aging
      entity.age += deltaTime;
      entity.reproductionCooldown = Math.max(0, entity.reproductionCooldown - deltaTime);
      entity.fitness += deltaTime * 0.01 + entity.energy * 0.001;

      // Death
      if (entity.energy <= 0 || entity.age >= entity.maxAge) {
        entity.alive = false;
        deadIds.push(id);
        eventBus.publish('biology.entity_death', { entityId: id, age: entity.age, cause: entity.energy <= 0 ? 'starvation' : 'old_age' }, { source_layer: 2 });
      }

      // Reproduction
      if (wantReproduce && entity.energy > 60 && entity.reproductionCooldown <= 0 && this.entities.size < this.populationCap) {
        this._reproduce(entity);
      }
    }

    // Remove dead
    for (const id of deadIds) this.entities.delete(id);

    this.generation++;
    if (this.generation % 100 === 0) this._speciate();
  }

  _reproduce(parent) {
    // Find a partner in same species
    const speciesMembers = this.species.get(parent.speciesId);
    let partner = null;
    if (speciesMembers && speciesMembers.length > 1) {
      partner = speciesMembers[Math.floor(this.rng.next() * speciesMembers.length)];
      if (partner.id === parent.id) partner = null;
    }

    let childNet;
    if (partner && partner.alive) {
      const fitter = parent.fitness >= partner.fitness ? parent : partner;
      const weaker = fitter === parent ? partner : parent;
      childNet = NEATNetwork.crossover(fitter.network, weaker.network);
    } else {
      childNet = parent.network.clone();
    }

    // Mutate
    if (this.rng.next() < this.mutationRates.weight) childNet.mutateWeights();
    if (this.rng.next() < this.mutationRates.addNode) childNet.mutateAddNode();
    if (this.rng.next() < this.mutationRates.addLink) childNet.mutateAddConnection();

    const child = new Entity(this.nextEntityId++, parent.x + (this.rng.next() - 0.5) * 10, parent.y + (this.rng.next() - 0.5) * 10, childNet);
    child.parentId = parent.id;
    child.generation = parent.generation + 1;

    // Morphology mutation
    if (this.rng.next() < this.mutationRates.morphology) {
      child.size = Math.max(1, parent.size + this.rng.gaussian(0, 0.3));
      child.color = parent.color.map(c => Math.max(0, Math.min(1, c + this.rng.gaussian(0, 0.05))));
    } else {
      child.size = parent.size;
      child.color = [...parent.color];
    }

    // Metabolism mutation
    if (this.rng.next() < this.mutationRates.metabolism) {
      child.metabolicRate = Math.max(0.1, parent.metabolicRate + this.rng.gaussian(0, 0.05));
      child.efficiency = Math.max(0.1, Math.min(1, parent.efficiency + this.rng.gaussian(0, 0.03)));
      child.maxAge = Math.max(500, parent.maxAge + this.rng.gaussian(0, 50));
    } else {
      child.metabolicRate = parent.metabolicRate;
      child.efficiency = parent.efficiency;
      child.maxAge = parent.maxAge;
    }

    parent.energy -= 30;
    parent.reproductionCooldown = 50;
    child.energy = 50;

    this.entities.set(child.id, child);
    eventBus.publish('biology.entity_birth', { entityId: child.id, parentId: parent.id, generation: child.generation }, { source_layer: 2 });
  }

  _speciate() {
    this.species.clear();
    const representatives = new Map();

    for (const [id, entity] of this.entities) {
      let placed = false;
      for (const [specId, rep] of representatives) {
        const dist = NEATNetwork.compatibilityDistance(entity.network, rep.network);
        if (dist < this.compatThreshold) {
          entity.speciesId = specId;
          entity.network.species = specId;
          this.species.get(specId).push(entity);
          placed = true;
          break;
        }
      }
      if (!placed) {
        const newSpecId = this.nextSpeciesId++;
        entity.speciesId = newSpecId;
        entity.network.species = newSpecId;
        representatives.set(newSpecId, entity);
        this.species.set(newSpecId, [entity]);
      }
    }
  }

  feedEntity(entityId, amount) {
    const e = this.entities.get(entityId);
    if (e && e.alive) e.energy = Math.min(e.maxEnergy, e.energy + amount * e.efficiency);
  }

  getPopulationStats() {
    let alive = 0, totalFitness = 0, totalAge = 0, totalComplexity = 0;
    for (const e of this.entities.values()) {
      if (e.alive) {
        alive++; totalFitness += e.fitness; totalAge += e.age;
        totalComplexity += e.network.getComplexity();
      }
    }
    return {
      alive, species: this.species.size, generation: this.generation,
      avgFitness: alive > 0 ? totalFitness / alive : 0,
      avgAge: alive > 0 ? totalAge / alive : 0,
      avgComplexity: alive > 0 ? totalComplexity / alive : 0
    };
  }

  serialize() {
    const entities = [];
    for (const e of this.entities.values()) {
      entities.push({
        id: e.id, x: e.x, y: e.y, angle: e.angle, energy: e.energy,
        age: e.age, alive: e.alive, speciesId: e.speciesId, parentId: e.parentId,
        generation: e.generation, metabolicRate: e.metabolicRate, fatReserves: e.fatReserves,
        efficiency: e.efficiency, fitness: e.fitness, size: e.size, color: e.color,
        maxAge: e.maxAge, network: e.network.serialize()
      });
    }
    return { entities, nextEntityId: this.nextEntityId, nextSpeciesId: this.nextSpeciesId, generation: this.generation };
  }

  deserialize(state) {
    if (!state) return;
    this.entities.clear();
    this.nextEntityId = state.nextEntityId ?? 0;
    this.nextSpeciesId = state.nextSpeciesId ?? 0;
    this.generation = state.generation ?? 0;
    for (const ed of (state.entities ?? [])) {
      const net = NEATNetwork.deserialize(ed.network);
      const e = new Entity(ed.id, ed.x, ed.y, net);
      Object.assign(e, { angle: ed.angle, energy: ed.energy, age: ed.age, alive: ed.alive,
        speciesId: ed.speciesId, parentId: ed.parentId, generation: ed.generation,
        metabolicRate: ed.metabolicRate, fatReserves: ed.fatReserves, efficiency: ed.efficiency,
        fitness: ed.fitness, size: ed.size, color: ed.color, maxAge: ed.maxAge });
      this.entities.set(e.id, e);
    }
    this._speciate();
  }
}

export default GeneticEngine;
