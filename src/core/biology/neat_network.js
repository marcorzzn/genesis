/**
 * @module NEATNetwork
 * @description NeuroEvolution of Augmenting Topologies for entity brains.
 * Supports evolvable topology with innovation tracking, recurrent connections,
 * and efficient Float32Array weight storage.
 */

let globalInnovation = 0;
const innovationHistory = new Map();

function getInnovation(inNode, outNode) {
  const key = `${inNode}->${outNode}`;
  if (innovationHistory.has(key)) return innovationHistory.get(key);
  const id = globalInnovation++;
  innovationHistory.set(key, id);
  return id;
}

export function resetInnovations() { globalInnovation = 0; innovationHistory.clear(); }

export class NEATNode {
  constructor(id, type, layer = 0) {
    this.id = id;
    this.type = type; // 'input', 'hidden', 'output'
    this.layer = layer;
    this.value = 0;
    this.prevValue = 0;
    this.bias = 0;
    this.activation = 'tanh'; // 'tanh', 'sigmoid', 'relu', 'identity'
  }
}

export class NEATConnection {
  constructor(inNode, outNode, weight = 0, innovation = -1) {
    this.inNode = inNode;
    this.outNode = outNode;
    this.weight = weight;
    this.innovation = innovation >= 0 ? innovation : getInnovation(inNode, outNode);
    this.enabled = true;
    this.isRecurrent = false;
  }
}

export class NEATNetwork {
  constructor() {
    /** @type {Map<number, NEATNode>} */
    this.nodes = new Map();
    /** @type {NEATConnection[]} */
    this.connections = [];
    this.nextNodeId = 0;
    this.fitness = 0;
    this.species = -1;
    this.age = 0;
  }

  /**
   * Creates a minimal network with given input/output counts.
   * @param {number} inputCount
   * @param {number} outputCount
   * @returns {NEATNetwork}
   */
  static create(inputCount, outputCount) {
    const net = new NEATNetwork();
    // Input nodes
    for (let i = 0; i < inputCount; i++) {
      net.nodes.set(net.nextNodeId, new NEATNode(net.nextNodeId, 'input', 0));
      net.nextNodeId++;
    }
    // Bias node
    const biasId = net.nextNodeId++;
    net.nodes.set(biasId, new NEATNode(biasId, 'input', 0));

    // Output nodes
    for (let i = 0; i < outputCount; i++) {
      const outId = net.nextNodeId++;
      net.nodes.set(outId, new NEATNode(outId, 'output', 1));
      // Connect all inputs + bias to this output
      for (let j = 0; j <= inputCount; j++) {
        const w = (Math.random() * 2 - 1) * 0.5;
        net.connections.push(new NEATConnection(j, outId, w));
      }
    }
    return net;
  }

  /**
   * Feed-forward activation.
   * @param {number[]} inputs
   * @returns {number[]}
   */
  activate(inputs) {
    // Set input values
    let i = 0;
    for (const [id, node] of this.nodes) {
      if (node.type === 'input') {
        node.prevValue = node.value;
        node.value = i < inputs.length ? inputs[i] : 1.0; // last input = bias
        i++;
      } else {
        node.prevValue = node.value;
        node.value = 0;
      }
    }

    // Sort connections by target node layer for proper propagation
    const sortedConnections = [...this.connections].sort((a, b) => {
      const layerA = this.nodes.get(a.outNode)?.layer ?? 0;
      const layerB = this.nodes.get(b.outNode)?.layer ?? 0;
      return layerA - layerB;
    });

    // Propagate
    for (const conn of sortedConnections) {
      if (!conn.enabled) continue;
      const inNode = this.nodes.get(conn.inNode);
      const outNode = this.nodes.get(conn.outNode);
      if (!inNode || !outNode) continue;
      const inputVal = conn.isRecurrent ? inNode.prevValue : inNode.value;
      outNode.value += inputVal * conn.weight;
    }

    // Activate non-input nodes
    const outputs = [];
    for (const [id, node] of this.nodes) {
      if (node.type !== 'input') {
        node.value = this._activate(node.value + node.bias, node.activation);
        if (node.type === 'output') outputs.push(node.value);
      }
    }

    return outputs;
  }

  _activate(x, fn) {
    switch (fn) {
      case 'sigmoid': return 1 / (1 + Math.exp(-4.9 * x));
      case 'relu': return Math.max(0, x);
      case 'identity': return x;
      case 'tanh': default: return Math.tanh(x);
    }
  }

  /** Mutate connection weights */
  mutateWeights(rate = 0.8, perturbChance = 0.9, perturbAmount = 0.2) {
    for (const conn of this.connections) {
      if (Math.random() < rate) {
        if (Math.random() < perturbChance) {
          conn.weight += (Math.random() * 2 - 1) * perturbAmount;
        } else {
          conn.weight = (Math.random() * 2 - 1) * 2;
        }
      }
    }
  }

  /** Add a new node by splitting a connection */
  mutateAddNode() {
    const enabled = this.connections.filter(c => c.enabled);
    if (enabled.length === 0) return;
    const conn = enabled[Math.floor(Math.random() * enabled.length)];
    conn.enabled = false;

    const newNodeId = this.nextNodeId++;
    const inLayer = this.nodes.get(conn.inNode)?.layer ?? 0;
    const outLayer = this.nodes.get(conn.outNode)?.layer ?? 1;
    const newLayer = (inLayer + outLayer) / 2;

    this.nodes.set(newNodeId, new NEATNode(newNodeId, 'hidden', newLayer));
    this.connections.push(new NEATConnection(conn.inNode, newNodeId, 1.0));
    this.connections.push(new NEATConnection(newNodeId, conn.outNode, conn.weight));
  }

  /** Add a new connection between existing nodes */
  mutateAddConnection() {
    const nodeArr = [...this.nodes.values()];
    const maxTries = 20;
    for (let t = 0; t < maxTries; t++) {
      const a = nodeArr[Math.floor(Math.random() * nodeArr.length)];
      const b = nodeArr[Math.floor(Math.random() * nodeArr.length)];
      if (a.id === b.id) continue;
      if (a.type === 'output' && b.type === 'output') continue;

      const exists = this.connections.some(c => c.inNode === a.id && c.outNode === b.id);
      if (exists) continue;

      const isRecurrent = a.layer >= b.layer;
      const conn = new NEATConnection(a.id, b.id, (Math.random() * 2 - 1) * 0.5);
      conn.isRecurrent = isRecurrent;
      this.connections.push(conn);
      return;
    }
  }

  /** Crossover with another network (this = fitter parent) */
  static crossover(parent1, parent2) {
    const child = new NEATNetwork();
    child.nextNodeId = Math.max(parent1.nextNodeId, parent2.nextNodeId);

    // Copy all nodes from fitter parent
    for (const [id, node] of parent1.nodes) {
      child.nodes.set(id, new NEATNode(id, node.type, node.layer));
      child.nodes.get(id).bias = node.bias;
      child.nodes.get(id).activation = node.activation;
    }

    // Align connections by innovation number
    const p2Map = new Map();
    for (const c of parent2.connections) p2Map.set(c.innovation, c);

    for (const c1 of parent1.connections) {
      const c2 = p2Map.get(c1.innovation);
      if (c2) {
        // Matching: randomly pick from either parent
        const src = Math.random() < 0.5 ? c1 : c2;
        const conn = new NEATConnection(src.inNode, src.outNode, src.weight, src.innovation);
        conn.enabled = src.enabled;
        conn.isRecurrent = src.isRecurrent;
        if (!c1.enabled || !c2.enabled) conn.enabled = Math.random() < 0.75;
        child.connections.push(conn);
      } else {
        // Excess/disjoint from fitter parent
        const conn = new NEATConnection(c1.inNode, c1.outNode, c1.weight, c1.innovation);
        conn.enabled = c1.enabled;
        conn.isRecurrent = c1.isRecurrent;
        child.connections.push(conn);
      }
    }

    return child;
  }

  /** Compatibility distance for speciation */
  static compatibilityDistance(a, b, c1 = 1.0, c2 = 1.0, c3 = 0.4) {
    const aMap = new Map(), bMap = new Map();
    for (const c of a.connections) aMap.set(c.innovation, c);
    for (const c of b.connections) bMap.set(c.innovation, c);

    let matching = 0, disjoint = 0, excess = 0, weightDiff = 0;
    const maxInnovA = a.connections.length > 0 ? Math.max(...a.connections.map(c => c.innovation)) : 0;
    const maxInnovB = b.connections.length > 0 ? Math.max(...b.connections.map(c => c.innovation)) : 0;
    const minMax = Math.min(maxInnovA, maxInnovB);

    const allInnovs = new Set([...aMap.keys(), ...bMap.keys()]);
    for (const innov of allInnovs) {
      const inA = aMap.has(innov), inB = bMap.has(innov);
      if (inA && inB) {
        matching++;
        weightDiff += Math.abs(aMap.get(innov).weight - bMap.get(innov).weight);
      } else if (innov <= minMax) {
        disjoint++;
      } else {
        excess++;
      }
    }

    const n = Math.max(a.connections.length, b.connections.length, 1);
    const avgW = matching > 0 ? weightDiff / matching : 0;
    return (c1 * excess / n) + (c2 * disjoint / n) + (c3 * avgW);
  }

  getComplexity() { return this.nodes.size + this.connections.filter(c => c.enabled).length; }
  getDepth() { return Math.max(...[...this.nodes.values()].map(n => n.layer), 0); }

  clone() {
    const c = new NEATNetwork();
    c.nextNodeId = this.nextNodeId;
    for (const [id, n] of this.nodes) {
      const nn = new NEATNode(id, n.type, n.layer);
      nn.bias = n.bias; nn.activation = n.activation;
      c.nodes.set(id, nn);
    }
    for (const conn of this.connections) {
      const nc = new NEATConnection(conn.inNode, conn.outNode, conn.weight, conn.innovation);
      nc.enabled = conn.enabled; nc.isRecurrent = conn.isRecurrent;
      c.connections.push(nc);
    }
    c.fitness = this.fitness; c.species = this.species;
    return c;
  }

  serialize() {
    return {
      nodes: [...this.nodes.values()].map(n => ({ id: n.id, type: n.type, layer: n.layer, bias: n.bias, activation: n.activation })),
      connections: this.connections.map(c => ({ i: c.inNode, o: c.outNode, w: c.weight, inn: c.innovation, e: c.enabled, r: c.isRecurrent })),
      nextNodeId: this.nextNodeId, fitness: this.fitness, species: this.species
    };
  }

  static deserialize(data) {
    const net = new NEATNetwork();
    net.nextNodeId = data.nextNodeId;
    net.fitness = data.fitness ?? 0;
    net.species = data.species ?? -1;
    for (const n of data.nodes) {
      const node = new NEATNode(n.id, n.type, n.layer);
      node.bias = n.bias ?? 0; node.activation = n.activation ?? 'tanh';
      net.nodes.set(n.id, node);
    }
    for (const c of data.connections) {
      const conn = new NEATConnection(c.i, c.o, c.w, c.inn);
      conn.enabled = c.e; conn.isRecurrent = c.r ?? false;
      net.connections.push(conn);
    }
    return net;
  }
}

export default NEATNetwork;
