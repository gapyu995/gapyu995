// Snake simulation for a GitHub contribution grid.
//
// The snake is driven by a deterministic state-transition rule instead of a
// precomputed path: every step it picks the nearest food and walks the
// shortest safe route toward it, falling back to the move that keeps the most
// space reachable when no route exists. Because the state space is finite and
// the transition is deterministic, the trajectory eventually repeats; we run
// it until that repetition and use the resulting cycle as a seamless loop.

const SIMULATION_VERSION = 24;

const DEFAULT_SIMULATION_OPTIONS = Object.freeze({
  minSnakeLength: 3,
  shrinkInterval: 8,
  growthPointsPerSegment: 4,
  foodRegenerateSteps: 100,
  frameDelayMs: 120,
  gridRows: 7,
  gridCols: 54,
  maxSimulationSteps: 1600,
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

function parseCoordinate(key) {
  const [row, col] = key.split(',').map(Number);
  return { row, col };
}

function isAdjacent(a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

function insideGrid(row, col, gridRows, gridCols) {
  return row >= 0 && row < gridRows && col >= 0 && col < gridCols;
}

function hashString(value) {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

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

function orderedDirections(direction) {
  return [
    direction,
    { dr: -direction.dc, dc: direction.dr },
    { dr: direction.dc, dc: -direction.dr },
    { dr: -direction.dr, dc: -direction.dc },
  ];
}

// Cells the snake will occupy after the next move (tail vacates if not growing).
function occupiedForNextMove(body, targetLength) {
  const tailWillMove = body.length >= targetLength;
  const occupied = new Set();
  const count = tailWillMove ? body.length - 1 : body.length;
  for (let index = 0; index < count; index++) {
    occupied.add(coordinateKey(body[index]));
  }
  return occupied;
}

function findShortestPath(body, direction, head, targetKey, gridRows, gridCols) {
  if (!targetKey) return null;
  if (coordinateKey(head) === targetKey) return [];

  const occupied = occupiedForNextMove(body, body.length);
  const startKey = coordinateKey(head);
  const visited = new Set([startKey]);
  const queue = [{ row: head.row, col: head.col }];
  const parent = new Map();
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const current = queue[queueIndex++];
    for (const { dr, dc } of orderedDirections(direction)) {
      const row = current.row + dr;
      const col = current.col + dc;
      const key = `${row},${col}`;
      if (!insideGrid(row, col, gridRows, gridCols) || occupied.has(key) || visited.has(key)) continue;

      visited.add(key);
      parent.set(key, coordinateKey(current));
      if (key === targetKey) {
        const path = [{ row, col }];
        let cursor = key;
        while (parent.get(cursor) !== startKey) {
          cursor = parent.get(cursor);
          path.push(parseCoordinate(cursor));
        }
        return path.reverse();
      }
      queue.push({ row, col });
    }
  }
  return null;
}

function countReachable(start, obstacles, gridRows, gridCols) {
  const visited = new Set([coordinateKey(start)]);
  const queue = [start];
  let queueIndex = 0;
  while (queueIndex < queue.length) {
    const current = queue[queueIndex++];
    for (const { dr, dc } of DIRECTIONS) {
      const row = current.row + dr;
      const col = current.col + dc;
      const key = `${row},${col}`;
      if (!insideGrid(row, col, gridRows, gridCols) || obstacles.has(key) || visited.has(key)) continue;
      visited.add(key);
      queue.push({ row, col });
    }
  }
  return visited.size;
}

function nearestFoodKey(head, foodSet) {
  let bestKey = null;
  let bestDistance = Infinity;
  for (const key of foodSet) {
    const food = parseCoordinate(key);
    const distance = Math.abs(head.row - food.row) + Math.abs(head.col - food.col);
    if (distance < bestDistance || (distance === bestDistance && key < bestKey)) {
      bestKey = key;
      bestDistance = distance;
    }
  }
  return bestKey;
}

function safestMove(body, direction, head, gridRows, gridCols) {
  const occupied = occupiedForNextMove(body, body.length);
  const candidates = [];
  for (const { dr, dc } of orderedDirections(direction)) {
    const row = head.row + dr;
    const col = head.col + dc;
    const key = `${row},${col}`;
    if (!insideGrid(row, col, gridRows, gridCols) || occupied.has(key)) continue;
    const simulated = new Set(occupied);
    simulated.add(key);
    candidates.push({
      row,
      col,
      space: countReachable({ row, col }, simulated, gridRows, gridCols),
    });
  }
  candidates.sort((a, b) => b.space - a.space);
  return candidates[0] ? { row: candidates[0].row, col: candidates[0].col } : null;
}

function runSimulation(contributionSet, options = {}) {
  const {
    minSnakeLength,
    shrinkInterval,
    growthPointsPerSegment,
    foodRegenerateSteps,
    frameDelayMs,
    gridRows,
    gridCols,
    maxSimulationSteps,
    seed = defaultSeed(new Set(contributionSet)),
    contributionWeights = new Map(),
  } = { ...DEFAULT_SIMULATION_OPTIONS, ...options };

  const contributions = new Set(contributionSet);
  const weights = normalizeWeights(contributions, contributionWeights);
  const maxLength = Math.max(1, contributions.size);
  const minLength = Math.min(minSnakeLength, maxLength);

  const random = mulberry32(seed);
  const startRow = Math.floor(random() * gridRows);
  const startCol = minLength - 1;
  const body = [];
  for (let index = 0; index < minLength; index++) {
    body.push({ row: startRow, col: startCol - index });
  }
  let direction = { dr: 0, dc: 1 };
  let targetLength = minLength;
  let growthProgress = 0;
  let alive = true;

  const foodSet = new Set(contributions);
  const foodSpawnOrders = new Map();
  let nextSpawnOrder = 0;
  for (const key of contributions) foodSpawnOrders.set(key, nextSpawnOrder++);
  // regen: key -> steps until it becomes food again
  const regeneration = new Map();

  const frames = [];
  const seen = new Map();
  let cycleStart = -1;
  let cycleEnd = -1;

  function pushFrame() {
    frames.push({
      snakeBody: body.map(segment => ({ ...segment })),
      snakeDirection: { ...direction },
      snakeAlive: alive,
      foodSet: new Set(foodSet),
      cumulativeSteps: frames.length,
    });
  }

  pushFrame();

  for (let step = 1; step <= maxSimulationSteps; step++) {
    if (!alive) break;

    // State hash for cycle detection. The regeneration countdowns are
    // deliberately excluded: the rendered frames only depend on the snake body
    // and the food set, so a repeated (body + food) state already gives a
    // visually seamless loop even though internal countdowns keep drifting.
    const bodyKeys = body.map(coordinateKey).join(',');
    const sortedFood = [...foodSet].sort().join(',');
    const state = [
      coordinateKey(body[0]),
      bodyKeys,
      targetLength,
      growthProgress,
      step % Math.max(1, shrinkInterval),
      sortedFood,
    ].join('|');

    if (seen.has(state)) {
      cycleStart = seen.get(state);
      cycleEnd = frames.length;
      break;
    }
    seen.set(state, frames.length);

    const head = body[0];
    const targetKey = nearestFoodKey(head, foodSet);
    const path = findShortestPath(body, direction, head, targetKey, gridRows, gridCols);
    const next = (path && path.length > 0) ? path[0] : safestMove(body, direction, head, gridRows, gridCols);

    if (!next) {
      alive = false;
      pushFrame();
      break;
    }

    const nextKey = coordinateKey(next);
    const ateKey = foodSet.has(nextKey) ? nextKey : null;
    let grewBy = 0;
    if (ateKey) {
      const points = weights.get(ateKey);
      const total = growthProgress + points;
      grewBy = Math.floor(total / growthPointsPerSegment);
      growthProgress = total % growthPointsPerSegment;
      targetLength = Math.min(targetLength + grewBy, maxLength);
    }

    body.unshift({ ...next });
    direction = { dr: next.row - head.row, dc: next.col - head.col };
    while (body.length > targetLength) body.pop();

    // Self-collision check.
    const headKey = coordinateKey(body[0]);
    for (let index = 1; index < body.length; index++) {
      if (coordinateKey(body[index]) === headKey) {
        alive = false;
        break;
      }
    }
    if (!alive) {
      pushFrame();
      break;
    }

    if (ateKey) {
      foodSet.delete(ateKey);
      foodSpawnOrders.delete(ateKey);
      // Staggered regeneration: heavier contribution days take longer to come
      // back, so eaten cells reappear at different times instead of in sync.
      const weight = weights.get(ateKey);
      const delay = Math.round(foodRegenerateSteps * (1 + (weight - 1) / 3));
      regeneration.set(ateKey, delay);
    }

    if (step % Math.max(1, shrinkInterval) === 0) {
      targetLength = Math.max(targetLength - 1, minLength);
      while (body.length > targetLength) body.pop();
    }

    // Advance food regeneration.
    for (const [key, left] of [...regeneration.entries()]) {
      const nextLeft = left - 1;
      if (nextLeft <= 0) {
        regeneration.delete(key);
        foodSet.add(key);
        foodSpawnOrders.set(key, nextSpawnOrder++);
      } else {
        regeneration.set(key, nextLeft);
      }
    }

    pushFrame();
  }

  let framesOut = frames;
  if (cycleStart >= 0 && cycleEnd > cycleStart) {
    framesOut = frames.slice(cycleStart, cycleEnd);
  } else {
    // No cycle detected within the budget: fall back to the whole run minus the
    // last frame (so it still loops at least once). This is a safety net.
    framesOut = frames.slice(0, frames.length - 1);
  }

  const lengths = framesOut.map(frame => frame.snakeBody.length);
  const minSeen = Math.min(...lengths);
  const maxSeen = Math.max(...lengths);
  console.log(
    `🐍 ${framesOut.length} frames (cycle ${cycleStart >= 0 ? 'detected' : 'fallback'}) · ` +
    `length ${minSeen}..${maxSeen} (max ${maxLength}) · ` +
    `shrink every ${shrinkInterval} steps`,
  );

  return {
    frames: framesOut,
    totalSteps: framesOut.length,
    maximumSnakeLength: maxLength,
    minSnakeLength: minLength,
    shrinkInterval,
    growthPointsPerSegment,
    foodRegenerateSteps,
    frameDelayMs,
    contributionSet: contributions,
    cumulativeSteps: framesOut.length,
  };
}

module.exports = {
  coordinateKey,
  isAdjacent,
  parseCoordinate,
  hashString,
  mulberry32,
  nearestFoodKey,
  findShortestPath,
  safestMove,
  runSimulation,
  SIMULATION_VERSION,
  DEFAULT_SIMULATION_OPTIONS,
};
