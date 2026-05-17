/**
 * @module SocialStructure
 * @description Social organization system — clans, leadership, alliances.
 * Models the transition from egalitarian bands to stratified chiefdoms.
 */

import eventBus from '../meta/event_bus.js';

export class SocialStructure {
  constructor() {
    this.clans = new Map();
    this.alliances = new Map();
    this.conflicts = [];
    this.nextClanId = 0;
  }

  formClan(founderId, memberIds, name, location) {
    const id = this.nextClanId++;
    const members = new Set([founderId, ...memberIds]);
    this.clans.set(id, { id, name, founder: founderId, leader: founderId, members,
      location, prestige: 0, laws: [], established: 0, type: 'band' });
    eventBus.publish('society.clan_formed', { clanId: id, name, founderIdl: founderId }, { source_layer: 4 });
    return id;
  }

  addMember(clanId, agentId) {
    const clan = this.clans.get(clanId);
    if (clan) clan.members.add(agentId);
  }

  removeMember(clanId, agentId) {
    const clan = this.clans.get(clanId);
    if (clan) {
      clan.members.delete(agentId);
      if (clan.leader === agentId) this._electLeader(clanId);
      if (clan.members.size === 0) this.clans.delete(clanId);
    }
  }

  _electLeader(clanId) {
    const clan = this.clans.get(clanId);
    if (!clan || clan.members.size === 0) return;
    // Simple: pick random member (could be prestige-based)
    clan.leader = [...clan.members][0];
  }

  /** Update social complexity based on population density (Tainter) */
  updateComplexity() {
    for (const [id, clan] of this.clans) {
      const size = clan.members.size;
      if (size < 20) clan.type = 'band';
      else if (size < 100) clan.type = 'tribe';
      else if (size < 500) clan.type = 'chiefdom';
      else clan.type = 'state';
    }
  }

  formAlliance(clanId1, clanId2) {
    const key = [clanId1, clanId2].sort().join('-');
    this.alliances.set(key, { clans: [clanId1, clanId2], strength: 0.5, formed: 0 });
    eventBus.publish('society.alliance', { clanId1, clanId2 }, { source_layer: 4 });
  }

  declareConflict(clanId1, clanId2, cause) {
    this.conflicts.push({ attacker: clanId1, defender: clanId2, cause, resolved: false });
    eventBus.publish('society.conflict', { attacker: clanId1, defender: clanId2, cause }, { source_layer: 4, priority: 7 });
  }

  serialize() {
    return {
      clans: [...this.clans.entries()].map(([id, c]) => ({ ...c, members: [...c.members] })),
      alliances: [...this.alliances.entries()],
      nextClanId: this.nextClanId
    };
  }

  deserialize(state) {
    if (!state) return;
    this.nextClanId = state.nextClanId ?? 0;
    this.clans.clear();
    for (const cd of (state.clans ?? [])) {
      this.clans.set(cd.id, { ...cd, members: new Set(cd.members ?? []) });
    }
    this.alliances = new Map(state.alliances ?? []);
  }
}

export default SocialStructure;
