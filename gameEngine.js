// gameEngine.js — Shared Snake game engine for GitHub contribution grid
// Used by both generateGame.js (SVG) and generateGif.js (GIF)

const rows = 7;
const cols = 52;

// ===== Snake Class =====
class Snake {
  constructor(startRow, startCol, initialLength) {
    // body[0] is HEAD, body[length-1] is TAIL
    this.body = [];
    for (let i = 0; i < initialLength; i++) {
      this.body.push({ row: startRow, col: startCol - i });
    }
    this.targetLength = initialLength;
    this.direction = { dr: 0, dc: 1 };
    this.alive = true;
  }

  get head() { return this.body[0]; }
  get length() { return this.body.length; }

  move(nextRow, nextCol) {
    this.body.unshift({ row: nextRow, col: nextCol });
    const prevHead = this.body[1];
    this.direction = { dr: nextRow - prevHead.row, dc: nextCol - prevHead.col };
    while (this.body.length > this.targetLength) {
      this.body.pop();
    }
    // self-collision check
    const head = this.head;
    for (let i = 1; i < this.body.length; i++) {
      if (this.body[i].row === head.row && this.body[i].col === head.col) {
        this.alive = false;
        return false;
      }
    }
    return true;
  }

  grow(amount = 1) { this.targetLength += amount; }
  shrink(amount = 2) { this.targetLength = Math.max(3, this.targetLength - amount); }

  getOccupiedSet() {
    const set = new Set();
    for (const seg of this.body) set.add(`${seg.row},${seg.col}`);
    return set;
  }
}

// ===== Strategic AI: Flood Fill Reachable Count =====
/**
 * Starting from a given cell, count how many cells are reachable
 * without stepping on obstacles. This is the classic "don't trap yourself"
 * snake AI heuristic: always pick the move that leaves the most open space.
 */
function floodFillCount(startRow, startCol, obstacles, gridRows, gridCols, maxCount = 200) {
  const visited = new Set();
  const queue = [{ row: startRow, col: startCol }];
  visited.add(`${startRow},${startCol}`);

  const dirs = [
    { dr: -1, dc: 0 }, { dr: 1, dc: 0 },
    { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
  ];

  let count = 0;
  let qi = 0;
  while (qi < queue.length && count < maxCount) {
    const cur = queue[qi++];
    count++;
    for (const d of dirs) {
      const nr = cur.row + d.dr;
      const nc = cur.col + d.dc;
      const key = `${nr},${nc}`;
      if (nr >= 0 && nr < gridRows && nc >= 0 && nc < gridCols &&
          !obstacles.has(key) && !visited.has(key)) {
        visited.add(key);
        queue.push({ row: nr, col: nc });
      }
    }
  }
  return count;
}

// ===== BFS Pathfinding to nearest food =====
function bfsNextMove(snake, foodSet, permanentSet, gridRows, gridCols) {
  const head = snake.head;
  const occupied = new Set();

  // Block all body segments EXCEPT the tail (it will vacate)
  for (let i = 0; i < snake.body.length - 1; i++) {
    occupied.add(`${snake.body[i].row},${snake.body[i].col}`);
  }
  for (const key of permanentSet) occupied.add(key);

  const visited = new Set();
  visited.add(`${head.row},${head.col}`);

  const directions = [
    { dr: -1, dc: 0 }, { dr: 1, dc: 0 },
    { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
  ];

  const queue = [];

  // Enqueue initial neighbors
  for (const d of directions) {
    const nr = head.row + d.dr;
    const nc = head.col + d.dc;
    const key = `${nr},${nc}`;

    if (nr >= 0 && nr < gridRows && nc >= 0 && nc < gridCols &&
        !occupied.has(key) && !visited.has(key)) {
      if (foodSet.has(key)) {
        return { row: nr, col: nc };
      }
      visited.add(key);
      queue.push({ row: nr, col: nc, firstStepRow: nr, firstStepCol: nc });
    }
  }

  let qIdx = 0;
  while (qIdx < queue.length) {
    const cur = queue[qIdx++];
    for (const d of directions) {
      const nr = cur.row + d.dr;
      const nc = cur.col + d.dc;
      const key = `${nr},${nc}`;

      if (nr >= 0 && nr < gridRows && nc >= 0 && nc < gridCols &&
          !occupied.has(key) && !visited.has(key)) {
        if (foodSet.has(key)) {
          return { row: cur.firstStepRow, col: cur.firstStepCol };
        }
        visited.add(key);
        queue.push({
          row: nr, col: nc,
          firstStepRow: cur.firstStepRow, firstStepCol: cur.firstStepCol,
        });
      }
    }
  }
  return null;
}

// ===== Strategic Safe Move (used when BFS can't reach food) =====
/**
 * Instead of random movement, use flood-fill to evaluate each possible move
 * and pick the one that leaves the most open space. This avoids dead ends
 * and "dumb spinning" behavior.
 */
function strategicSafeMove(snake, permanentSet, gridRows, gridCols) {
  const head = snake.head;
  const occupied = snake.getOccupiedSet();
  // Remove tail from occupied (it will vacate unless we're growing)
  const isGrowing = snake.body.length < snake.targetLength;
  if (!isGrowing && snake.body.length > 1) {
    const tail = snake.body[snake.body.length - 1];
    occupied.delete(`${tail.row},${tail.col}`);
  }
  for (const key of permanentSet) occupied.add(key);

  const directions = [
    { dr: -1, dc: 0 }, { dr: 1, dc: 0 },
    { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
  ];

  // Evaluate each possible direction
  const candidates = [];
  for (const d of directions) {
    const nr = head.row + d.dr;
    const nc = head.col + d.dc;
    const key = `${nr},${nc}`;

    if (nr >= 0 && nr < gridRows && nc >= 0 && nc < gridCols && !occupied.has(key)) {
      // Simulate moving here, then count flood fill
      const simOccupied = new Set(occupied);
      for (const seg of snake.body) simOccupied.add(`${seg.row},${seg.col}`);
      // Remove tail if not growing
      if (!isGrowing && snake.body.length > 1) {
        simOccupied.delete(`${snake.body[snake.body.length - 1].row},${snake.body[snake.body.length - 1].col}`);
      }
      // Add new head position
      simOccupied.add(key);
      // Remove the actual new head from obstacles for flood fill
      const fillSet = new Set(simOccupied);
      const reachable = floodFillCount(nr, nc, fillSet, gridRows, gridCols);
      candidates.push({ ...d, reachable });
    }
  }

  if (candidates.length === 0) return null;

  // Sort by reachable count descending (prefer more open space)
  candidates.sort((a, b) => b.reachable - a.reachable);

  // Add some randomness: if top candidates have similar reachable counts, pick randomly among them
  const best = candidates[0];
  const similarThreshold = Math.max(1, best.reachable * 0.85);
  const topCandidates = candidates.filter(c => c.reachable >= similarThreshold);

  if (topCandidates.length <= 1) {
    return { row: head.row + best.dr, col: head.col + best.dc };
  }

  const chosen = topCandidates[Math.floor(Math.random() * topCandidates.length)];
  return { row: head.row + chosen.dr, col: head.col + chosen.dc };
}

// ===== Food Spawning (ONLY on original GitHub contribution cells) =====
function spawnFood(foodSet, foodSpawnSteps, currentStep, occupiedSet, permanentSet, basePermanentSet, recentlyEatenSet, gridRows, gridCols, maxFood, spawnProbability) {
  if (foodSet.size >= maxFood) return;
  if (Math.random() > spawnProbability) return;

  const blocked = new Set(occupiedSet);
  for (const key of permanentSet) blocked.add(key);
  for (const key of foodSet) blocked.add(key);
  for (const [key] of recentlyEatenSet) blocked.add(key);

  // Only pick from real GitHub contribution cells
  const available = [];
  for (const key of basePermanentSet) {
    if (!blocked.has(key)) {
      const [r, c] = key.split(',').map(Number);
      available.push({ row: r, col: c });
    }
  }

  if (available.length === 0) return;

  const chosen = available[Math.floor(Math.random() * available.length)];
  const key = `${chosen.row},${chosen.col}`;
  foodSet.add(key);
  foodSpawnSteps.set(key, currentStep);
}

// ===== Simulation Loop =====
/**
 * @param {Set} basePermanentSet — Cells with original GitHub contributions ("row,col")
 * @param {Object} options
 * @returns {{ frames: Array, finalPermanentSet: Set, snake: Snake, foodSet: Set, cumulativeSteps: number }}
 */
function runSimulation(basePermanentSet, options = {}) {
  const {
    totalSteps = 400,
    maxFood = 5,
    spawnProb = 0.25,
    snakeStartRow = 3,
    snakeStartCol = 26,
    initialLength = 3,
    threshold = 20,
  } = options;

  const snake = new Snake(snakeStartRow, snakeStartCol, initialLength);
  const foodSet = new Set();
  const foodSpawnSteps = new Map(); // key → step when spawned (for animation)
  // permanentSet starts EMPTY — only accumulates marks the snake leaves in Phase 2
  const permanentSet = new Set();
  // cooldown for recently-eaten cells: key → remaining steps (prevents instant respawn)
  const recentlyEatenSet = new Map();
  const FOOD_COOLDOWN = 3;
  let cumulativeSteps = 0;
  const frames = [];

  // Spawn initial food (only on basePermanentSet cells)
  const initOccupied = snake.getOccupiedSet();
  spawnFood(foodSet, foodSpawnSteps, 0, initOccupied, permanentSet, basePermanentSet, recentlyEatenSet, rows, cols, maxFood, 1.0);
  if (foodSet.size === 0) {
    const blocked = new Set(initOccupied);
    for (const key of basePermanentSet) {
      if (!blocked.has(key)) { foodSet.add(key); foodSpawnSteps.set(key, 0); if (foodSet.size >= 2) break; }
    }
  }

  frames.push(makeFrame(snake, foodSet, foodSpawnSteps, permanentSet, cumulativeSteps));

  for (let step = 0; step < totalSteps; step++) {
    if (!snake.alive) break;

    // Tick cooldowns
    const expiredKeys = [];
    for (const [key, cd] of recentlyEatenSet) {
      if (cd <= 1) expiredKeys.push(key);
      else recentlyEatenSet.set(key, cd - 1);
    }
    for (const key of expiredKeys) recentlyEatenSet.delete(key);

    // Try BFS to food first
    let nextMove = bfsNextMove(snake, foodSet, permanentSet, rows, cols);

    // Fallback: strategic safe move (flood-fill based, not random)
    if (!nextMove) {
      nextMove = strategicSafeMove(snake, permanentSet, rows, cols);
    }

    if (!nextMove) {
      snake.alive = false;
      frames.push(makeFrame(snake, foodSet, foodSpawnSteps, permanentSet, cumulativeSteps));
      break;
    }

    const moved = snake.move(nextMove.row, nextMove.col);
    cumulativeSteps++;

    if (!moved) {
      frames.push(makeFrame(snake, foodSet, foodSpawnSteps, permanentSet, cumulativeSteps));
      break;
    }

    // Check if head is on food
    const headKey = `${snake.head.row},${snake.head.col}`;
    if (foodSet.has(headKey)) {
      foodSet.delete(headKey);
      foodSpawnSteps.delete(headKey);
      // Add cooldown to prevent instant respawn at same position
      recentlyEatenSet.set(headKey, FOOD_COOLDOWN);

      if (cumulativeSteps < threshold) {
        // Phase 1: grow
        snake.grow(1);
      } else if (basePermanentSet.has(headKey)) {
        // Phase 2: cell MUST have an original GitHub contribution to become permanent
        permanentSet.add(headKey);
        snake.shrink(2);
      } else {
        // Phase 2 but no original contribution here — just eat normally (grow)
        snake.grow(1);
      }
    }

    // Spawn new food (only on basePermanentSet, max 4)
    const occupied = snake.getOccupiedSet();
    for (const key of permanentSet) occupied.add(key);
    spawnFood(foodSet, foodSpawnSteps, step, occupied, permanentSet, basePermanentSet, recentlyEatenSet, rows, cols, maxFood, spawnProb);

    frames.push(makeFrame(snake, foodSet, foodSpawnSteps, permanentSet, cumulativeSteps));

    while (snake.body.length > snake.targetLength) {
      snake.body.pop();
    }
  }

  return { frames, finalPermanentSet: permanentSet, snake, foodSet, cumulativeSteps };
}

function makeFrame(snake, foodSet, foodSpawnSteps, permanentSet, cumulativeSteps) {
  return {
    snakeBody: snake.body.map(s => ({ row: s.row, col: s.col })),
    snakeDirection: { dr: snake.direction.dr, dc: snake.direction.dc },
    snakeAlive: snake.alive,
    foodSet: new Set(foodSet),
    foodSpawnSteps: new Map(foodSpawnSteps),
    permanentSet: new Set(permanentSet),
    cumulativeSteps,
  };
}

module.exports = {
  Snake,
  bfsNextMove,
  strategicSafeMove,
  floodFillCount,
  spawnFood,
  runSimulation,
  ROWS: rows,
  COLS: cols,
};
