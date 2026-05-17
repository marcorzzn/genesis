/**
 * @module QuadTree
 * @description Spatial indexing data structure for efficient O(log n) neighbor queries.
 * Used by the biology layer for entity proximity detection, collision testing,
 * and predator-prey range queries across the simulation grid.
 */

/**
 * @typedef {Object} QuadTreePoint
 * @property {number} x - X coordinate
 * @property {number} y - Y coordinate
 * @property {*} data - Associated data (entity reference, ID, etc.)
 */

/**
 * Axis-aligned bounding box for spatial queries.
 */
export class AABB {
  /**
   * @param {number} x - Center X
   * @param {number} y - Center Y
   * @param {number} halfW - Half-width
   * @param {number} halfH - Half-height
   */
  constructor(x, y, halfW, halfH) {
    this.x = x;
    this.y = y;
    this.halfW = halfW;
    this.halfH = halfH;
  }

  /**
   * Tests if a point lies within this bounding box.
   * @param {QuadTreePoint} point
   * @returns {boolean}
   */
  contains(point) {
    return (
      point.x >= this.x - this.halfW &&
      point.x < this.x + this.halfW &&
      point.y >= this.y - this.halfH &&
      point.y < this.y + this.halfH
    );
  }

  /**
   * Tests if this AABB intersects another AABB.
   * @param {AABB} range
   * @returns {boolean}
   */
  intersects(range) {
    return !(
      range.x - range.halfW > this.x + this.halfW ||
      range.x + range.halfW < this.x - this.halfW ||
      range.y - range.halfH > this.y + this.halfH ||
      range.y + range.halfH < this.y - this.halfH
    );
  }
}

/**
 * Circle range for radius-based queries.
 */
export class CircleRange {
  /**
   * @param {number} x - Center X
   * @param {number} y - Center Y
   * @param {number} radius - Radius
   */
  constructor(x, y, radius) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.radiusSq = radius * radius;
  }

  /**
   * Tests if a point lies within this circle.
   * @param {QuadTreePoint} point
   * @returns {boolean}
   */
  contains(point) {
    const dx = point.x - this.x;
    const dy = point.y - this.y;
    return (dx * dx + dy * dy) <= this.radiusSq;
  }

  /**
   * Tests if this circle intersects an AABB.
   * @param {AABB} range
   * @returns {boolean}
   */
  intersects(range) {
    const closestX = Math.max(range.x - range.halfW, Math.min(this.x, range.x + range.halfW));
    const closestY = Math.max(range.y - range.halfH, Math.min(this.y, range.y + range.halfH));
    const dx = this.x - closestX;
    const dy = this.y - closestY;
    return (dx * dx + dy * dy) <= this.radiusSq;
  }
}

/**
 * QuadTree — spatial partitioning for efficient neighbor queries.
 * Supports toroidal wrapping for planetary simulation grids.
 */
export class QuadTree {
  /**
   * @param {AABB} boundary - The spatial boundary of this node
   * @param {number} [capacity=8] - Max points per node before subdividing
   * @param {number} [maxDepth=12] - Maximum tree depth
   * @param {number} [depth=0] - Current depth (internal)
   */
  constructor(boundary, capacity = 8, maxDepth = 12, depth = 0) {
    this.boundary = boundary;
    this.capacity = capacity;
    this.maxDepth = maxDepth;
    this.depth = depth;

    /** @type {QuadTreePoint[]} */
    this.points = [];

    /** @type {boolean} */
    this.divided = false;

    /** @type {QuadTree|null} */
    this.ne = null;
    /** @type {QuadTree|null} */
    this.nw = null;
    /** @type {QuadTree|null} */
    this.se = null;
    /** @type {QuadTree|null} */
    this.sw = null;

    /** @type {number} Total points in this subtree */
    this.count = 0;
  }

  /**
   * Inserts a point into the QuadTree.
   * @param {QuadTreePoint} point
   * @returns {boolean} True if inserted successfully
   */
  insert(point) {
    if (!this.boundary.contains(point)) {
      return false;
    }

    if (this.points.length < this.capacity || this.depth >= this.maxDepth) {
      this.points.push(point);
      this.count++;
      return true;
    }

    if (!this.divided) {
      this._subdivide();
    }

    if (this.ne.insert(point) || this.nw.insert(point) ||
        this.se.insert(point) || this.sw.insert(point)) {
      this.count++;
      return true;
    }

    return false;
  }

  /**
   * Queries all points within a rectangular range.
   * @param {AABB} range - Query range
   * @param {QuadTreePoint[]} [found=[]] - Results array (reusable for pooling)
   * @returns {QuadTreePoint[]}
   */
  query(range, found = []) {
    if (!this.boundary.intersects(range)) {
      return found;
    }

    for (let i = 0; i < this.points.length; i++) {
      if (range.contains(this.points[i])) {
        found.push(this.points[i]);
      }
    }

    if (this.divided) {
      this.ne.query(range, found);
      this.nw.query(range, found);
      this.se.query(range, found);
      this.sw.query(range, found);
    }

    return found;
  }

  /**
   * Queries all points within a circular range.
   * @param {CircleRange} circle - Query circle
   * @param {QuadTreePoint[]} [found=[]] - Results array
   * @returns {QuadTreePoint[]}
   */
  queryCircle(circle, found = []) {
    if (!circle.intersects(this.boundary)) {
      return found;
    }

    for (let i = 0; i < this.points.length; i++) {
      if (circle.contains(this.points[i])) {
        found.push(this.points[i]);
      }
    }

    if (this.divided) {
      this.ne.queryCircle(circle, found);
      this.nw.queryCircle(circle, found);
      this.se.queryCircle(circle, found);
      this.sw.queryCircle(circle, found);
    }

    return found;
  }

  /**
   * Finds the nearest point to a given position.
   * @param {number} x - Query X
   * @param {number} y - Query Y
   * @param {number} [maxRadius=Infinity] - Maximum search radius
   * @returns {QuadTreePoint|null}
   */
  findNearest(x, y, maxRadius = Infinity) {
    let bestDist = maxRadius * maxRadius;
    let bestPoint = null;

    this._findNearestRecursive(x, y, bestDist, (dist, point) => {
      if (dist < bestDist) {
        bestDist = dist;
        bestPoint = point;
      }
    });

    return bestPoint;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} bestDistSq
   * @param {Function} callback
   * @private
   */
  _findNearestRecursive(x, y, bestDistSq, callback) {
    // Quick reject if this node's boundary is too far
    const closestX = Math.max(this.boundary.x - this.boundary.halfW,
                              Math.min(x, this.boundary.x + this.boundary.halfW));
    const closestY = Math.max(this.boundary.y - this.boundary.halfH,
                              Math.min(y, this.boundary.y + this.boundary.halfH));
    const dx0 = x - closestX;
    const dy0 = y - closestY;
    if (dx0 * dx0 + dy0 * dy0 > bestDistSq) return;

    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      const dx = x - p.x;
      const dy = y - p.y;
      const distSq = dx * dx + dy * dy;
      callback(distSq, p);
    }

    if (this.divided) {
      this.ne._findNearestRecursive(x, y, bestDistSq, callback);
      this.nw._findNearestRecursive(x, y, bestDistSq, callback);
      this.se._findNearestRecursive(x, y, bestDistSq, callback);
      this.sw._findNearestRecursive(x, y, bestDistSq, callback);
    }
  }

  /**
   * Subdivides this node into four children.
   * @private
   */
  _subdivide() {
    const { x, y, halfW, halfH } = this.boundary;
    const qw = halfW / 2;
    const qh = halfH / 2;

    this.ne = new QuadTree(new AABB(x + qw, y - qh, qw, qh), this.capacity, this.maxDepth, this.depth + 1);
    this.nw = new QuadTree(new AABB(x - qw, y - qh, qw, qh), this.capacity, this.maxDepth, this.depth + 1);
    this.se = new QuadTree(new AABB(x + qw, y + qh, qw, qh), this.capacity, this.maxDepth, this.depth + 1);
    this.sw = new QuadTree(new AABB(x - qw, y + qh, qw, qh), this.capacity, this.maxDepth, this.depth + 1);

    this.divided = true;
  }

  /**
   * Clears all points and subdivisions for reuse.
   */
  clear() {
    this.points.length = 0;
    this.count = 0;
    this.divided = false;
    this.ne = null;
    this.nw = null;
    this.se = null;
    this.sw = null;
  }

  /**
   * Returns total point count.
   * @returns {number}
   */
  size() {
    return this.count;
  }
}

export default QuadTree;
