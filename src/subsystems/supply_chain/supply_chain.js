/**
 * @module SupplyChain
 * @description Supply chain economy: raw→intermediate→consumer goods
 * with transport costs based on geographic distance and terrain.
 */

export class SupplyChain {
  constructor() {
    this.chains = [];
    this.transportCosts = new Map();
  }

  defineChain(rawResource, intermediateGood, finalGood, conversionRate = 0.5) {
    this.chains.push({ raw: rawResource, intermediate: intermediateGood, final: finalGood, rate: conversionRate });
  }

  calculateTransportCost(fromX, fromY, toX, toY, terrainDifficulty = 1) {
    const dist = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
    return dist * 0.01 * terrainDifficulty;
  }

  processChain(chainIndex, rawAmount) {
    const chain = this.chains[chainIndex];
    if (!chain) return null;
    const intermediateAmount = rawAmount * chain.rate;
    const finalAmount = intermediateAmount * chain.rate;
    return { raw: rawAmount, intermediate: intermediateAmount, final: finalAmount };
  }

  getDefaultChains() {
    return [
      { raw: 'ore', intermediate: 'metal', final: 'tools' },
      { raw: 'wood', intermediate: 'planks', final: 'furniture' },
      { raw: 'grain', intermediate: 'flour', final: 'bread' },
      { raw: 'fiber', intermediate: 'cloth', final: 'clothing' },
      { raw: 'clay', intermediate: 'bricks', final: 'pottery' },
      { raw: 'herbs', intermediate: 'extract', final: 'medicine' }
    ];
  }

  serialize() { return { chains: this.chains }; }
  deserialize(state) { if (state) this.chains = state.chains ?? []; }
}

export default SupplyChain;
