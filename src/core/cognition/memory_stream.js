/**
 * @module MemoryStream
 * @description Agent memory system with multi-factor retrieval:
 * recency decay, semantic similarity, emotional congruence, and context.
 */

import { cosineSimilarity, memoryScore } from '../../utils/math_helpers.js';

export class MemoryEvent {
  constructor(description, importance, emotionalTags, embedding = null) {
    this.description = description;
    this.timestamp = 0;
    this.importance = importance;
    this.emotionalTags = emotionalTags; // { joy, fear, anger, surprise, sadness, disgust }
    this.embedding = embedding ?? this._simpleEmbed(description);
    this.accessCount = 0;
  }

  _simpleEmbed(text) {
    // Simplified 64-dim embedding via character hash
    const emb = new Float32Array(64);
    for (let i = 0; i < text.length; i++) {
      const idx = text.charCodeAt(i) % 64;
      emb[idx] += 1.0 / (1 + i * 0.1);
    }
    // Normalize
    let mag = 0;
    for (let i = 0; i < 64; i++) mag += emb[i] * emb[i];
    mag = Math.sqrt(mag) || 1;
    for (let i = 0; i < 64; i++) emb[i] /= mag;
    return emb;
  }
}

export class MemoryStream {
  constructor(capacity = 200) {
    this.memories = [];
    this.capacity = capacity;
  }

  add(description, importance, emotionalTags, simTime) {
    const mem = new MemoryEvent(description, importance, emotionalTags);
    mem.timestamp = simTime;
    this.memories.push(mem);
    if (this.memories.length > this.capacity) {
      // Remove least important old memory
      let minScore = Infinity, minIdx = 0;
      for (let i = 0; i < this.memories.length; i++) {
        const s = this.memories[i].importance * (1 / (1 + simTime - this.memories[i].timestamp));
        if (s < minScore) { minScore = s; minIdx = i; }
      }
      this.memories.splice(minIdx, 1);
    }
  }

  /** Retrieve top-k memories based on multi-factor scoring */
  retrieve(query, currentEmotion, currentContext, simTime, k = 10) {
    const queryEmbed = new MemoryEvent(query, 0, {}).embedding;

    const scored = this.memories.map(mem => {
      const recency = simTime - mem.timestamp;
      const semanticSim = cosineSimilarity(queryEmbed, mem.embedding);
      const emotionalMatch = this._emotionalCongruence(mem.emotionalTags, currentEmotion);
      const contextMatch = currentContext ? (mem.description.includes(currentContext) ? 1 : 0) : 0;
      const score = memoryScore(recency, semanticSim, emotionalMatch, contextMatch, recency);
      mem.accessCount++;
      return { memory: mem, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k).map(s => s.memory);
  }

  _emotionalCongruence(memEmo, currentEmo) {
    if (!memEmo || !currentEmo) return 0;
    let match = 0, count = 0;
    for (const key of ['joy', 'fear', 'anger', 'surprise', 'sadness', 'disgust']) {
      if (memEmo[key] !== undefined && currentEmo[key] !== undefined) {
        match += 1 - Math.abs(memEmo[key] - currentEmo[key]);
        count++;
      }
    }
    return count > 0 ? match / count : 0;
  }

  getRecentMemories(count = 5) {
    return this.memories.slice(-count);
  }

  serialize() { return { memories: this.memories, capacity: this.capacity }; }
  deserialize(state) { if (state) { this.memories = state.memories ?? []; this.capacity = state.capacity ?? 200; } }
}

export default MemoryStream;
