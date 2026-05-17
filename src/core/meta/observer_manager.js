/**
 * @module ObserverManager
 * @description Level 0 — Manages the "divine observer" interactions with the simulation.
 * Every intervention is logged as a DivineEvent on the Universal Event Bus,
 * and injected into the belief systems of sentient agents (Level 4).
 * Implements the Command Pattern for undo/redo support.
 */

import eventBus from './event_bus.js';

/**
 * @typedef {Object} DivineIntervention
 * @property {string} id - Unique intervention ID
 * @property {string} type - Intervention type
 * @property {Object} params - Intervention parameters
 * @property {number} timestamp - Simulation time of intervention
 * @property {Object|null} undoData - Data needed to reverse the intervention
 */

/**
 * ObserverManager — the divine hand that reaches into the simulation.
 * All interactions are tracked, logged, and reported to sentient agents.
 */
class ObserverManager {
  constructor() {
    /** @type {DivineIntervention[]} Chronological log of all interventions */
    this._interventionLog = [];

    /** @type {DivineIntervention[]} Stack for undo operations */
    this._undoStack = [];

    /** @type {DivineIntervention[]} Stack for redo operations */
    this._redoStack = [];

    /** @type {number} Maximum undo history depth */
    this._maxUndoDepth = 100;

    /** @type {boolean} Whether observer interventions are currently enabled */
    this._enabled = true;

    /** @type {Map<string, number>} Intervention count by type for statistics */
    this._interventionCounts = new Map();
  }

  /**
   * Injects energy into a specific location in the simulation grid.
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} amount - Energy amount (0-1000)
   * @param {number} [radius=5] - Radius of effect
   * @returns {string} Event ID of the published divine event
   */
  injectEnergy(x, y, amount, radius = 5) {
    this._validateEnabled();
    this._validateNumber(x, 'x');
    this._validateNumber(y, 'y');
    this._validateNumber(amount, 'amount', 0, 1000);
    this._validateNumber(radius, 'radius', 1, 100);

    const params = { x, y, amount, radius };
    const eventId = this._publishDivineEvent('divine.energy_injection', params, {
      description: `Energy injected at (${x}, ${y}): amount=${amount}, radius=${radius}`,
      intensity: amount / 1000 // Normalized intensity for belief system
    });

    this._recordIntervention('energy_injection', params, eventId);
    return eventId;
  }

  /**
   * Modifies a physics constant at runtime.
   * @param {string} name - Constant name (e.g. 'feed_rate', 'kill_rate', 'diffusion_u')
   * @param {number} value - New value
   * @returns {string} Event ID
   */
  modifyPhysicsConstant(name, value) {
    this._validateEnabled();
    if (typeof name !== 'string' || !name) {
      throw new Error('[ObserverManager] Physics constant name must be a non-empty string');
    }
    this._validateNumber(value, name);

    const params = { name, value };
    const eventId = this._publishDivineEvent('divine.physics_modification', params, {
      description: `Physics constant "${name}" changed to ${value}`,
      intensity: 0.8 // High intensity — fundamental law change
    });

    this._recordIntervention('physics_modification', params, eventId);
    return eventId;
  }

  /**
   * Spawns a new entity at a specific location.
   * @param {Object} template - Entity template with species, genetics, etc.
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {string} Event ID
   */
  spawnEntity(template, x, y) {
    this._validateEnabled();
    if (!template || typeof template !== 'object') {
      throw new Error('[ObserverManager] Template must be a valid object');
    }
    this._validateNumber(x, 'x');
    this._validateNumber(y, 'y');

    const params = { template, x, y };
    const eventId = this._publishDivineEvent('divine.entity_spawn', params, {
      description: `Entity spawned at (${x}, ${y})`,
      intensity: 0.6
    });

    this._recordIntervention('entity_spawn', params, eventId);
    return eventId;
  }

  /**
   * Triggers a climate event at a location.
   * @param {string} eventType - Climate event type ('drought', 'flood', 'eruption', 'ice_age')
   * @param {number} x - Center X coordinate
   * @param {number} y - Center Y coordinate
   * @param {number} [severity=0.5] - Severity 0-1
   * @returns {string} Event ID
   */
  triggerClimateEvent(eventType, x, y, severity = 0.5) {
    this._validateEnabled();
    const validTypes = ['drought', 'flood', 'eruption', 'ice_age', 'meteor', 'earthquake'];
    if (!validTypes.includes(eventType)) {
      throw new Error(`[ObserverManager] Invalid climate event: ${eventType}. Valid: ${validTypes.join(', ')}`);
    }

    const params = { eventType, x, y, severity };
    const eventId = this._publishDivineEvent('divine.climate_event', params, {
      description: `Divine ${eventType} at (${x}, ${y}) with severity ${severity}`,
      intensity: severity
    });

    this._recordIntervention('climate_event', params, eventId);
    return eventId;
  }

  /**
   * Initiates simulation termination with ethical protocol.
   * @returns {string} Event ID
   */
  terminateSimulation() {
    const eventId = this._publishDivineEvent('divine.termination_request', {}, {
      description: 'Observer requested simulation termination',
      intensity: 1.0
    });

    // Emit termination request — the EthicalProtocol module handles the rest
    eventBus.emit('meta.termination_requested', {
      timestamp: eventBus.getSimulationTime(),
      interventionCount: this._interventionLog.length
    }, { source_layer: 0, priority: 10 });

    return eventId;
  }

  /**
   * Publishes a divine event to the Event Bus.
   * @param {string} type - Event type
   * @param {Object} params - Event parameters
   * @param {Object} meta - Metadata (description, intensity)
   * @returns {string} Event ID
   * @private
   */
  _publishDivineEvent(type, params, meta) {
    return eventBus.emit(type, {
      ...params,
      _divine: true,
      _description: meta.description,
      _intensity: meta.intensity,
      _observerTimestamp: Date.now()
    }, {
      source_layer: 0,
      target_layer: 'ALL',
      priority: 9 // Divine events are near-critical priority
    });
  }

  /**
   * Records an intervention for history, undo, and statistics.
   * @param {string} type - Intervention type
   * @param {Object} params - Parameters
   * @param {string} eventId - Associated event ID
   * @private
   */
  _recordIntervention(type, params, eventId) {
    const intervention = {
      id: eventId,
      type,
      params: { ...params },
      timestamp: eventBus.getSimulationTime(),
      undoData: null // TODO: capture pre-intervention state for undo
    };

    this._interventionLog.push(intervention);
    this._undoStack.push(intervention);
    this._redoStack.length = 0; // Clear redo on new action

    if (this._undoStack.length > this._maxUndoDepth) {
      this._undoStack.shift();
    }

    const count = this._interventionCounts.get(type) ?? 0;
    this._interventionCounts.set(type, count + 1);
  }

  /**
   * Validates that the observer is enabled.
   * @throws {Error} If interventions are disabled
   * @private
   */
  _validateEnabled() {
    if (!this._enabled) {
      throw new Error('[ObserverManager] Observer interventions are currently disabled');
    }
  }

  /**
   * Validates a numeric parameter.
   * @param {number} value - Value to validate
   * @param {string} name - Parameter name for error messages
   * @param {number} [min=-Infinity] - Minimum allowed value
   * @param {number} [max=Infinity] - Maximum allowed value
   * @private
   */
  _validateNumber(value, name, min = -Infinity, max = Infinity) {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new Error(`[ObserverManager] ${name} must be a valid number, got: ${value}`);
    }
    if (value < min || value > max) {
      throw new Error(`[ObserverManager] ${name} must be between ${min} and ${max}, got: ${value}`);
    }
  }

  /**
   * Enables or disables observer interventions.
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this._enabled = !!enabled;
    eventBus.publish('meta.observer_status', { enabled: this._enabled }, {
      source_layer: 0, priority: 7
    });
  }

  /**
   * Gets the full intervention log.
   * @returns {DivineIntervention[]}
   */
  getInterventionLog() {
    return [...this._interventionLog];
  }

  /**
   * Gets intervention statistics.
   * @returns {Object}
   */
  getStats() {
    return {
      totalInterventions: this._interventionLog.length,
      byType: Object.fromEntries(this._interventionCounts),
      enabled: this._enabled,
      undoStackSize: this._undoStack.length
    };
  }

  /**
   * Serializes the observer state.
   * @returns {Object}
   */
  serialize() {
    return {
      interventionLog: this._interventionLog,
      interventionCounts: Object.fromEntries(this._interventionCounts),
      enabled: this._enabled
    };
  }

  /**
   * Restores observer state from serialized data.
   * @param {Object} state
   */
  deserialize(state) {
    if (!state) return;
    this._interventionLog = state.interventionLog ?? [];
    this._interventionCounts = new Map(Object.entries(state.interventionCounts ?? {}));
    this._enabled = state.enabled ?? true;
  }

  /**
   * Resets observer to initial state.
   */
  reset() {
    this._interventionLog.length = 0;
    this._undoStack.length = 0;
    this._redoStack.length = 0;
    this._interventionCounts.clear();
    this._enabled = true;
  }
}

/** @type {ObserverManager} Singleton instance */
const observerManager = new ObserverManager();
export default observerManager;
export { ObserverManager };
