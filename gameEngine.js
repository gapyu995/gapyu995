// gameEngine.js — Shared Snake game engine for GitHub contribution grid
// Used by both generateGame.js (SVG) and generateGif.js (GIF)
// Simulation is saved to simulation.json for consistency

const fs = require('fs');

const rows = 7;
const cols = 52;

// ===== Snake Class =====
class Snake {
  constructor(startRow, startCol, initialLength) {
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
    while (this.body.length > this.targetLength) this.body.pop();
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

// ===== Flood Fill (for strategic movement) =====
function floodFillCount(startRow, startCol, obstacles, gridRows, gridCols, maxCount = 200) {
  const visited = new Set();
  const queue = [{ row: startRow, col: startCol }];
  visited.add(`${startRow},${startCol}`);
  const dirs = [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 }];
  let count = 0, qi = 0;
  while (qi < queue.length && count < maxCount) {
    const cur = queue[qi++]; count++;
    for (const d of dirs) {
      const nr = cur.row + d.dr, nc = cur.col + d.dc;
      const key = `${nr},${nc}`;
      if (nr >= 0 && nr < gridRows && nc >= 0 && nc < gridCols && !obstacles.has(key) && !visited.has(key)) {
        visited.add(key);
        queue.push({ row: nr, col: nc });
      }
    }
  }
  return count;
}

// ===== BFS to nearest food =====
function bfsNextMove(snake, foodSet, permanentSet, gridRows, gridCols) {
  const head = snake.head;
  const occupied = new Set();
  for (let i = 0; i < snake.body.length - 1; i++) occupied.add(`${snake.body[i].row},${snake.body[i].col}`);
  for (const key of permanentSet) occupied.add(key);

  const visited = new Set();
  visited.add(`${head.row},${head.col}`);
  const directions = [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 }];
  const queue = [];

  for (const d of directions) {
    const nr = head.row + d.dr, nc = head.col + d.dc;
    const key = `${nr},${nc}`;
    if (nr >= 0 && nr < gridRows && nc >= 0 && nc < gridCols && !occupied.has(key) && !visited.has(key)) {
      if (foodSet.has(key)) return { row: nr, col: nc };
      visited.add(key);
      queue.push({ row: nr, col: nc, firstStepRow: nr, firstStepCol: nc });
    }
  }

  let qIdx = 0;
  while (qIdx < queue.length) {
    const cur = queue[qIdx++];
    for (const d of directions) {
      const nr = cur.row + d.dr, nc = cur.col + d.dc;
      const key = `${nr},${nc}`;
      if (nr >= 0 && nr < gridRows && nc >= 0 && nc < gridCols && !occupied.has(key) && !visited.has(key)) {
        if (foodSet.has(key)) return { row: cur.firstStepRow, col: cur.firstStepCol };
        visited.add(key);
        queue.push({ row: nr, col: nc, firstStepRow: cur.firstStepRow, firstStepCol: cur.firstStepCol });
      }
    }
  }
  return null;
}

// ===== Strategic safe move (flood-fill based) =====
function strategicSafeMove(snake, permanentSet, gridRows, gridCols) {
  const head = snake.head;
  const occupied = snake.getOccupiedSet();
  const isGrowing = snake.body.length < snake.targetLength;
  if (!isGrowing && snake.body.length > 1) {
    const tail = snake.body[snake.body.length - 1];
    occupied.delete(`${tail.row},${tail.col}`);
  }
  for (const key of permanentSet) occupied.add(key);

  const directions = [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 }];
  const candidates = [];
  for (const d of directions) {
    const nr = head.row + d.dr, nc = head.col + d.dc;
    const key = `${nr},${nc}`;
    if (nr >= 0 && nr < gridRows && nc >= 0 && nc < gridCols && !occupied.has(key)) {
      const simOccupied = new Set(occupied);
      for (const seg of snake.body) simOccupied.add(`${seg.row},${seg.col}`);
      if (!isGrowing && snake.body.length > 1) {
        simOccupied.delete(`${snake.body[snake.body.length - 1].row},${snake.body[snake.body.length - 1].col}`);
      }
      simOccupied.add(key);
      const reachable = floodFillCount(nr, nc, simOccupied, gridRows, gridCols);
      candidates.push({ ...d, reachable });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.reachable - a.reachable);
  const best = candidates[0];
  const threshold = Math.max(1, best.reachable * 0.85);
  const top = candidates.filter(c => c.reachable >= threshold);
  const chosen = top[Math.floor(Math.random() * top.length)];
  return { row: head.row + chosen.dr, col: head.col + chosen.dc };
}

// ===== Food Replenishment (only when < 4 foods on grid) =====
function spawnFood(foodSet, foodSpawnSteps, currentStep, occupiedSet, permanentSet, eatenContribSet, basePermanentSet, recentlyEatenSet, gridRows, gridCols, maxFood) {
  // Only spawn when below max
  if (foodSet.size >= maxFood) return;

  // Build blocked set
  const blocked = new Set(occupiedSet);
  for (const key of permanentSet) blocked.add(key);
  for (const key of eatenContribSet) blocked.add(key);
  for (const key of foodSet) blocked.add(key);
  for (const [key] of recentlyEatenSet) blocked.add(key);

  // Only pick from original contribution cells that haven't been eaten
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
function runSimulation(basePermanentSet, options = {}) {
  const {
    totalSteps = 400,
    maxFood = 4,
    snakeStartRow = 3,
    snakeStartCol = 26,
    initialLength = 3,
    threshold = 20,
  } = options;

  const snake = new Snake(snakeStartRow, snakeStartCol, initialLength);
  const foodSet = new Set();
  const foodSpawnSteps = new Map();
  const permanentSet = new Set();
  const eatenContribSet = new Set();
  const recentlyEatenSet = new Map();
  const FOOD_COOLDOWN = 3;
  let cumulativeSteps = 0;
  const frames = [];

  // === INITIAL: ALL original contribution cells become food ===
  // (except cells occupied by the snake)
  const initOccupied = snake.getOccupiedSet();
  for (const key of basePermanentSet) {
    if (!initOccupied.has(key)) {
      foodSet.add(key);
      foodSpawnSteps.set(key, 0);
    }
  }
  console.log(`🍎 初始食物: ${foodSet.size} 个 (共 ${basePermanentSet.size} 个原始贡献格)`);

  frames.push(makeFrame(snake, foodSet, foodSpawnSteps, permanentSet, eatenContribSet, cumulativeSteps));

  for (let step = 1; step <= totalSteps; step++) {
    if (!snake.alive) break;

    // Tick cooldowns
    const expiredKeys = [];
    for (const [key, cd] of recentlyEatenSet) {
      if (cd <= 1) expiredKeys.push(key);
      else recentlyEatenSet.set(key, cd - 1);
    }
    for (const key of expiredKeys) recentlyEatenSet.delete(key);

    // Move
    let nextMove = bfsNextMove(snake, foodSet, permanentSet, rows, cols);
    if (!nextMove) nextMove = strategicSafeMove(snake, permanentSet, rows, cols);

    if (!nextMove) {
      snake.alive = false;
      frames.push(makeFrame(snake, foodSet, foodSpawnSteps, permanentSet, eatenContribSet, cumulativeSteps));
      break;
    }

    const moved = snake.move(nextMove.row, nextMove.col);
    cumulativeSteps++;

    if (!moved) {
      frames.push(makeFrame(snake, foodSet, foodSpawnSteps, permanentSet, eatenContribSet, cumulativeSteps));
      break;
    }

    // Eat food
    const headKey = `${snake.head.row},${snake.head.col}`;
    if (foodSet.has(headKey)) {
      foodSet.delete(headKey);
      foodSpawnSteps.delete(headKey);
      recentlyEatenSet.set(headKey, FOOD_COOLDOWN);
      // Mark this cell as eaten (clear the dot)
      eatenContribSet.add(headKey);

      if (cumulativeSteps >= threshold && basePermanentSet.has(headKey)) {
        // Phase 2: mark permanent + shrink
        permanentSet.add(headKey);
        snake.shrink(2);
      } else {
        // Phase 1 or non-contrib: just grow
        snake.grow(1);
      }
    }

    // Replenish food if below max (only from uneaten original contrib cells)
    const occupied = snake.getOccupiedSet();
    for (const key of permanentSet) occupied.add(key);
    for (const key of eatenContribSet) occupied.add(key);
    spawnFood(foodSet, foodSpawnSteps, step, occupied, permanentSet, eatenContribSet, basePermanentSet, recentlyEatenSet, rows, cols, maxFood);

    frames.push(makeFrame(snake, foodSet, foodSpawnSteps, permanentSet, eatenContribSet, cumulativeSteps));

    while (snake.body.length > snake.targetLength) snake.body.pop();
  }

  // Save frames to JSON for shared use between SVG and GIF
  const simData = {
    basePermanentSet: [...basePermanentSet],
    frames: frames.map(f => ({
      snakeBody: f.snakeBody,
      snakeDirection: f.snakeDirection,
      snakeAlive: f.snakeAlive,
      foodSet: [...f.foodSet],
      foodSpawnSteps: [...f.foodSpawnSteps],
      permanentSet: [...f.permanentSet],
      eatenContribSet: [...f.eatenContribSet],
      cumulativeSteps: f.cumulativeSteps,
    })),
    cumulativeSteps,
  };
  fs.writeFileSync('simulation.json', JSON.stringify(simData));

  return { frames, finalPermanentSet: permanentSet, finalEatenSet: eatenContribSet, snake, foodSet, cumulativeSteps };
}

function makeFrame(snake, foodSet, foodSpawnSteps, permanentSet, eatenContribSet, cumulativeSteps) {
  return {
    snakeBody: snake.body.map(s => ({ row: s.row, col: s.col })),
    snakeDirection: { dr: snake.direction.dr, dc: snake.direction.dc },
    snakeAlive: snake.alive,
    foodSet: new Set(foodSet),
    foodSpawnSteps: new Map(foodSpawnSteps),
    permanentSet: new Set(permanentSet),
    eatenContribSet: new Set(eatenContribSet),
    cumulativeSteps,
  };
}

// ===== Load simulation from JSON =====
function loadSimulation(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  const basePermanentSet = new Set(data.basePermanentSet);
  const frames = data.frames.map(f => ({
    snakeBody: f.snakeBody,
    snakeDirection: f.snakeDirection,
    snakeAlive: f.snakeAlive,
    foodSet: new Set(f.foodSet),
    foodSpawnSteps: new Map(f.foodSpawnSteps),
    permanentSet: new Set(f.permanentSet),
    eatenContribSet: new Set(f.eatenContribSet),
    cumulativeSteps: f.cumulativeSteps,
  }));
  return { basePermanentSet, frames, cumulativeSteps: data.cumulativeSteps };
}

module.exports = {
  Snake, bfsNextMove, strategicSafeMove, floodFillCount,
  spawnFood, runSimulation, loadSimulation,
  ROWS: rows, COLS: cols,
};
