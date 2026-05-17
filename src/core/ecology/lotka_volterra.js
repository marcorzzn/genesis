/**
 * @module LotkaVolterra
 * @description Generalized Lotka-Volterra predator-prey model with emergent coefficients.
 * Coefficients are derived from actual encounter statistics, not fixed parameters.
 */

export class LotkaVolterra {
  /**
   * Compute population derivatives for a pair of interacting species.
   * dx/dt = αx - βxy   (prey)
   * dy/dt = δxy - γy   (predator)
   * @param {number} preyPop - Current prey population
   * @param {number} predPop - Current predator population
   * @param {Object} coeffs - { alpha, beta, gamma, delta }
   * @returns {{ dPrey: number, dPred: number }}
   */
  static computeDerivatives(preyPop, predPop, coeffs) {
    const { alpha, beta, gamma, delta } = coeffs;
    return {
      dPrey: alpha * preyPop - beta * preyPop * predPop,
      dPred: delta * preyPop * predPop - gamma * predPop
    };
  }

  /**
   * Euler integration step for the LV system.
   * @param {number} preyPop
   * @param {number} predPop
   * @param {Object} coeffs
   * @param {number} dt
   * @returns {{ prey: number, pred: number }}
   */
  static step(preyPop, predPop, coeffs, dt = 0.1) {
    const d = LotkaVolterra.computeDerivatives(preyPop, predPop, coeffs);
    return {
      prey: Math.max(0, preyPop + d.dPrey * dt),
      pred: Math.max(0, predPop + d.dPred * dt)
    };
  }

  /**
   * Estimate LV coefficients from encounter statistics.
   * @param {Object} stats - { encounters, kills, preyGrowthRate, predDeathRate }
   * @returns {Object} { alpha, beta, gamma, delta }
   */
  static estimateCoefficients(stats) {
    return {
      alpha: Math.max(0.01, stats.preyGrowthRate ?? 0.1),
      beta: Math.max(0.001, (stats.kills ?? 1) / Math.max(1, stats.encounters ?? 1) * 0.1),
      gamma: Math.max(0.01, stats.predDeathRate ?? 0.05),
      delta: Math.max(0.001, (stats.kills ?? 1) / Math.max(1, stats.encounters ?? 1) * 0.05)
    };
  }
}

export default LotkaVolterra;
