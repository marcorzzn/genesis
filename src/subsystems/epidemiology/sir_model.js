/**
 * @module SIRModel
 * @description Extended SIR epidemiological model for diseases AND cultural memes.
 * dS/dt = -βSI/N + μ(N-S), dI/dt = βSI/N - γI - δI, dR/dt = γI - μR, dD/dt = δI
 */

export class SIRModel {
  constructor(options = {}) {
    this.beta = options.beta ?? 0.3;   // transmission rate
    this.gamma = options.gamma ?? 0.1; // recovery rate
    this.delta = options.delta ?? 0.01; // mortality rate
    this.mu = options.mu ?? 0.001;     // birth/immigration rate
  }

  step(S, I, R, D, N, dt = 1) {
    if (N <= 0) return { S, I, R, D };
    const dS = (-this.beta * S * I / N + this.mu * (N - S)) * dt;
    const dI = (this.beta * S * I / N - this.gamma * I - this.delta * I) * dt;
    const dR = (this.gamma * I - this.mu * R) * dt;
    const dD = (this.delta * I) * dt;
    return {
      S: Math.max(0, S + dS), I: Math.max(0, I + dI),
      R: Math.max(0, R + dR), D: Math.max(0, D + dD)
    };
  }

  /** Apply to cultural meme spread (no mortality) */
  stepCultural(susceptible, infected, recovered, total, dt = 1) {
    const saved = this.delta;
    this.delta = 0;
    const result = this.step(susceptible, infected, recovered, 0, total, dt);
    this.delta = saved;
    return result;
  }
}

export class Epidemic {
  constructor(name, type, params = {}) {
    this.name = name;
    this.type = type; // 'disease' or 'meme'
    this.model = new SIRModel(params);
    this.S = 0; this.I = 0; this.R = 0; this.D = 0;
    this.active = true;
    this.startTick = 0;
  }

  init(totalPop, initialInfected, simTime) {
    this.I = initialInfected;
    this.S = totalPop - initialInfected;
    this.R = 0; this.D = 0;
    this.startTick = simTime;
    this.active = true;
  }

  tick(dt = 1) {
    if (!this.active) return;
    const N = this.S + this.I + this.R;
    if (this.I < 0.5 && this.S > 0) { this.active = false; return; }
    const result = this.type === 'meme'
      ? this.model.stepCultural(this.S, this.I, this.R, N, dt)
      : this.model.step(this.S, this.I, this.R, this.D, N, dt);
    Object.assign(this, result);
  }

  getStats() {
    return { name: this.name, type: this.type, S: Math.round(this.S), I: Math.round(this.I),
      R: Math.round(this.R), D: Math.round(this.D), active: this.active };
  }
}

export default SIRModel;
