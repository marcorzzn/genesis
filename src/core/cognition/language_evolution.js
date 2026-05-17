/**
 * @module LanguageEvolution
 * @description Diachronic phonetic language evolution system.
 * Words are articulatory feature vectors that mutate over time and distance.
 * Implements Grimm's Law-like shifts and dialectal divergence.
 */

import { SeededRandom, cosineSimilarity } from '../../utils/math_helpers.js';
import eventBus from '../meta/event_bus.js';

/** Articulatory features: place, manner, voicing, height, backness, roundness */
const FEATURE_DIM = 8;

export class Language {
  constructor(id, parentId = null) {
    this.id = id;
    this.parentId = parentId;
    this.vocabulary = new Map(); // concept -> Float32Array (articulatory features)
    this.speakers = 0;
    this.centerX = 0; this.centerY = 0;
    this.age = 0;
  }
}

export class LanguageEvolution {
  constructor(seed = 42) {
    this.rng = new SeededRandom(seed);
    this.languages = new Map();
    this.nextLangId = 0;
    this.baseVocabulary = ['water', 'fire', 'food', 'danger', 'friend', 'enemy', 'sky', 'earth',
      'sun', 'moon', 'hunt', 'gather', 'build', 'trade', 'god', 'death', 'birth', 'love',
      'fear', 'anger', 'home', 'tool', 'animal', 'plant', 'stone', 'river', 'mountain'];
  }

  /** Create a new proto-language */
  createLanguage(centerX, centerY, parentId = null) {
    const id = this.nextLangId++;
    const lang = new Language(id, parentId);
    lang.centerX = centerX;
    lang.centerY = centerY;

    if (parentId !== null && this.languages.has(parentId)) {
      // Derive from parent
      const parent = this.languages.get(parentId);
      for (const [concept, features] of parent.vocabulary) {
        lang.vocabulary.set(concept, new Float32Array(features));
      }
      // Apply initial shift
      this._applyPhoneticShift(lang);
    } else {
      // Generate random vocabulary
      for (const concept of this.baseVocabulary) {
        const features = new Float32Array(FEATURE_DIM);
        for (let i = 0; i < FEATURE_DIM; i++) features[i] = this.rng.nextFloat(-1, 1);
        lang.vocabulary.set(concept, features);
      }
    }

    this.languages.set(id, lang);
    eventBus.publish('language.created', { id, parentId }, { source_layer: 4 });
    return id;
  }

  /** Apply time-based phonetic drift to all languages */
  tick() {
    for (const [id, lang] of this.languages) {
      lang.age++;
      if (lang.age % 100 === 0) {
        this._driftLanguage(lang);
      }
    }
  }

  _driftLanguage(lang) {
    for (const [concept, features] of lang.vocabulary) {
      for (let i = 0; i < FEATURE_DIM; i++) {
        features[i] += this.rng.gaussian(0, 0.01);
        features[i] = Math.max(-2, Math.min(2, features[i]));
      }
    }
  }

  /** Apply a major phonetic shift (like Grimm's Law) */
  _applyPhoneticShift(lang) {
    const shiftDim = this.rng.nextInt(0, FEATURE_DIM - 1);
    const shiftAmount = this.rng.gaussian(0, 0.3);
    for (const features of lang.vocabulary.values()) {
      features[shiftDim] += shiftAmount;
    }
  }

  /** Calculate linguistic distance between two languages (0 = identical, 1 = incomprehensible) */
  getDistance(langId1, langId2) {
    const l1 = this.languages.get(langId1);
    const l2 = this.languages.get(langId2);
    if (!l1 || !l2) return 1;
    if (langId1 === langId2) return 0;

    let totalDist = 0, count = 0;
    for (const [concept, f1] of l1.vocabulary) {
      const f2 = l2.vocabulary.get(concept);
      if (f2) {
        totalDist += 1 - cosineSimilarity(f1, f2);
        count++;
      }
    }
    return count > 0 ? totalDist / count : 1;
  }

  /** Get communication penalty between two agents */
  getCommunicationPenalty(agentLangId, targetLangId) {
    const dist = this.getDistance(agentLangId, targetLangId);
    return dist > 0.7 ? 1.0 : dist; // Above 0.7 = incomprehensible
  }

  /** Add a new word/concept to a language */
  addConcept(langId, concept) {
    const lang = this.languages.get(langId);
    if (!lang || lang.vocabulary.has(concept)) return;
    const features = new Float32Array(FEATURE_DIM);
    for (let i = 0; i < FEATURE_DIM; i++) features[i] = this.rng.nextFloat(-1, 1);
    lang.vocabulary.set(concept, features);
  }

  /** Get language family tree for visualization */
  getFamilyTree() {
    const root = { name: 'Proto-Language', children: [], id: -1 };
    const nodeMap = new Map();
    nodeMap.set(-1, root);

    for (const [id, lang] of this.languages) {
      const node = { name: `Language ${id}`, id, speakers: lang.speakers, age: lang.age, children: [] };
      nodeMap.set(id, node);
    }

    for (const [id, lang] of this.languages) {
      const parent = nodeMap.get(lang.parentId ?? -1) ?? root;
      parent.children.push(nodeMap.get(id));
    }

    return root;
  }

  serialize() {
    const langs = [];
    for (const [id, lang] of this.languages) {
      const vocab = {};
      for (const [c, f] of lang.vocabulary) vocab[c] = [...f];
      langs.push({ id, parentId: lang.parentId, vocab, speakers: lang.speakers,
        centerX: lang.centerX, centerY: lang.centerY, age: lang.age });
    }
    return { languages: langs, nextLangId: this.nextLangId };
  }

  deserialize(state) {
    if (!state) return;
    this.nextLangId = state.nextLangId ?? 0;
    this.languages.clear();
    for (const ld of (state.languages ?? [])) {
      const lang = new Language(ld.id, ld.parentId);
      for (const [c, f] of Object.entries(ld.vocab ?? {})) {
        lang.vocabulary.set(c, new Float32Array(f));
      }
      lang.speakers = ld.speakers ?? 0;
      lang.centerX = ld.centerX ?? 0; lang.centerY = ld.centerY ?? 0;
      lang.age = ld.age ?? 0;
      this.languages.set(ld.id, lang);
    }
  }
}

export default LanguageEvolution;
