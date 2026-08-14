// Snake simulation for a GitHub contribution grid.
//
// The snake follows a closed Hamiltonian cycle that visits every grid cell
// exactly once, so the animation loops seamlessly (the last frame advances
// into the first with a single step). The cycle start point and direction are
// seeded by the contribution data + date, so each day produces a different
// route. Along the way the snake grows when it eats a contribution (levels
// give 1-4 points, every `growthPointsPerSegment` points add one segment) and
// shrinks one segment every `shrinkInterval` steps. The length schedule is
// solved as a periodic orbit so the length also matches at the loop boundary.

const SIMULATION_VERSION = 22;

const DEFAULT_SIMULATION_OPTIONS = Object.freeze({
  minSnakeLength: 3,
  // 0 or 'auto' balances the interval against the loop length and total
  // growth, so the snake breathes naturally. A positive number uses a fixed
  // interval (e.g. 10 for "one segment every 10 steps").
  shrinkInterval: 0,
  growthPointsPerSegment: 4,
  eatTrailSteps: 20,
  frameDelayMs: 120,
  gridRows: 7,
  gridCols: 54,
  pathCount: 5,
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

// Build a closed Hamiltonian cycle over gridRows × gridCols. Requires an even
// number of columns. Returns gridRows * gridCols + 1 cells; the first and last
// cell are equal, which closes the loop.
function buildHamiltonianCycle(gridRows, gridCols) {
  const cycle = [];

  for (let row = 0; row < gridRows; row++) cycle.push({ row, col: 0 });

  for (let col = 1; col < gridCols; col++) {
    if (col % 2 === 1) {
      for (let row = gridRows - 1; row >= 1; row--) cycle.push({ row, col });
    } else {
      for (let row = 1; row < gridRows; row++) cycle.push({ row, col });
    }
  }

  cycle.push({ row: 0, col: gridCols - 1 });
  for (let col = gridCols - 2; col >= 0; col--) cycle.push({ row: 0, col });

  return cycle;
}

// Solve a periodic length schedule. `growthPoints[s]` is the number of growth
// points earned at step s (0 otherwise). Returns schedule[s] = length at frame s.
function buildLengthSchedule(
  totalSteps,
  growthPoints,
  shrinkInterval,
  growthPointsPerSegment,
  minLength,
  maxLength,
) {
  let length = minLength;
  let progress = 0;

  for (let iteration = 0; iteration < 1000; iteration++) {
    const startLength = length;
    const startProgress = progress;
    for (let step = 0; step < totalSteps; step++) {
      const points = growthPoints[step] || 0;
      if (points > 0) {
        const total = progress + points;
        length = Math.min(length + Math.floor(total / growthPointsPerSegment), maxLength);
        progress = total % growthPointsPerSegment;
      }
      if (step > 0 && step % shrinkInterval === 0) {
        length = Math.max(length - 1, minLength);
      }
    }
    if (length === startLength && progress === startProgress) break;
  }

  const schedule = new Int32Array(totalSteps);
  let currentLength = length;
  let currentProgress = progress;
  for (let step = 0; step < totalSteps; step++) {
    const points = growthPoints[step] || 0;
    if (points > 0) {
      const total = currentProgress + points;
      currentLength = Math.min(
        currentLength + Math.floor(total / growthPointsPerSegment),
        maxLength,
      );
      currentProgress = total % growthPointsPerSegment;
    }
    if (step > 0 && step % shrinkInterval === 0) {
      currentLength = Math.max(currentLength - 1, minLength);
    }
    schedule[step] = currentLength;
  }

  return schedule;
}

// Resolve the shrink interval: a positive value is used as-is; 0 or 'auto'
// balances the interval against the total growth so the length oscillates
// naturally instead of pinning against a bound.
function resolveShrinkInterval(shrinkInterval, totalSteps, growthPoints, growthPointsPerSegment) {
  if (Number.isFinite(shrinkInterval) && shrinkInterval > 0) return shrinkInterval;

  let totalPoints = 0;
  for (let step = 0; step < growthPoints.length; step++) totalPoints += growthPoints[step];
  const totalGrowth = Math.floor(totalPoints / growthPointsPerSegment);
  if (totalGrowth <= 0) return Math.max(1, totalSteps);

  const interval = Math.round(totalSteps / totalGrowth);
  return Math.max(1, Math.min(totalSteps, interval));
}

function normalizeWeights(contributionSet, contributionWeights) {
  const source = contributionWeights instanceof Map
    ? contributionWeights
    : new Map(Object.entries(contributionWeights || {}));
  const normalized = new Map();
  for (const key of contributionSet) {
    const value = Number(source.get(key));
    normalized.set(key, Number.isFinite(value) && value > 0 ? value : 1);
  }
  return normalized;
}

function runSimulation(contributionSet, options = {}) {
  const {
    minSnakeLength,
    shrinkInterval,
    growthPointsPerSegment,
    eatTrailSteps,
    frameDelayMs,
    gridRows,
    gridCols,
    pathCount,
    seed = defaultSeed(new Set(contributionSet)),
    contributionWeights = new Map(),
  } = { ...DEFAULT_SIMULATION_OPTIONS, ...options };

  const contributions = new Set(contributionSet);
  const weights = normalizeWeights(contributions, contributionWeights);
  const maxLength = Math.max(1, contributions.size);

  const cycle = buildHamiltonianCycle(gridRows, gridCols);
  const cycleLength = cycle.length - 1;

  // Seeded start phase and direction, so each day the route differs.
  const random = mulberry32(seed);
  const offset = Math.floor(random() * cycleLength);
  const reverse = random() < 0.5;
  const headSequence = [];
  for (let index = 0; index < cycleLength; index++) {
    const cycleIndex = reverse
      ? (offset - index + cycleLength) % cycleLength
      : (offset + index) % cycleLength;
    headSequence.push({ ...cycle[cycleIndex] });
  }
  const totalSteps = cycleLength;

  const growthPoints = new Int32Array(totalSteps);
  for (let step = 0; step < totalSteps; step++) {
    const key = coordinateKey(headSequence[step]);
    if (contributions.has(key)) growthPoints[step] = weights.get(key);
  }

  const effectiveShrinkInterval = resolveShrinkInterval(
    shrinkInterval, totalSteps, growthPoints, growthPointsPerSegment,
  );

  const schedule = buildLengthSchedule(
    totalSteps,
    growthPoints,
    effectiveShrinkInterval,
    growthPointsPerSegment,
    minSnakeLength,
    maxLength,
  );

  const trailLength = Math.min(eatTrailSteps, totalSteps);
  const frames = [];
  for (let step = 0; step < totalSteps; step++) {
    const length = Math.min(schedule[step], totalSteps);
    const snakeBody = [];
    for (let offsetIndex = 0; offsetIndex < length; offsetIndex++) {
      const index = (step - offsetIndex + totalSteps) % totalSteps;
      snakeBody.push({ ...headSequence[index] });
    }

    const head = snakeBody[0];
    const previous = snakeBody[1] || head;
    const eaten = new Set();
    for (let offsetIndex = 0; offsetIndex < trailLength; offsetIndex++) {
      const index = (step - offsetIndex + totalSteps) % totalSteps;
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

  const lengths = [...schedule];
  const minSeen = Math.min(...lengths);
  const maxSeen = Math.max(...lengths);
  console.log(
    `🐍 ${frames.length} frames · ${pathCount} path segments · ` +
    `length ${minSeen}..${maxSeen} (max ${maxLength}) · ` +
    `shrink every ${effectiveShrinkInterval} steps · seamless loop`,
  );

  return {
    frames,
    pathCount,
    totalSteps,
    maximumSnakeLength: maxLength,
    minSnakeLength,
    shrinkInterval: effectiveShrinkInterval,
    growthPointsPerSegment,
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
  buildHamiltonianCycle,
  buildLengthSchedule,
  resolveShrinkInterval,
  runSimulation,
  SIMULATION_VERSION,
  DEFAULT_SIMULATION_OPTIONS,
};
