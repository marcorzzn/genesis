/**
 * @module UniversalEventBus
 * @description The central nervous system of Project Genesis.
 * Implements a publish/subscribe event bus with priority queues,
 * causal event tracking, per-layer FIFO queues, and asynchronous propagation.
 * ALL inter-layer communication flows exclusively through this bus.
 *
 * Event Schema:
 * {
 *   id: string (UUID v4),
 *   source_layer: number (0-5),
 *   target_layer: number (0-5) | 'ALL',
 *   type: string (e.g. 'energy.transfer', 'entity.birth'),
 *   payload: Object (JSON-serializable),
 *   timestamp: number (simulation time),
 *   parent_event_id: string | null,
 *   priority: number (1-10, 10 = critical)
 * }
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * @typedef {Object} GenesisEvent
 * @property {string} id - Unique event identifier (UUID v4)
 * @property {number} source_layer - Originating layer (0-5)
 * @property {number|string} target_layer - Target layer (0-5 or 'ALL')
 * @property {string} type - Event type (dot-notation category)
 * @property {Object} payload - JSON-serializable event data
 * @property {number} timestamp - Simulation time of creation
 * @property {string|null} parent_event_id - Causal parent event ID
 * @property {number} priority - Priority level (1-10, 10 = critical)
 */

/**
 * @typedef {Object} Subscription
 * @property {string} id - Subscription identifier
 * @property {string} type - Event type pattern (supports wildcard '*')
 * @property {number} layer - Subscriber's layer
 * @property {number} priority - Subscription priority (higher = called first)
 * @property {Function} handler - Callback function
 */

/** Maximum number of events to retain in the history log */
const MAX_HISTORY_SIZE = 10000;

/** Maximum events to process per flush cycle */
const MAX_EVENTS_PER_FLUSH = 500;

/**
 * Universal Event Bus — the sole communication backbone of Genesis.
 * Ensures no direct module-to-module dependencies across layers.
 */
class UniversalEventBus {
  constructor() {
    /** @type {Map<string, Subscription[]>} Subscriptions keyed by event type */
    this._subscriptions = new Map();

    /** @type {Map<string, Subscription[]>} Wildcard subscriptions keyed by prefix */
    this._wildcardSubs = new Map();

    /** @type {GenesisEvent[][]} Per-priority queues (index 0 = priority 10, index 9 = priority 1) */
    this._priorityQueues = Array.from({ length: 10 }, () => []);

    /** @type {GenesisEvent[]} Circular history buffer */
    this._history = [];

    /** @type {number} Current write position in circular buffer */
    this._historyIndex = 0;

    /** @type {Map<string, GenesisEvent>} Fast lookup for causal chain traversal */
    this._eventIndex = new Map();

    /** @type {number} Current simulation time */
    this._simTime = 0;

    /** @type {boolean} Whether the bus is currently flushing */
    this._flushing = false;

    /** @type {number} Total events ever published */
    this._totalPublished = 0;

    /** @type {number} Total events ever delivered */
    this._totalDelivered = 0;

    /** @type {boolean} Whether event logging is enabled */
    this._loggingEnabled = false;

    /** @type {Set<string>} Event types to log (empty = log all) */
    this._logFilter = new Set();
  }

  /**
   * Subscribes a handler to a specific event type.
   * @param {string} type - Event type to listen for. Use '*' suffix for wildcards (e.g. 'entity.*')
   * @param {Function} handler - Callback receiving (event: GenesisEvent)
   * @param {Object} [options={}] - Subscription options
   * @param {number} [options.layer=0] - Subscriber's layer number
   * @param {number} [options.priority=5] - Handler priority (higher = called first)
   * @returns {string} Subscription ID for unsubscribing
   */
  subscribe(type, handler, options = {}) {
    if (typeof type !== 'string' || !type) {
      throw new Error(`[EventBus] Invalid event type: ${type}`);
    }
    if (typeof handler !== 'function') {
      throw new Error('[EventBus] Handler must be a function');
    }

    const sub = {
      id: uuidv4(),
      type,
      layer: options.layer ?? 0,
      priority: Math.max(1, Math.min(10, options.priority ?? 5)),
      handler
    };

    if (type.endsWith('.*')) {
      const prefix = type.slice(0, -2);
      if (!this._wildcardSubs.has(prefix)) {
        this._wildcardSubs.set(prefix, []);
      }
      const list = this._wildcardSubs.get(prefix);
      list.push(sub);
      list.sort((a, b) => b.priority - a.priority);
    } else {
      if (!this._subscriptions.has(type)) {
        this._subscriptions.set(type, []);
      }
      const list = this._subscriptions.get(type);
      list.push(sub);
      list.sort((a, b) => b.priority - a.priority);
    }

    return sub.id;
  }

  /**
   * Unsubscribes a handler by its subscription ID.
   * @param {string} subId - The subscription ID returned by subscribe()
   * @returns {boolean} True if the subscription was found and removed
   */
  unsubscribe(subId) {
    for (const [key, list] of this._subscriptions) {
      const idx = list.findIndex(s => s.id === subId);
      if (idx !== -1) {
        list.splice(idx, 1);
        if (list.length === 0) this._subscriptions.delete(key);
        return true;
      }
    }
    for (const [key, list] of this._wildcardSubs) {
      const idx = list.findIndex(s => s.id === subId);
      if (idx !== -1) {
        list.splice(idx, 1);
        if (list.length === 0) this._wildcardSubs.delete(key);
        return true;
      }
    }
    return false;
  }

  /**
   * Publishes an event to the bus. Events are queued by priority and
   * processed during the next flush cycle.
   * @param {string} type - Event type
   * @param {Object} payload - Event data (must be JSON-serializable)
   * @param {Object} [options={}] - Event options
   * @param {number} [options.source_layer=0] - Source layer number
   * @param {number|string} [options.target_layer='ALL'] - Target layer
   * @param {number} [options.priority=5] - Event priority (1-10)
   * @param {string|null} [options.parent_event_id=null] - Causal parent event ID
   * @returns {string} The published event's ID
   */
  publish(type, payload = {}, options = {}) {
    if (typeof type !== 'string' || !type) {
      throw new Error(`[EventBus] Invalid event type for publish: ${type}`);
    }

    const priority = Math.max(1, Math.min(10, options.priority ?? 5));

    /** @type {GenesisEvent} */
    const event = {
      id: uuidv4(),
      source_layer: options.source_layer ?? 0,
      target_layer: options.target_layer ?? 'ALL',
      type,
      payload,
      timestamp: this._simTime,
      parent_event_id: options.parent_event_id ?? null,
      priority
    };

    // Enqueue by priority (index 0 = highest priority 10)
    const queueIndex = 10 - priority;
    this._priorityQueues[queueIndex].push(event);
    this._totalPublished++;

    if (this._loggingEnabled) {
      if (this._logFilter.size === 0 || this._logFilter.has(type) ||
          this._matchesWildcardFilter(type)) {
        console.log(`[EventBus] Published: ${type} (priority=${priority}, src=${event.source_layer})`, payload);
      }
    }

    return event.id;
  }

  /**
   * Publishes and immediately delivers an event synchronously.
   * Use sparingly — only for critical events that need instant propagation.
   * @param {string} type - Event type
   * @param {Object} payload - Event data
   * @param {Object} [options={}] - Event options (same as publish)
   * @returns {string} The event's ID
   */
  emit(type, payload = {}, options = {}) {
    const eventId = this.publish(type, payload, { ...options, priority: 10 });
    this.flush();
    return eventId;
  }

  /**
   * Processes all queued events in priority order.
   * Called once per simulation tick from the main loop.
   * @returns {number} Number of events processed
   */
  flush() {
    if (this._flushing) return 0;
    this._flushing = true;

    let processed = 0;

    try {
      for (let qi = 0; qi < 10 && processed < MAX_EVENTS_PER_FLUSH; qi++) {
        const queue = this._priorityQueues[qi];
        while (queue.length > 0 && processed < MAX_EVENTS_PER_FLUSH) {
          const event = queue.shift();
          this._deliverEvent(event);
          this._recordHistory(event);
          processed++;
        }
      }
    } finally {
      this._flushing = false;
    }

    return processed;
  }

  /**
   * Delivers a single event to all matching subscribers.
   * @param {GenesisEvent} event
   * @private
   */
  _deliverEvent(event) {
    const handlers = this._collectHandlers(event);
    for (const sub of handlers) {
      try {
        sub.handler(event);
        this._totalDelivered++;
      } catch (error) {
        console.error(
          `[EventBus] Handler error for "${event.type}" (sub=${sub.id}):`,
          error
        );
      }
    }
  }

  /**
   * Collects all handlers matching an event (exact + wildcard), filtered by target layer.
   * @param {GenesisEvent} event
   * @returns {Subscription[]}
   * @private
   */
  _collectHandlers(event) {
    /** @type {Subscription[]} */
    const result = [];

    // Exact match
    const exact = this._subscriptions.get(event.type);
    if (exact) {
      for (const sub of exact) {
        if (event.target_layer === 'ALL' || event.target_layer === sub.layer) {
          result.push(sub);
        }
      }
    }

    // Wildcard match: check all prefixes of the event type
    const parts = event.type.split('.');
    for (let i = 1; i <= parts.length; i++) {
      const prefix = parts.slice(0, i).join('.');
      const wildcard = this._wildcardSubs.get(prefix);
      if (wildcard) {
        for (const sub of wildcard) {
          if (event.target_layer === 'ALL' || event.target_layer === sub.layer) {
            result.push(sub);
          }
        }
      }
    }

    // Sort by priority (already sorted within each list, but merged list needs re-sort)
    result.sort((a, b) => b.priority - a.priority);
    return result;
  }

  /**
   * Records an event in the circular history buffer.
   * @param {GenesisEvent} event
   * @private
   */
  _recordHistory(event) {
    if (this._history.length < MAX_HISTORY_SIZE) {
      this._history.push(event);
    } else {
      this._history[this._historyIndex] = event;
    }
    this._historyIndex = (this._historyIndex + 1) % MAX_HISTORY_SIZE;
    this._eventIndex.set(event.id, event);

    // Evict old entries from the index to prevent unbounded growth
    if (this._eventIndex.size > MAX_HISTORY_SIZE * 2) {
      const cutoff = this._simTime - 100000;
      for (const [id, ev] of this._eventIndex) {
        if (ev.timestamp < cutoff) {
          this._eventIndex.delete(id);
        }
      }
    }
  }

  /**
   * Checks if an event type matches any wildcard log filter.
   * @param {string} type
   * @returns {boolean}
   * @private
   */
  _matchesWildcardFilter(type) {
    for (const filter of this._logFilter) {
      if (filter.endsWith('.*') && type.startsWith(filter.slice(0, -2))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Updates the simulation time. Called each tick.
   * @param {number} time - New simulation time
   */
  setSimulationTime(time) {
    this._simTime = time;
  }

  /**
   * Gets the current simulation time.
   * @returns {number}
   */
  getSimulationTime() {
    return this._simTime;
  }

  /**
   * Retrieves the causal chain of an event (ancestors).
   * @param {string} eventId - Starting event ID
   * @param {number} [maxDepth=50] - Maximum chain depth
   * @returns {GenesisEvent[]} Array of events from oldest ancestor to the given event
   */
  getCausalChain(eventId, maxDepth = 50) {
    const chain = [];
    let currentId = eventId;
    let depth = 0;

    while (currentId && depth < maxDepth) {
      const event = this._eventIndex.get(currentId);
      if (!event) break;
      chain.unshift(event);
      currentId = event.parent_event_id;
      depth++;
    }

    return chain;
  }

  /**
   * Retrieves recent events matching optional filters.
   * @param {Object} [filters={}]
   * @param {string} [filters.type] - Event type filter (prefix match)
   * @param {number} [filters.source_layer] - Source layer filter
   * @param {number} [filters.limit=100] - Max events to return
   * @returns {GenesisEvent[]}
   */
  getHistory(filters = {}) {
    const limit = filters.limit ?? 100;
    let result = [];

    // Walk backwards through history
    const len = Math.min(this._history.length, MAX_HISTORY_SIZE);
    let idx = (this._historyIndex - 1 + len) % len;

    for (let i = 0; i < len && result.length < limit; i++) {
      const event = this._history[idx];
      if (event) {
        let match = true;
        if (filters.type && !event.type.startsWith(filters.type)) match = false;
        if (filters.source_layer !== undefined && event.source_layer !== filters.source_layer) match = false;
        if (match) result.push(event);
      }
      idx = (idx - 1 + len) % len;
    }

    return result;
  }

  /**
   * Enables or disables event logging to console.
   * @param {boolean} enabled
   * @param {string[]} [typeFilters=[]] - If provided, only log these types
   */
  setLogging(enabled, typeFilters = []) {
    this._loggingEnabled = enabled;
    this._logFilter.clear();
    for (const f of typeFilters) {
      this._logFilter.add(f);
    }
  }

  /**
   * Returns diagnostic statistics about the event bus.
   * @returns {Object}
   */
  getStats() {
    let pendingCount = 0;
    for (const q of this._priorityQueues) pendingCount += q.length;

    return {
      totalPublished: this._totalPublished,
      totalDelivered: this._totalDelivered,
      pendingEvents: pendingCount,
      subscriptionCount: this._countSubscriptions(),
      historySize: Math.min(this._history.length, MAX_HISTORY_SIZE),
      simulationTime: this._simTime
    };
  }

  /**
   * Counts total active subscriptions.
   * @returns {number}
   * @private
   */
  _countSubscriptions() {
    let count = 0;
    for (const list of this._subscriptions.values()) count += list.length;
    for (const list of this._wildcardSubs.values()) count += list.length;
    return count;
  }

  /**
   * Removes all subscriptions and clears all queues.
   * Used for simulation reset.
   */
  reset() {
    this._subscriptions.clear();
    this._wildcardSubs.clear();
    for (const q of this._priorityQueues) q.length = 0;
    this._history.length = 0;
    this._historyIndex = 0;
    this._eventIndex.clear();
    this._simTime = 0;
    this._totalPublished = 0;
    this._totalDelivered = 0;
  }

  /**
   * Serializes the event bus state for persistence.
   * Only serializes history and simulation time (not subscriptions).
   * @returns {Object} Serializable state
   */
  serialize() {
    return {
      simTime: this._simTime,
      history: this._history.slice(0, Math.min(this._history.length, 1000)),
      totalPublished: this._totalPublished,
      totalDelivered: this._totalDelivered
    };
  }

  /**
   * Restores event bus state from a serialized snapshot.
   * @param {Object} state - Previously serialized state
   */
  deserialize(state) {
    if (!state) return;
    this._simTime = state.simTime ?? 0;
    this._history = state.history ?? [];
    this._historyIndex = this._history.length % MAX_HISTORY_SIZE;
    this._totalPublished = state.totalPublished ?? 0;
    this._totalDelivered = state.totalDelivered ?? 0;

    this._eventIndex.clear();
    for (const event of this._history) {
      if (event && event.id) {
        this._eventIndex.set(event.id, event);
      }
    }
  }
}

/** @type {UniversalEventBus} Singleton instance */
const eventBus = new UniversalEventBus();
export default eventBus;
export { UniversalEventBus };
