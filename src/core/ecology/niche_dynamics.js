/**
 * @module NicheDynamics
 * @description Ecological niche modeling — determines species distribution
 * based on climate envelopes, resource availability, and competition.
 */

export class NicheDynamics {
  constructor(trophicNetwork) {
    this.trophicNetwork = trophicNetwork;
    this.niches = new Map();
  }

  /** Define an ecological niche for a species */
  defineNiche(speciesId, params) {
    this.niches.set(speciesId, {
      optimalTemp: params.optimalTemp ?? 20,
      tempRange: params.tempRange ?? 15,
      optimalHumidity: params.optimalHumidity ?? 0.5,
      humidityRange: params.humidityRange ?? 0.3,
      preferredAltitude: params.preferredAltitude ?? 0.3,
      altitudeRange: params.altitudeRange ?? 0.4,
      competitiveness: params.competitiveness ?? 0.5
    });
  }

  /** Calculate suitability score (0-1) for a species in given conditions */
  getSuitability(speciesId, temperature, humidity, altitude) {
    const niche = this.niches.get(speciesId);
    if (!niche) return 0.5;

    const tempDiff = (temperature - niche.optimalTemp) / niche.tempRange;
    const humDiff = (humidity - niche.optimalHumidity) / niche.humidityRange;
    const altDiff = (altitude - niche.preferredAltitude) / niche.altitudeRange;
    const tempFit = Math.exp(-(tempDiff * tempDiff));
    const humFit = Math.exp(-(humDiff * humDiff));
    const altFit = Math.exp(-(altDiff * altDiff));

    return tempFit * humFit * altFit;
  }

  /** Get dominant species for a set of environmental conditions */
  getDominantSpecies(temperature, humidity, altitude, candidates) {
    let best = null, bestScore = 0;
    for (const speciesId of candidates) {
      const score = this.getSuitability(speciesId, temperature, humidity, altitude);
      if (score > bestScore) { bestScore = score; best = speciesId; }
    }
    return { speciesId: best, suitability: bestScore };
  }

  serialize() { return { niches: [...this.niches.entries()] }; }
  deserialize(state) { if (state?.niches) this.niches = new Map(state.niches); }
}

export default NicheDynamics;
