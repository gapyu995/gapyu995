// Snake simulation for a GitHub contribution grid.
//
// Every run generates several (pathCount) DIFFERENT closed self-avoiding
// paths that all start and end at a shared junction cell. The snake follows
// them one after another and then loops back to the first one, so the whole
// animation is a single closed cycle and loops seamlessly (the last frame
// advances into the first frame with one valid step).
//
// The paths are generated from a seed derived from the contribution set and
// the current date, so every day's contribution data produces a different
// set of paths.

const SIMULATION_VERSION = 21;

const DEFAULT_SIMULATION_OPTIONS = Object.freeze({
  snakeLength: 8,
  eatTrailSteps: 20,
  frameDelayMs: 120,
  gridRows: 7,
  gridCols: 54,
  pathCount: 5,
  minPathLength: 40,
});

const DIRECTIONS = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
];

function coordinateKey({ row, col }) {
  return `${row},${col}`;
}

function isAdjacent(a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

function insideGrid(row, col, gridRows, gridCols) {
  return row >= 0 && row < gridRows && col >= 0 && col < gridCols;
}

// FNV-1a hash of a string.
function hashString(value) {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// Deterministic PRNG (mulberry32).
function mulberry32(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  for (let index = items.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

function defaultSeed(contributionSet) {
  const date = new Date();
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  const keys = [...contributionSet].sort().join(';');
  return hashString(`${day}|${keys}`);
}

// Generate a self-avoiding path from `start` to `end` (both excluded from the
// returned cells are fine to include). Randomized DFS biased toward
// contribution cells. Returns [start, ..., end] or null if it failed.
function generatePath(
  start,
  end,
  gridRows,
  gridCols,
  contributionSet,
  random,
  minLength,
  maxNodes = 20000,
) {
  const startKey = coordinateKey(start);
  const endKey = coordinateKey(end);
  const visited = new Set([startKey]);
  const path = [start];
  let nodes = 0;
  let result = null;

  function explore() {
    if (++nodes > maxNodes) return false;

    const current = path[path.length - 1];
    if (isAdjacent(current, end) && path.length >= minLength) {
      result = [...path, end];
      return true;
    }

    const neighbors = [];
    for (const { dr, dc } of DIRECTIONS) {
      const row = current.row + dr;
      const col = current.col + dc;
      if (!insideGrid(row, col, gridRows, gridCols)) continue;
      const key = `${row},${col}`;
      if (key === endKey || visited.has(key)) continue;
      neighbors.push({ row, col });
    }

    shuffle(neighbors, random);
    // Stable-sort so contribution cells are tried first (bias toward food),
    // while keeping the shuffled order inside each group.
    neighbors.sort((a, b) => {
      const aFood = contributionSet.has(coordinateKey(a)) ? 1 : 0;
      const bFood = contributionSet.has(coordinateKey(b)) ? 1 : 0;
      return bFood - aFood;
    });

    for (const next of neighbors) {
      const key = coordinateKey(next);
      visited.add(key);
      path.push(next);
      if (explore()) return true;
      path.pop();
      visited.delete(key);
    }
    return false;
  }

  if (explore()) return result;
  return null;
}

// Trivial fallback so a path always exists even if the DFS cannot find one.
function fallbackPath(start, end) {
  return [
    start,
    { row: start.row, col: end.col },
    end,
  ];
}

function runSimulation(contributionSet, options = {}) {
  const {
    snakeLength,
    eatTrailSteps,
    frameDelayMs,
    gridRows,
    gridCols,
    pathCount,
    minPathLength,
    seed = defaultSeed(new Set(contributionSet)),
  } = { ...DEFAULT_SIMULATION_OPTIONS, ...options };

  const contributions = new Set(contributionSet);
  const junction = { row: 0, col: 0 };
  const start = { row: 1, col: 0 };
  const end = { row: 0, col: 1 };

  const paths = [];
  for (let index = 0; index < pathCount; index++) {
    const random = mulberry32((seed + Math.imul(index + 1, 0x9e3779b9)) >>> 0);
    let path = null;
    for (let attempt = 0; attempt < 20 && !path; attempt++) {
      path = generatePath(
        start,
        end,
        gridRows,
        gridCols,
        contributions,
        random,
        minPathLength,
      );
    }
    paths.push(path || fallbackPath(start, end));
  }

  // Build the single closed head sequence:
  // junction -> path1 -> junction -> path2 -> ... -> pathN -> junction
  const headSequence = [junction];
  for (const path of paths) {
    headSequence.push(...path, junction);
  }
  const totalSteps = headSequence.length - 1;
  const length = Math.min(snakeLength, totalSteps);
  const trailLength = Math.min(eatTrailSteps, totalSteps);

  const frames = [];
  for (let step = 0; step < totalSteps; step++) {
    const snakeBody = [];
    for (let offset = 0; offset < length; offset++) {
      const index = (step - offset + totalSteps) % totalSteps;
      snakeBody.push({ ...headSequence[index] });
    }

    const head = snakeBody[0];
    const previous = snakeBody[1] || head;
    const eaten = new Set();
    for (let offset = 0; offset < trailLength; offset++) {
      const index = (step - offset + totalSteps) % totalSteps;
      eaten.add(coordinateKey(headSequence[index]));
    }

    const foodSet = new Set();
    for (const key of contributions) {
      if (!eaten.has(key)) foodSet.add(key);
    }

    frames.push({
      snakeBody,
      snakeDirection: {
        dr: head.row - previous.row,
        dc: head.col - previous.col,
      },
      snakeAlive: true,
      foodSet,
      cumulativeSteps: step,
    });
  }

  console.log(
    `🐍 ${frames.length} frames · ${paths.length} paths · ` +
    `snake ${length} · trail ${trailLength} · seamless loop`,
  );

  return {
    frames,
    snakeLength: length,
    pathCount: paths.length,
    totalSteps,
    eatTrailSteps: trailLength,
    frameDelayMs,
    contributionSet: contributions,
    cumulativeSteps: totalSteps,
  };
}

module.exports = {
  coordinateKey,
  isAdjacent,
  hashString,
  mulberry32,
  generatePath,
  runSimulation,
  SIMULATION_VERSION,
  DEFAULT_SIMULATION_OPTIONS,
};
