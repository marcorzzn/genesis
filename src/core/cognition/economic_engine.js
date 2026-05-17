/**
 * @module EconomicEngine
 * @description Agent-based economic simulation with dynamic pricing,
 * profession specialization, supply chains, and market mechanics.
 */

import eventBus from '../meta/event_bus.js';

export class EconomicEngine {
  constructor() {
    this.markets = new Map(); // regionId -> Market
    this.professions = new Set();
    this.gdp = 0;
    this.tradeHistory = [];
  }

  createMarket(regionId) {
    this.markets.set(regionId, {
      id: regionId,
      goods: new Map(), // goodName -> { supply, demand, price, lastTradePrice }
      traders: new Set()
    });
  }

  registerGood(regionId, goodName, initialSupply = 10, basePrice = 1) {
    const market = this.markets.get(regionId);
    if (!market) return;
    market.goods.set(goodName, { supply: initialSupply, demand: 0, price: basePrice, lastTradePrice: basePrice });
  }

  /** Execute a trade between agents */
  trade(buyerId, sellerId, goodName, quantity, regionId) {
    const market = this.markets.get(regionId);
    if (!market) return null;
    const good = market.goods.get(goodName);
    if (!good || good.supply < quantity) return null;

    const totalPrice = good.price * quantity;
    good.supply -= quantity;
    good.demand += quantity;
    good.lastTradePrice = good.price;

    this.gdp += totalPrice;
    this.tradeHistory.push({ buyerId, sellerId, good: goodName, qty: quantity, price: good.price, region: regionId });
    if (this.tradeHistory.length > 1000) this.tradeHistory.shift();

    return { totalPrice, unitPrice: good.price };
  }

  /** Update prices based on supply/demand */
  updatePrices() {
    for (const [regionId, market] of this.markets) {
      for (const [name, good] of market.goods) {
        const ratio = good.demand > 0 ? good.supply / good.demand : 2;
        if (ratio < 0.5) good.price *= 1.05; // scarcity → price up
        else if (ratio > 2) good.price *= 0.95; // surplus → price down
        good.price = Math.max(0.01, Math.min(1000, good.price));
        good.demand *= 0.9; // decay demand
      }
    }
  }

  /** Discover/invent a new profession based on local resources */
  discoverProfession(agentId, resourceType, regionId) {
    const professionMap = {
      'stone': 'mason', 'wood': 'carpenter', 'food': 'farmer',
      'ore': 'blacksmith', 'fiber': 'weaver', 'herbs': 'healer',
      'clay': 'potter', 'fish': 'fisherman'
    };
    const prof = professionMap[resourceType] ?? 'artisan';
    this.professions.add(prof);
    eventBus.publish('economy.profession_discovered', { agentId, profession: prof, region: regionId }, { source_layer: 4 });
    return prof;
  }

  getStats() {
    return {
      gdp: this.gdp,
      marketCount: this.markets.size,
      professionCount: this.professions.size,
      professions: [...this.professions],
      recentTrades: this.tradeHistory.slice(-20)
    };
  }

  serialize() {
    return {
      markets: [...this.markets.entries()].map(([id, m]) => ({
        id, goods: [...m.goods.entries()], traders: [...m.traders]
      })),
      professions: [...this.professions],
      gdp: this.gdp
    };
  }

  deserialize(state) {
    if (!state) return;
    this.gdp = state.gdp ?? 0;
    this.professions = new Set(state.professions ?? []);
    this.markets.clear();
    for (const md of (state.markets ?? [])) {
      this.markets.set(md.id, { id: md.id, goods: new Map(md.goods ?? []), traders: new Set(md.traders ?? []) });
    }
  }
}

export default EconomicEngine;
