/**
 * Canonical Game of Life patterns used by the Super-GoL rule explorer.
 * Coordinates are expressed as sparse [x, y] offsets from the pattern origin.
 */

export const LIFE_RULE_PRESETS = {
  conway: { label: 'Conway B3/S23', rule: 'B3/S23', birth: [3], survival: [2, 3] },
  highlife: { label: 'HighLife B36/S23', rule: 'B36/S23', birth: [3, 6], survival: [2, 3] },
  seeds: { label: 'Seeds B2/S', rule: 'B2/S', birth: [2], survival: [] },
  life34: { label: '34 Life B34/S34', rule: 'B34/S34', birth: [3, 4], survival: [3, 4] },
  daynight: {
    label: 'Day & Night B3678/S34678',
    rule: 'B3678/S34678',
    birth: [3, 6, 7, 8],
    survival: [3, 4, 6, 7, 8]
  },
  gnarl: { label: 'Gnarl B1/S1', rule: 'B1/S1', birth: [1], survival: [1] }
};

export const LIFE_PATTERNS = {
  random: {
    label: 'Random sparse field',
    cells: []
  },
  glider: {
    label: 'Glider',
    cells: [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]
  },
  rPentomino: {
    label: 'R-pentomino',
    cells: [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]]
  },
  acorn: {
    label: 'Acorn',
    cells: [[1, 0], [3, 1], [0, 2], [1, 2], [4, 2], [5, 2], [6, 2]]
  },
  diehard: {
    label: 'Diehard',
    cells: [[6, 0], [0, 1], [1, 1], [1, 2], [5, 2], [6, 2], [7, 2]]
  },
  pulsar: {
    label: 'Pulsar',
    cells: [
      [2, 0], [3, 0], [4, 0], [8, 0], [9, 0], [10, 0],
      [0, 2], [5, 2], [7, 2], [12, 2], [0, 3], [5, 3], [7, 3], [12, 3],
      [0, 4], [5, 4], [7, 4], [12, 4], [2, 5], [3, 5], [4, 5], [8, 5], [9, 5], [10, 5],
      [2, 7], [3, 7], [4, 7], [8, 7], [9, 7], [10, 7], [0, 8], [5, 8], [7, 8], [12, 8],
      [0, 9], [5, 9], [7, 9], [12, 9], [0, 10], [5, 10], [7, 10], [12, 10],
      [2, 12], [3, 12], [4, 12], [8, 12], [9, 12], [10, 12]
    ]
  },
  gosperGun: {
    label: 'Gosper glider gun',
    cells: [
      [24, 0], [22, 1], [24, 1], [12, 2], [13, 2], [20, 2], [21, 2], [34, 2], [35, 2],
      [11, 3], [15, 3], [20, 3], [21, 3], [34, 3], [35, 3],
      [0, 4], [1, 4], [10, 4], [16, 4], [20, 4], [21, 4],
      [0, 5], [1, 5], [10, 5], [14, 5], [16, 5], [17, 5], [22, 5], [24, 5],
      [10, 6], [16, 6], [24, 6], [11, 7], [15, 7], [12, 8], [13, 8]
    ]
  }
};

export function maskFromNeighbors(neighbors) {
  return neighbors.reduce((mask, n) => mask | (1 << n), 0);
}

export function parseLifeRule(rule) {
  const normalized = String(rule || 'B3/S23').toUpperCase().replace(/\s+/g, '');
  const match = normalized.match(/^B([0-8]*)\/S([0-8]*)$/);
  if (!match) return LIFE_RULE_PRESETS.conway;
  const toList = (value) => [...value].map(Number).filter((n) => n >= 0 && n <= 8);
  return {
    label: normalized,
    rule: normalized,
    birth: toList(match[1]),
    survival: toList(match[2])
  };
}

export function masksFromRule(rule) {
  const parsed = parseLifeRule(rule);
  return {
    birthMask: maskFromNeighbors(parsed.birth),
    survivalMask: maskFromNeighbors(parsed.survival),
    label: parsed.label,
    rule: parsed.rule
  };
}
