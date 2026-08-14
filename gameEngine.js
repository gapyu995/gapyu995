// Snake simulation for a GitHub contribution grid.

const fs = require('fs');

const SIMULATION_VERSION = 19;
const CONTRIBUTION_RECOVERY_INTERVAL_STEPS = 35;
const GROWTH_POINTS_PER_SEGMENT = 4;
const AUTO_SHRINK_INTERVAL_STEPS = 10;
const DEFAULT_SIMULATION_OPTIONS = Object.freeze({
  initialLength: 3,
  dropInterval: CONTRIBUTION_RECOVERY_INTERVAL_STEPS,
  growthPointsPerSegment: GROWTH_POINTS_PER_SEGMENT,
  autoShrinkInterval: AUTO_SHRINK_INTERVAL_STEPS,
  minimumSteps: 500,
  frameDelayMs: 120,
});

const DIRECTIONS = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
];

class Snake {
  constructor(
    startRow,
    startCol,
    direction,
    initialLength = 3,
    maximumLength = Infinity,
  ) {
    this.maximumLength = Math.max(1, maximumLength);
    this.minimumLength = Math.min(initialLength, this.maximumLength);
    this.targetLength = this.minimumLength;
    this.direction = { ...direction };
    this.alive = true;
    this.body = [];

    for (let index = 0; index < this.minimumLength; index++) {
      this.body.push({
        row: startRow - direction.dr * index,
        col: startCol - direction.dc * index,
      });
    }
  }

  get head() { return this.body[0]; }
  get length() { return this.body.length; }

  grow(amount = 1) {
    const previousLength = this.targetLength;
    this.targetLength = Math.min(this.maximumLength, this.targetLength + amount);
    return this.targetLength - previousLength;
  }

  shrink(amount = 1) {
    this.targetLength = Math.max(this.minimumLength, this.targetLength - amount);
    while (this.body.length > this.targetLength) this.body.pop();
  }

  move(nextRow, nextCol) {
    const previousHead = this.head;
    this.body.unshift({ row: nextRow, col: nextCol });
    this.direction = {
      dr: nextRow - previousHead.row,
      dc: nextCol - previousHead.col,
    };

    while (this.body.length > this.targetLength) this.body.pop();

    const headKey = `${nextRow},${nextCol}`;
    for (let index = 1; index < this.body.length; index++) {
      if (coordinateKey(this.body[index]) === headKey) {
        this.alive = false;
        return false;
      }
    }
    return true;
  }
}

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

function orderedDirections(direction) {
  return [
    direction,
    { dr: -direction.dc, dc: direction.dr },
    { dr: direction.dc, dc: -direction.dr },
    { dr: -direction.dr, dc: -direction.dc },
  ];
}

function chooseStartingSnake(
  contributionSet,
  gridRows,
  gridCols,
  initialLength,
  maximumLength,
) {
  const middleRow = Math.floor(gridRows / 2);
  const rows = [middleRow];
  for (let offset = 1; offset < gridRows; offset++) {
    if (middleRow - offset >= 0) rows.push(middleRow - offset);
    if (middleRow + offset < gridRows) rows.push(middleRow + offset);
  }

  for (const row of rows) {
    for (let headCol = initialLength - 1; headCol < gridCols; headCol++) {
      let clear = true;
      for (let offset = 0; offset < initialLength; offset++) {
        if (contributionSet.has(`${row},${headCol - offset}`)) {
          clear = false;
          break;
        }
      }
      if (clear) {
        return new Snake(
          row,
          headCol,
          { dr: 0, dc: 1 },
          initialLength,
          maximumLength,
        );
      }
    }
  }

  return new Snake(
    middleRow,
    initialLength - 1,
    { dr: 0, dc: 1 },
    initialLength,
    maximumLength,
  );
}

function oldestFoodKey(foodSet, foodSpawnOrders) {
  let oldestKey = null;
  let oldestOrder = Infinity;

  for (const key of foodSet) {
    const order = foodSpawnOrders.get(key);
    if (
      order < oldestOrder ||
      (order === oldestOrder && (oldestKey === null || key.localeCompare(oldestKey) < 0))
    ) {
      oldestKey = key;
      oldestOrder = order;
    }
  }
  return oldestKey;
}

function occupiedForNextMove(snake) {
  const tailWillMove = snake.body.length >= snake.targetLength;
  const occupiedLength = tailWillMove ? snake.body.length - 1 : snake.body.length;
  const occupied = new Set();
  for (let index = 0; index < occupiedLength; index++) {
    occupied.add(coordinateKey(snake.body[index]));
  }
  return occupied;
}

function findShortestPath(snake, targetKey, gridRows, gridCols) {
  if (!targetKey) return [];

  const target = parseCoordinate(targetKey);
  if (coordinateKey(snake.head) === targetKey) return [];

  const occupied = occupiedForNextMove(snake);
  const startKey = coordinateKey(snake.head);
  const visited = new Set([startKey]);
  const queue = [{ row: snake.head.row, col: snake.head.col }];
  const parent = new Map();
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const current = queue[queueIndex++];
    for (const { dr, dc } of orderedDirections(snake.direction)) {
      const row = current.row + dr;
      const col = current.col + dc;
      const key = `${row},${col}`;
      if (
        !insideGrid(row, col, gridRows, gridCols) ||
        occupied.has(key) ||
        visited.has(key)
      ) continue;

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
      if (
        !insideGrid(row, col, gridRows, gridCols) ||
        obstacles.has(key) ||
        visited.has(key)
      ) continue;

      visited.add(key);
      queue.push({ row, col });
    }
  }
  return visited.size;
}

function safestMove(snake, targetKey, gridRows, gridCols) {
  const occupied = occupiedForNextMove(snake);
  const target = targetKey ? parseCoordinate(targetKey) : null;
  const candidates = [];

  for (const { dr, dc } of orderedDirections(snake.direction)) {
    const row = snake.head.row + dr;
    const col = snake.head.col + dc;
    const key = `${row},${col}`;
    if (!insideGrid(row, col, gridRows, gridCols) || occupied.has(key)) continue;

    const simulatedOccupied = new Set(occupied);
    simulatedOccupied.add(key);
    candidates.push({
      row,
      col,
      space: countReachable({ row, col }, simulatedOccupied, gridRows, gridCols),
      distance: target
        ? Math.abs(row - target.row) + Math.abs(col - target.col)
        : 0,
    });
  }

  candidates.sort((left, right) =>
    right.space - left.space || left.distance - right.distance,
  );
  return candidates[0] ? { row: candidates[0].row, col: candidates[0].col } : null;
}

function normalizeContributionWeights(contributionSet, contributionWeights) {
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

function calculateGrowth(progress, foodPoints, pointsPerSegment = 4) {
  const total = progress + foodPoints;
  return {
    grewBy: Math.floor(total / pointsPerSegment),
    progress: total % pointsPerSegment,
  };
}

function collectDueRecoveries(
  originalContributionSet,
  foodSet,
  foodEatenSteps,
  snake,
  cumulativeSteps,
  recoveryDelaySteps,
) {
  const due = [];
  for (const key of originalContributionSet) {
    const eatenStep = foodEatenSteps.get(key);
    if (
      foodSet.has(key) ||
      !Number.isFinite(eatenStep) ||
      cumulativeSteps - eatenStep < recoveryDelaySteps
    ) continue;
    due.push({ key, eatenStep });
  }

  due.sort((left, right) =>
    left.eatenStep - right.eatenStep || left.key.localeCompare(right.key),
  );

  const dueKeys = new Set(due.map(item => item.key));
  const remainingBody = snake.body.map(segment => ({ ...segment }));
  const droppedKeys = [];

  // A batch can drop at most one current tail segment. Other due cells recover
  // simultaneously wherever the snake is not occupying their locations.
  if (remainingBody.length > snake.minimumLength) {
    const tailKey = coordinateKey(remainingBody[remainingBody.length - 1]);
    if (dueKeys.has(tailKey)) {
      droppedKeys.push(tailKey);
      dueKeys.delete(tailKey);
      remainingBody.pop();
    }
  }

  const autoGeneratedKeys = due
    .map(item => item.key)
    .filter(key => dueKeys.has(key));
  const generatedSet = new Set([...droppedKeys, ...autoGeneratedKeys]);
  const generatedKeys = due
    .map(item => item.key)
    .filter(key => generatedSet.has(key));

  return { generatedKeys, droppedKeys, autoGeneratedKeys };
}

function runSimulation(contributionSet, options = {}) {
  const {
    initialLength,
    dropInterval,
    growthPointsPerSegment,
    autoShrinkInterval,
    minimumSteps,
    frameDelayMs,
    gridRows = 7,
    gridCols = 54,
    simulationFile = null,
    contributionWeights = new Map(),
  } = { ...DEFAULT_SIMULATION_OPTIONS, ...options };

  const originalContributionSet = new Set(contributionSet);
  const maximumLength = Math.max(1, originalContributionSet.size);
  const effectiveInitialLength = Math.min(initialLength, maximumLength);
  const originalContributionWeights = normalizeContributionWeights(
    originalContributionSet,
    contributionWeights,
  );
  const foodSet = new Set(originalContributionSet);
  const foodSpawnSteps = new Map();
  const foodSpawnOrders = new Map();
  const foodEatenSteps = new Map();
  const eatenContribSet = new Set();
  let nextSpawnOrder = 0;

  for (const key of originalContributionSet) {
    foodSpawnSteps.set(key, 0);
    foodSpawnOrders.set(key, nextSpawnOrder++);
  }

  const snake = chooseStartingSnake(
    originalContributionSet,
    gridRows,
    gridCols,
    effectiveInitialLength,
    maximumLength,
  );
  const frames = [];
  let cumulativeSteps = 0;
  let growthProgress = 0;
  let totalGrowthPoints = 0;

  frames.push(makeFrame({
    snake,
    foodSet,
    foodSpawnSteps,
    foodSpawnOrders,
    foodEatenSteps,
    eatenContribSet,
    cumulativeSteps,
    growthProgress,
    totalGrowthPoints,
    growthPointsPerSegment,
    targetKey: oldestFoodKey(foodSet, foodSpawnOrders),
  }));

  while (cumulativeSteps < minimumSteps) {
    if (!snake.alive) break;

    const moveTargetKey = oldestFoodKey(foodSet, foodSpawnOrders);
    const path = findShortestPath(snake, moveTargetKey, gridRows, gridCols);
    const next = path && path.length > 0
      ? path[0]
      : safestMove(snake, moveTargetKey, gridRows, gridCols);

    if (!next) {
      snake.alive = false;
      frames.push(makeFrame({
        snake,
        foodSet,
        foodSpawnSteps,
        foodSpawnOrders,
        foodEatenSteps,
        eatenContribSet,
        cumulativeSteps,
        growthProgress,
        totalGrowthPoints,
        growthPointsPerSegment,
        targetKey: moveTargetKey,
        moveTargetKey,
      }));
      break;
    }

    const nextKey = coordinateKey(next);
    const ateKey = foodSet.has(nextKey) ? nextKey : null;
    const atePoints = ateKey ? originalContributionWeights.get(ateKey) : 0;
    let grewBy = 0;
    if (ateKey) {
      const growth = calculateGrowth(
        growthProgress,
        atePoints,
        growthPointsPerSegment,
      );
      growthProgress = growth.progress;
      grewBy = snake.grow(growth.grewBy);
      totalGrowthPoints += atePoints;
    }

    if (!snake.move(next.row, next.col)) {
      frames.push(makeFrame({
        snake,
        foodSet,
        foodSpawnSteps,
        foodSpawnOrders,
        foodEatenSteps,
        eatenContribSet,
        cumulativeSteps,
        growthProgress,
        totalGrowthPoints,
        growthPointsPerSegment,
        targetKey: moveTargetKey,
        moveTargetKey,
        atePoints,
        grewBy,
      }));
      break;
    }
    cumulativeSteps++;

    if (ateKey) {
      foodSet.delete(ateKey);
      foodSpawnSteps.delete(ateKey);
      foodSpawnOrders.delete(ateKey);
      foodEatenSteps.set(ateKey, cumulativeSteps);
      eatenContribSet.add(ateKey);
    }

    frames.push(makeFrame({
      snake,
      foodSet,
      foodSpawnSteps,
      foodSpawnOrders,
      foodEatenSteps,
      eatenContribSet,
      cumulativeSteps,
      growthProgress,
      totalGrowthPoints,
      growthPointsPerSegment,
      targetKey: oldestFoodKey(foodSet, foodSpawnOrders),
      moveTargetKey,
      ateKey,
      atePoints,
      grewBy,
    }));

    // Movement naturally costs one segment every N steps. This event never
    // creates food or any other object, and it stops at the safe minimum length.
    if (
      autoShrinkInterval > 0 &&
      cumulativeSteps % autoShrinkInterval === 0 &&
      snake.body.length > snake.minimumLength
    ) {
      snake.shrink(1);
      frames.push(makeFrame({
        snake,
        foodSet,
        foodSpawnSteps,
        foodSpawnOrders,
        foodEatenSteps,
        eatenContribSet,
        cumulativeSteps,
        growthProgress,
        totalGrowthPoints,
        growthPointsPerSegment,
        targetKey: oldestFoodKey(foodSet, foodSpawnOrders),
        autoShrinkBy: 1,
      }));
    }

    // Every contribution has its own timer. Restore every due, unoccupied
    // contribution in one simultaneous event instead of releasing one globally.
    const recoveryBatch = collectDueRecoveries(
      originalContributionSet,
      foodSet,
      foodEatenSteps,
      snake,
      cumulativeSteps,
      dropInterval,
    );
    if (recoveryBatch.generatedKeys.length > 0) {
      const { generatedKeys, droppedKeys, autoGeneratedKeys } = recoveryBatch;
      if (droppedKeys.length > 0) snake.shrink(droppedKeys.length);

      for (const recoveredKey of generatedKeys) {
        foodSet.add(recoveredKey);
        foodSpawnSteps.set(recoveredKey, cumulativeSteps);
        foodSpawnOrders.set(recoveredKey, nextSpawnOrder++);
        foodEatenSteps.delete(recoveredKey);
        eatenContribSet.delete(recoveredKey);
      }

      const recoveryType = droppedKeys.length > 0 && autoGeneratedKeys.length > 0
        ? 'batch'
        : droppedKeys.length > 0 ? 'tail' : 'auto';

      frames.push(makeFrame({
        snake,
        foodSet,
        foodSpawnSteps,
        foodSpawnOrders,
        foodEatenSteps,
        eatenContribSet,
        cumulativeSteps,
        growthProgress,
        totalGrowthPoints,
        growthPointsPerSegment,
        targetKey: oldestFoodKey(foodSet, foodSpawnOrders),
        generatedKey: generatedKeys[0],
        generatedKeys,
        autoGeneratedKeys,
        droppedKey: droppedKeys[0] || null,
        droppedKeys,
        dropSourceKey: droppedKeys[0] || null,
        recoveryType,
      }));
    }
  }

  const simData = {
    version: SIMULATION_VERSION,
    options: {
      initialLength,
      effectiveInitialLength,
      maximumLength,
      dropInterval,
      growthPointsPerSegment,
      autoShrinkInterval,
      minimumSteps,
      frameDelayMs,
      gridRows,
      gridCols,
    },
    basePermanentSet: [...originalContributionSet],
    baseContributionWeights: [...originalContributionWeights],
    frames: frames.map(serializeFrame),
    cumulativeSteps,
  };

  if (simulationFile) fs.writeFileSync(simulationFile, JSON.stringify(simData));

  const eatEvents = frames.filter(frame => frame.ateKey).length;
  const generationBatches = frames.filter(frame => frame.generatedKeys.length > 0).length;
  const generatedEvents = frames.reduce(
    (total, frame) => total + frame.generatedKeys.length,
    0,
  );
  const dropEvents = frames.reduce(
    (total, frame) => total + frame.droppedKeys.length,
    0,
  );
  const autoEvents = frames.reduce(
    (total, frame) => total + frame.autoGeneratedKeys.length,
    0,
  );
  const autoShrinkEvents = frames.reduce(
    (total, frame) => total + frame.autoShrinkBy,
    0,
  );
  console.log(
    `🐍 ${frames.length} 帧, ${cumulativeSteps} 步, ` +
    `吃:${eatEvents}, 生成:${generatedEvents}/${generationBatches}批 ` +
    `(尾:${dropEvents}, 自动:${autoEvents}), ` +
    `自然损耗:${autoShrinkEvents}, ` +
    `最旧目标:${oldestFoodKey(foodSet, foodSpawnOrders) || 'none'}`,
  );

  return {
    frames,
    snake,
    foodSet,
    foodSpawnOrders,
    foodEatenSteps,
    contributionWeights: originalContributionWeights,
    eatenContribSet,
    cumulativeSteps,
    growthProgress,
    totalGrowthPoints,
  };
}

function makeFrame({
  snake,
  foodSet,
  foodSpawnSteps,
  foodSpawnOrders,
  foodEatenSteps,
  eatenContribSet,
  cumulativeSteps,
  growthProgress = 0,
  totalGrowthPoints = 0,
  growthPointsPerSegment = GROWTH_POINTS_PER_SEGMENT,
  targetKey = null,
  moveTargetKey = null,
  generatedKey = null,
  generatedKeys = [],
  autoGeneratedKeys = [],
  ateKey = null,
  droppedKey = null,
  droppedKeys = [],
  dropSourceKey = null,
  recoveryType = null,
  atePoints = 0,
  grewBy = 0,
  autoShrinkBy = 0,
}) {
  return {
    snakeBody: snake.body.map(segment => ({ ...segment })),
    snakeDirection: { ...snake.direction },
    snakeAlive: snake.alive,
    foodSet: new Set(foodSet),
    foodSpawnSteps: new Map(foodSpawnSteps),
    foodSpawnOrders: new Map(foodSpawnOrders),
    foodEatenSteps: new Map(foodEatenSteps),
    permanentSet: new Set(),
    permanentColorKeys: new Map(),
    eatenContribSet: new Set(eatenContribSet),
    cumulativeSteps,
    growthProgress,
    totalGrowthPoints,
    growthPointsPerSegment,
    targetKey,
    moveTargetKey,
    generatedKey,
    generatedKeys: [...generatedKeys],
    autoGeneratedKeys: [...autoGeneratedKeys],
    ateKey,
    droppedKey,
    droppedKeys: [...droppedKeys],
    dropSourceKey,
    recoveryType,
    atePoints,
    grewBy,
    autoShrinkBy,
  };
}

function serializeFrame(frame) {
  return {
    snakeBody: frame.snakeBody,
    snakeDirection: frame.snakeDirection,
    snakeAlive: frame.snakeAlive,
    foodSet: [...frame.foodSet],
    foodSpawnSteps: [...frame.foodSpawnSteps],
    foodSpawnOrders: [...frame.foodSpawnOrders],
    foodEatenSteps: [...frame.foodEatenSteps],
    permanentSet: [],
    permanentColorKeys: [],
    eatenContribSet: [...frame.eatenContribSet],
    cumulativeSteps: frame.cumulativeSteps,
    growthProgress: frame.growthProgress,
    totalGrowthPoints: frame.totalGrowthPoints,
    growthPointsPerSegment: frame.growthPointsPerSegment,
    targetKey: frame.targetKey,
    moveTargetKey: frame.moveTargetKey,
    generatedKey: frame.generatedKey,
    generatedKeys: frame.generatedKeys,
    autoGeneratedKeys: frame.autoGeneratedKeys,
    ateKey: frame.ateKey,
    droppedKey: frame.droppedKey,
    droppedKeys: frame.droppedKeys,
    dropSourceKey: frame.dropSourceKey,
    recoveryType: frame.recoveryType,
    atePoints: frame.atePoints,
    grewBy: frame.grewBy,
    autoShrinkBy: frame.autoShrinkBy,
  };
}

function loadSimulation(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return {
    version: data.version || 1,
    options: data.options || null,
    basePermanentSet: new Set(data.basePermanentSet),
    baseContributionWeights: new Map(data.baseContributionWeights || []),
    frames: data.frames.map(frame => ({
      snakeBody: frame.snakeBody,
      snakeDirection: frame.snakeDirection,
      snakeAlive: frame.snakeAlive,
      foodSet: new Set(frame.foodSet),
      foodSpawnSteps: new Map(frame.foodSpawnSteps || []),
      foodSpawnOrders: new Map(frame.foodSpawnOrders || []),
      foodEatenSteps: new Map(frame.foodEatenSteps || []),
      permanentSet: new Set(),
      permanentColorKeys: new Map(),
      eatenContribSet: new Set(frame.eatenContribSet),
      cumulativeSteps: frame.cumulativeSteps,
      growthProgress: frame.growthProgress || 0,
      totalGrowthPoints: frame.totalGrowthPoints || 0,
      growthPointsPerSegment: frame.growthPointsPerSegment || GROWTH_POINTS_PER_SEGMENT,
      targetKey: frame.targetKey || null,
      moveTargetKey: frame.moveTargetKey || null,
      generatedKey: frame.generatedKey || null,
      generatedKeys: frame.generatedKeys || (frame.generatedKey ? [frame.generatedKey] : []),
      autoGeneratedKeys: frame.autoGeneratedKeys || [],
      ateKey: frame.ateKey || null,
      droppedKey: frame.droppedKey || null,
      droppedKeys: frame.droppedKeys || (frame.droppedKey ? [frame.droppedKey] : []),
      dropSourceKey: frame.dropSourceKey || null,
      recoveryType: frame.recoveryType || null,
      atePoints: frame.atePoints || 0,
      grewBy: frame.grewBy || 0,
      autoShrinkBy: frame.autoShrinkBy || 0,
    })),
    cumulativeSteps: data.cumulativeSteps,
  };
}

module.exports = {
  Snake,
  oldestFoodKey,
  findShortestPath,
  isAdjacent,
  calculateGrowth,
  collectDueRecoveries,
  runSimulation,
  loadSimulation,
  SIMULATION_VERSION,
  CONTRIBUTION_RECOVERY_INTERVAL_STEPS,
  GROWTH_POINTS_PER_SEGMENT,
  AUTO_SHRINK_INTERVAL_STEPS,
  DEFAULT_SIMULATION_OPTIONS,
};
