/**
 * @module MetabolicSystem
 * @description Metabolic simulation for biological entities — energy conversion,
 * fat storage, seasonal fitness modulation, and immune system basics.
 */

export class MetabolicSystem {
  constructor() {
    this.seasonMultipliers = { spring: 1.2, summer: 1.0, autumn: 0.8, winter: 0.5 };
  }

  /** Calculate energy gain from consuming a resource */
  consumeResource(entity, resourceType, amount, season = 'summer') {
    const seasonMul = this.seasonMultipliers[season] ?? 1.0;
    const gain = amount * entity.efficiency * seasonMul;
    entity.energy = Math.min(entity.maxEnergy, entity.energy + gain);
    return gain;
  }

  /** Process metabolic costs for one tick */
  processTick(entity, isMoving, season = 'summer') {
    const seasonMul = this.seasonMultipliers[season] ?? 1.0;
    let cost = entity.metabolicRate * 0.05;
    if (isMoving) cost += entity.speed * entity.metabolicRate * 0.1;
    if (entity.hibernating) cost *= 0.2;
    cost *= (2.0 - seasonMul); // Higher cost in harsher seasons
    entity.energy -= cost;

    // Fat metabolism
    if (entity.energy > entity.maxEnergy * 0.8 && !entity.hibernating) {
      const excess = entity.energy - entity.maxEnergy * 0.8;
      entity.fatReserves += excess * 0.1;
      entity.energy -= excess * 0.1;
    } else if (entity.energy < entity.maxEnergy * 0.2 && entity.fatReserves > 0) {
      const needed = entity.maxEnergy * 0.3 - entity.energy;
      const available = Math.min(entity.fatReserves, needed * 0.5);
      entity.energy += available;
      entity.fatReserves -= available;
    }

    return cost;
  }

  /** Calculate fitness modifier based on metabolic traits */
  getFitnessModifier(entity, season) {
    const seasonMul = this.seasonMultipliers[season] ?? 1.0;
    let modifier = 1.0;
    // Efficient entities thrive
    modifier *= 0.5 + entity.efficiency;
    // Fat reserves help in winter
    if (seasonMul < 0.7) modifier *= 1.0 + entity.fatReserves * 0.01;
    // Young entities have advantage
    if (entity.age < entity.maxAge * 0.5) modifier *= 1.1;
    return modifier;
  }
}

export default MetabolicSystem;
