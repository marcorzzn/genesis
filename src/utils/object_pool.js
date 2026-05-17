/**
 * @module ObjectPool
 * @description High-performance object pooling system for Genesis.
 * Pre-allocates and reuses frequently created/destroyed objects
 * (particles, memory events, spatial query results) to minimize GC pressure.
 */

/**
 * Generic object pool with automatic growth and size limits.
 * @template T
 */
export class ObjectPool {
  /**
   * @param {Function} factory - Factory function returning a new object
   * @param {Function} [reset] - Reset function to clear an object for reuse
   * @param {number} [initialSize=64] - Initial pool size
   * @param {number} [maxSize=4096] - Maximum pool size
   */
  constructor(factory, reset = null, initialSize = 64, maxSize = 4096) {
    if (typeof factory !== 'function') {
      throw new Error('[ObjectPool] Factory must be a function');
    }

    /** @type {Function} */
    this._factory = factory;

    /** @type {Function|null} */
    this._reset = reset;

    /** @type {T[]} Available objects */
    this._pool = [];

    /** @type {number} */
    this._maxSize = maxSize;

    /** @type {number} Total objects created */
    this._totalCreated = 0;

    /** @type {number} Total acquire calls */
    this._totalAcquired = 0;

    /** @type {number} Total release calls */
    this._totalReleased = 0;

    // Pre-allocate
    for (let i = 0; i < initialSize; i++) {
      this._pool.push(this._factory());
      this._totalCreated++;
    }
  }

  /**
   * Acquires an object from the pool or creates a new one.
   * @returns {T}
   */
  acquire() {
    this._totalAcquired++;
    if (this._pool.length > 0) {
      return this._pool.pop();
    }
    this._totalCreated++;
    return this._factory();
  }

  /**
   * Releases an object back to the pool for reuse.
   * @param {T} obj - Object to release
   */
  release(obj) {
    if (obj === null || obj === undefined) return;
    this._totalReleased++;
    if (this._pool.length < this._maxSize) {
      if (this._reset) {
        this._reset(obj);
      }
      this._pool.push(obj);
    }
  }

  /**
   * Releases multiple objects at once.
   * @param {T[]} objects - Array of objects to release
   */
  releaseAll(objects) {
    for (let i = 0; i < objects.length; i++) {
      this.release(objects[i]);
    }
  }

  /**
   * Pre-warms the pool to a specific size.
   * @param {number} count - Target available count
   */
  prewarm(count) {
    while (this._pool.length < count && this._pool.length < this._maxSize) {
      this._pool.push(this._factory());
      this._totalCreated++;
    }
  }

  /**
   * Returns pool diagnostics.
   * @returns {Object}
   */
  getStats() {
    return {
      available: this._pool.length,
      totalCreated: this._totalCreated,
      totalAcquired: this._totalAcquired,
      totalReleased: this._totalReleased,
      maxSize: this._maxSize,
      hitRate: this._totalAcquired > 0
        ? ((this._totalAcquired - (this._totalCreated - this._pool.length)) / this._totalAcquired * 100).toFixed(1) + '%'
        : '0%'
    };
  }

  /**
   * Clears all pooled objects.
   */
  clear() {
    this._pool.length = 0;
  }
}

export default ObjectPool;
