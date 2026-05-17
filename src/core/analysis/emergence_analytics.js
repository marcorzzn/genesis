/**
 * @module EmergenceAnalytics
 * @description Formal telemetry layer for measuring local-to-global emergence.
 */

import { clamp, shannonIndex } from '../../utils/math_helpers.js';

const EPS = 1e-9;

const PRINCIPLES = [
  {
    id: 'gol',
    name: 'Game of Life B/S',
    formula: 'x(t+1)=1 iff N in B or (x(t)=1 and N in S)',
    meaning: 'Local Moore-neighborhood rules can create persistent, mobile, and computational patterns.'
  },
  {
    id: 'gray_scott',
    name: 'Gray-Scott reaction diffusion',
    formula: 'du/dt=Du*lap(U)-UV^2+F(1-U), dv/dt=Dv*lap(V)+UV^2-(F+k)V',
    meaning: 'Chemical gradients become spatial morphology when diffusion and reaction rates cross instability thresholds.'
  },
  {
    id: 'shannon',
    name: 'Shannon diversity',
    formula: 'H=-sum p_i log2(p_i)',
    meaning: 'Higher H means the population is distributed across more viable species instead of collapsing into one lineage.'
  },
  {
    id: 'neat',
    name: 'NEAT complexity',
    formula: 'C ~= nodes + enabled_connections',
    meaning: 'Evolution is tracked not only by fitness, but by growth in representational capacity.'
  },
  {
    id: 'bass',
    name: 'Bass diffusion',
    formula: 'A(t+1)=A(t)+(p+q*A/M)(M-A)',
    meaning: 'Ideas, professions, and beliefs spread through innovation plus imitation.'
  },
  {
    id: 'governance',
    name: 'Norm-to-law transition',
    formula: 'complexity=f(population, conflict, resource pressure)',
    meaning: 'Rules become institutions when social scale makes informal coordination too expensive.'
  }
];

export class EmergenceAnalytics {
  constructor(options = {}) {
    this.sampleLimit = options.sampleLimit ?? 720;
    this.samples = [];
    this._lastSample = null;
    this._worldCache = null;
  }

  sample(context) {
    const {
      tick = 0,
      fps = 0,
      simSpeed = 1,
      substrate,
      genetics,
      worldGen,
      climate,
      resources,
      economy,
      beliefs,
      social,
      governance,
      civilization,
      eventBus
    } = context;

    const population = this._populationStats(genetics);
    const substrateStats = this._substrateStats(substrate);
    const worldStats = this._worldStats(worldGen, resources, climate);
    const eventStats = this._eventStats(eventBus);
    const societyStats = this._societyStats(social, economy, beliefs, governance, civilization);

    const biologicalComplexity = clamp(population.avgComplexity / 18, 0, 1);
    const diversityNorm = clamp(population.diversity / Math.log2(Math.max(2, population.species + 1)), 0, 1);
    const socialComplexity = clamp(
      (societyStats.settlements * 0.14) +
      (societyStats.professions * 0.055) +
      (societyStats.technologies * 0.075) +
      (societyStats.laws * 0.08) +
      (societyStats.beliefs * 0.035),
      0,
      1
    );
    const eventDiversity = clamp(eventStats.typeCount / 14, 0, 1);
    const edgeOfChaos = substrateStats.edgeOfChaos;

    const emergenceScore = clamp(100 * (
      0.20 * edgeOfChaos +
      0.20 * diversityNorm +
      0.20 * biologicalComplexity +
      0.24 * socialComplexity +
      0.10 * worldStats.resourceBalance +
      0.06 * eventDiversity
    ), 0, 100);

    const sample = {
      tick,
      fps,
      simSpeed,
      phase: this._phase(emergenceScore, substrateStats, population, societyStats),
      emergenceScore,
      population,
      substrate: substrateStats,
      world: worldStats,
      events: eventStats,
      society: societyStats,
      normalized: {
        edgeOfChaos,
        diversity: diversityNorm,
        biologicalComplexity,
        socialComplexity,
        eventDiversity
      }
    };

    sample.deltas = this._deltas(sample, this._lastSample);
    sample.drivers = this._drivers(sample);
    sample.principles = this._principlesFor(sample);

    this.samples.push(sample);
    if (this.samples.length > this.sampleLimit) this.samples.shift();
    this._lastSample = sample;
    return sample;
  }

  latest() {
    return this.samples[this.samples.length - 1] ?? null;
  }

  getPrinciples() {
    return PRINCIPLES.map((p) => ({ ...p }));
  }

  createReport(options = {}) {
    const latest = this.latest();
    const windowSize = options.windowSize ?? 120;
    const series = this.samples.slice(-windowSize);
    const first = series[0] ?? latest;
    const last = latest ?? first;
    const trend = first && last ? {
      emergenceDelta: last.emergenceScore - first.emergenceScore,
      populationDelta: last.population.alive - first.population.alive,
      diversityDelta: last.population.diversity - first.population.diversity,
      complexityDelta: last.population.avgComplexity - first.population.avgComplexity
    } : { emergenceDelta: 0, populationDelta: 0, diversityDelta: 0, complexityDelta: 0 };

    return {
      title: 'Genesis Super Game of Life - Formal Simulation Report',
      generatedAt: new Date().toISOString(),
      latest,
      trend,
      series: series.map((s) => ({
        tick: s.tick,
        emergenceScore: s.emergenceScore,
        population: s.population.alive,
        diversity: s.population.diversity,
        complexity: s.population.avgComplexity,
        socialComplexity: s.normalized.socialComplexity
      })),
      principles: this.getPrinciples(),
      summary: this._summary(last, trend)
    };
  }

  serialize() {
    return { samples: this.samples.slice(-this.sampleLimit) };
  }

  deserialize(state) {
    if (!state) return;
    this.samples = Array.isArray(state.samples) ? state.samples.slice(-this.sampleLimit) : [];
    this._lastSample = this.samples[this.samples.length - 1] ?? null;
  }

  _populationStats(genetics) {
    if (!genetics) {
      return { alive: 0, species: 0, generation: 0, avgFitness: 0, avgAge: 0, avgComplexity: 0, diversity: 0 };
    }
    const stats = genetics.getPopulationStats();
    const speciesSizes = [...genetics.species.values()].map((members) => members.filter((e) => e.alive).length);
    return {
      ...stats,
      diversity: shannonIndex(speciesSizes),
      density: clamp(stats.alive / Math.max(1, genetics.populationCap), 0, 1)
    };
  }

  _substrateStats(substrate) {
    const fallback = {
      mode: substrate?.mode ?? 0,
      rule: substrate?.getLifeRule?.().rule ?? 'B3/S23',
      activeDensity: 0,
      entropy: 0,
      variance: 0,
      edgeOfChaos: 0,
      lambda: 0
    };
    if (!substrate?.initialized || typeof substrate.getEnergyMap !== 'function') return fallback;

    try {
      const size = Math.min(64, substrate.width, substrate.height);
      const x = Math.floor((substrate.width - size) * 0.5);
      const y = Math.floor((substrate.height - size) * 0.5);
      const map = substrate.getEnergyMap(x, y, size, size);
      if (!map?.data?.length) return fallback;

      const bins = new Array(12).fill(0);
      let sum = 0;
      let sumSq = 0;
      let active = 0;
      const count = map.width * map.height;
      for (let i = 0; i < count; i++) {
        const v = clamp(map.data[i * 4], 0, 1);
        sum += v;
        sumSq += v * v;
        if (v > 0.5) active++;
        bins[Math.min(bins.length - 1, Math.floor(v * bins.length))]++;
      }

      const mean = sum / Math.max(1, count);
      const variance = Math.max(0, sumSq / Math.max(1, count) - mean * mean);
      const entropy = shannonIndex(bins) / Math.log2(bins.length);
      const density = active / Math.max(1, count);
      const lambda = substrate.mode === 0 ? density : mean;
      const edgeOfChaos = clamp((entropy * 0.65) + ((1 - Math.abs(lambda - 0.32) / 0.32) * 0.35), 0, 1);

      return {
        mode: substrate.mode,
        rule: substrate.getLifeRule?.().rule ?? fallback.rule,
        activeDensity: density,
        meanEnergy: mean,
        entropy,
        variance,
        edgeOfChaos,
        lambda
      };
    } catch (error) {
      return fallback;
    }
  }

  _worldStats(worldGen, resources, climate) {
    if (!worldGen?.biomeMap) return { biomeDiversity: 0, avgResource: 0, resourceBalance: 0, season: 'unknown' };
    const key = `${worldGen.seed}:${worldGen.width}x${worldGen.height}:${climate?.currentTick ?? 0}`;
    if (this._worldCache?.key === key) return this._worldCache.stats;

    const biomeCounts = new Map();
    let resourceSum = 0;
    let tempSum = 0;
    const total = worldGen.width * worldGen.height;
    const step = Math.max(1, Math.floor(total / 4096));
    let count = 0;
    for (let i = 0; i < total; i += step) {
      const biome = worldGen.biomeMap[i];
      biomeCounts.set(biome, (biomeCounts.get(biome) ?? 0) + 1);
      resourceSum += resources?.resourceGrid?.[i] ?? worldGen.resourceMap[i] ?? 0;
      tempSum += worldGen.temperatureMap[i] ?? 0;
      count++;
    }

    const biomeDiversity = shannonIndex([...biomeCounts.values()]);
    const avgResource = resourceSum / Math.max(1, count);
    const stats = {
      biomeDiversity,
      avgResource,
      avgTemperature: tempSum / Math.max(1, count),
      resourceBalance: clamp(avgResource, 0, 1),
      season: climate?.getCurrentSeason?.() ?? 'unknown',
      extremeEvents: climate?.extremeEvents?.length ?? 0
    };
    this._worldCache = { key, stats };
    return stats;
  }

  _eventStats(eventBus) {
    const recent = eventBus?.getHistory?.({ limit: 160 }) ?? [];
    const byType = new Map();
    const byLayer = new Map();
    for (const event of recent) {
      byType.set(event.type, (byType.get(event.type) ?? 0) + 1);
      byLayer.set(event.source_layer, (byLayer.get(event.source_layer) ?? 0) + 1);
    }
    return {
      recentCount: recent.length,
      typeCount: byType.size,
      byType: Object.fromEntries([...byType.entries()].slice(0, 12)),
      byLayer: Object.fromEntries(byLayer)
    };
  }

  _societyStats(social, economy, beliefs, governance, civilization) {
    const normCount = [...(governance?.norms?.values?.() ?? [])].reduce((sum, list) => sum + list.length, 0);
    const lawCount = [...(governance?.laws?.values?.() ?? [])].reduce((sum, list) => sum + list.length, 0);
    const civStats = civilization?.getStats?.() ?? {};
    return {
      clans: social?.clans?.size ?? 0,
      settlements: civStats.settlementCount ?? 0,
      stage: civStats.stage ?? 'substrate',
      knowledgeIndex: civStats.knowledgeIndex ?? 0,
      technologies: civStats.technologyCount ?? 0,
      archives: civStats.archiveCount ?? 0,
      professions: economy?.professions?.size ?? 0,
      gdp: economy?.gdp ?? 0,
      beliefs: beliefs?.beliefs?.size ?? 0,
      religions: beliefs?.religionClusters?.length ?? 0,
      norms: normCount,
      laws: lawCount
    };
  }

  _phase(score, substrate, population, society) {
    if (population.alive <= 0) return 'Estinzione';
    if (score < 20) return 'Nucleazione';
    if (substrate.edgeOfChaos > 0.72 && population.species > 1 && score < 48) return 'Edge of chaos';
    if (society.settlements > 0 && society.technologies < 2) return 'Proto-civilta';
    if (society.technologies >= 2 && society.laws === 0) return 'Cultura cumulativa';
    if (society.laws > 0 || society.technologies >= 5) return 'Istituzioni';
    return 'Ecosistema adattivo';
  }

  _deltas(sample, previous) {
    if (!previous) {
      return { emergence: 0, population: 0, diversity: 0, complexity: 0, events: 0 };
    }
    return {
      emergence: sample.emergenceScore - previous.emergenceScore,
      population: sample.population.alive - previous.population.alive,
      diversity: sample.population.diversity - previous.population.diversity,
      complexity: sample.population.avgComplexity - previous.population.avgComplexity,
      events: sample.events.recentCount - previous.events.recentCount
    };
  }

  _drivers(sample) {
    const drivers = [];
    const add = (label, score, evidence, explanation) => {
      drivers.push({ label, score: clamp(score, 0, 1), evidence, explanation });
    };

    add(
      'Substrato computazionale',
      sample.substrate.edgeOfChaos,
      `lambda=${sample.substrate.lambda.toFixed(3)}, H=${sample.substrate.entropy.toFixed(2)}`,
      'Pattern locali abbastanza stabili da conservare informazione, ma non cosi statici da congelare la dinamica.'
    );
    add(
      'Selezione biologica',
      sample.normalized.biologicalComplexity,
      `C_neurale=${sample.population.avgComplexity.toFixed(2)}, specie=${sample.population.species}`,
      'Le reti NEAT stanno accumulando topologia utile, quindi l evoluzione non e solo demografica ma strutturale.'
    );
    add(
      'Pressione ecologica',
      1 - Math.abs(sample.world.avgResource - 0.55),
      `risorse=${sample.world.avgResource.toFixed(2)}, biomi H=${sample.world.biomeDiversity.toFixed(2)}`,
      'La disponibilita di risorse determina quanto spazio esiste per specializzazione, competizione e cooperazione.'
    );
    add(
      'Cultura cumulativa',
      sample.normalized.socialComplexity,
      `tech=${sample.society.technologies}, professioni=${sample.society.professions}, leggi=${sample.society.laws}`,
      'Professioni, credenze, archivi e norme trasformano popolazione biologica in memoria sociale.'
    );

    return drivers.sort((a, b) => b.score - a.score).slice(0, 4);
  }

  _principlesFor(sample) {
    const ids = new Set(['gol', 'shannon', 'neat']);
    if (sample.substrate.mode === 1) ids.add('gray_scott');
    if (sample.society.beliefs > 0 || sample.society.professions > 0) ids.add('bass');
    if (sample.society.norms > 0 || sample.society.laws > 0) ids.add('governance');
    return PRINCIPLES.filter((p) => ids.has(p.id));
  }

  _summary(sample, trend) {
    if (!sample) return 'No simulation samples are available yet.';
    const direction = trend.emergenceDelta >= 0 ? 'in crescita' : 'in contrazione';
    return `Al tick ${sample.tick}, Genesis e nella fase "${sample.phase}" con indice di emergenza ${sample.emergenceScore.toFixed(1)}/100, ${direction} di ${Math.abs(trend.emergenceDelta).toFixed(1)} punti nella finestra analizzata. La popolazione attiva e ${sample.population.alive}, distribuita in ${sample.population.species} specie, con ${sample.society.technologies} tecnologie e ${sample.society.professions} professioni tracciate.`;
  }
}

export default EmergenceAnalytics;
