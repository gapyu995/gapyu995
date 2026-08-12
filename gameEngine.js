// gameEngine.js — Shared Snake game engine for GitHub contribution grid

const fs = require('fs');
const rows = 7, cols = 52;

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
    const prev = this.body[1];
    this.direction = { dr: nextRow - prev.row, dc: nextCol - prev.col };
    while (this.body.length > this.targetLength) this.body.pop();
    const h = this.head;
    for (let i = 1; i < this.body.length; i++) {
      if (this.body[i].row === h.row && this.body[i].col === h.col) { this.alive = false; return false; }
    }
    return true;
  }
  grow(n = 1) { this.targetLength += n; }
  shrink(n = 1) { this.targetLength = Math.max(3, this.targetLength - n); }
  getOccupiedSet() {
    const s = new Set();
    for (const seg of this.body) s.add(`${seg.row},${seg.col}`);
    return s;
  }
}

// ===== Directions =====
const DR = [-1, 1, 0, 0];
const DC = [0, 0, -1, 1];

// ===== "Safe area" heuristic — A* with safety check =====
function safeMove(snake, foodSet, permanentSet, eatenContribSet, gridRows, gridCols) {
  const head = snake.head;
  const headKey = `${head.row},${head.col}`;

  // Obstacles: own body (except tail), permanent marks
  const occupied = new Set();
  for (let i = 0; i < snake.body.length - 1; i++) occupied.add(`${snake.body[i].row},${snake.body[i].col}`);
  for (const k of permanentSet) occupied.add(k);

  // Immediate food check
  for (let d = 0; d < 4; d++) {
    const nr = head.row + DR[d], nc = head.col + DC[d];
    const k = `${nr},${nc}`;
    if (nr >= 0 && nr < gridRows && nc >= 0 && nc < gridCols && !occupied.has(k)) {
      if (foodSet.has(k)) return { row: nr, col: nc };
    }
  }

  // BFS to nearest food
  const visited = new Set(); visited.add(headKey);
  const queue = []; const F = [];

  for (let d = 0; d < 4; d++) {
    const nr = head.row + DR[d], nc = head.col + DC[d];
    const k = `${nr},${nc}`;
    if (nr >= 0 && nr < gridRows && nc >= 0 && nc < gridCols && !occupied.has(k)) {
      if (foodSet.has(k)) return { row: nr, col: nc };
      visited.add(k);
      queue.push({ r: nr, c: nc, firstR: nr, firstC: nc });
    }
  }

  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    for (let d = 0; d < 4; d++) {
      const nr = cur.r + DR[d], nc = cur.c + DC[d];
      const k = `${nr},${nc}`;
      if (nr >= 0 && nr < gridRows && nc >= 0 && nc < gridCols && !occupied.has(k) && !visited.has(k)) {
        if (foodSet.has(k)) {
          F.push({ firstR: cur.firstR, firstC: cur.firstC, steps: qi + 1 });
        }
        visited.add(k);
        queue.push({ r: nr, c: nc, firstR: cur.firstR, firstC: cur.firstC });
      }
    }
  }

  // If food found, pick the safest (most open-space) path
  if (F.length > 0) {
    F.sort((a, b) => a.steps - b.steps);
    // Among equal-distance paths, prefer the one toward more open space
    let best = F[0];
    let bestSpace = -1;
    for (const f of F) {
      if (f.steps > best.steps + 3) break; // only consider near-equal paths
      const simOcc = new Set(occupied);
      simOcc.add(`${f.firstR},${f.firstC}`);
      const space = countReachable(f.firstR, f.firstC, simOcc, gridRows, gridCols, 120);
      if (space > bestSpace) { bestSpace = space; best = f; }
    }
    return { row: best.firstR, col: best.firstC };
  }

  // No food reachable — avoid dead ends
  const isGrowing = snake.body.length < snake.targetLength;
  const fullOcc = new Set(occupied);
  for (const s of snake.body) fullOcc.add(`${s.row},${s.col}`);
  if (!isGrowing && snake.body.length > 1) {
    const tail = snake.body[snake.body.length - 1];
    fullOcc.delete(`${tail.row},${tail.col}`);
  }

  const cands = [];
  for (let d = 0; d < 4; d++) {
    const nr = head.row + DR[d], nc = head.col + DC[d];
    const k = `${nr},${nc}`;
    if (nr >= 0 && nr < gridRows && nc >= 0 && nc < gridCols && !fullOcc.has(k)) {
      const simOcc = new Set(fullOcc);
      simOcc.add(k);
      const space = countReachable(nr, nc, simOcc, gridRows, gridCols, 200);
      cands.push({ nr, nc, space });
    }
  }
  if (cands.length === 0) return null;
  cands.sort((a, b) => b.space - a.space);
  return { row: cands[0].nr, col: cands[0].nc };
}

function countReachable(sr, sc, obstacles, gr, gc, max = 200) {
  const v = new Set(); v.add(`${sr},${sc}`);
  const q = [{ r: sr, c: sc }]; let cnt = 0, qi = 0;
  while (qi < q.length && cnt < max) {
    const cur = q[qi++]; cnt++;
    for (let d = 0; d < 4; d++) {
      const nr = cur.r + DR[d], nc = cur.c + DC[d];
      const k = `${nr},${nc}`;
      if (nr >= 0 && nr < gr && nc >= 0 && nc < gc && !obstacles.has(k) && !v.has(k)) {
        v.add(k); q.push({ r: nr, c: nc });
      }
    }
  }
  return cnt;
}

// ===== Food replenish — every FOOD_CHECK_INTERVAL steps, FIFO by eaten time =====
const FOOD_CHECK_INTERVAL = 5; // ~ every 5 steps check if food < 4
function replenishFood(foodSet, foodSpawnSteps, eatenOrder, currentStep, occupiedSet, permanentSet, basePermanentSet, recentlyEatenSet, maxFood) {
  if (foodSet.size >= maxFood) return;

  // blocked = snake body + permanent marks + existing food + cooldown cells
  // Eaten (but not permanent) cells ARE allowed to regrow
  const blocked = new Set(occupiedSet);
  for (const k of permanentSet) blocked.add(k);
  for (const k of foodSet) blocked.add(k);
  for (const [k] of recentlyEatenSet) blocked.add(k);

  // FIFO by eat time: oldest eaten cells regrow first
  for (const key of eatenOrder) {
    if (foodSet.size >= maxFood) break;
    if (blocked.has(key)) continue;          // occupied or permanent or on cooldown
    if (!basePermanentSet.has(key)) continue; // must be an original contrib cell
    const [r, c] = key.split(',').map(Number);
    foodSet.add(key);
    foodSpawnSteps.set(key, currentStep);
  }
}

// ===== Simulation =====
function runSimulation(basePermanentSet, options = {}) {
  const {
    totalSteps = 400, maxFood = 4,
    snakeStartRow = 3, snakeStartCol = 26,
    initialLength = 3, threshold = 20,
  } = options;

  const snake = new Snake(snakeStartRow, snakeStartCol, initialLength);
  const foodSet = new Set();
  const foodSpawnSteps = new Map();
  const permanentSet = new Set();
  const eatenContribSet = new Set();
  const eatenOrder = []; // FIFO: oldest eaten first
  const recentlyEatenSet = new Map();
  const FOOD_COOLDOWN = 3;
  let cumulativeSteps = 0;
  let lastDropStep = 0;
  const frames = [];

  // All original contrib cells = food initially
  const initOcc = snake.getOccupiedSet();
  for (const key of basePermanentSet) {
    if (!initOcc.has(key)) { foodSet.add(key); foodSpawnSteps.set(key, 0); }
  }
  console.log(`🍎 初始食物: ${foodSet.size} 个`);

  frames.push(makeFrame(snake, foodSet, foodSpawnSteps, permanentSet, eatenContribSet, cumulativeSteps));

  for (let step = 1; step <= totalSteps; step++) {
    if (!snake.alive) break;

    // Cooldown tick
    for (const [k, cd] of recentlyEatenSet) {
      if (cd <= 1) recentlyEatenSet.delete(k);
      else recentlyEatenSet.set(k, cd - 1);
    }

    // Move
    let next = safeMove(snake, foodSet, permanentSet, eatenContribSet, rows, cols);
    if (!next) {
      snake.alive = false;
      frames.push(makeFrame(snake, foodSet, foodSpawnSteps, permanentSet, eatenContribSet, cumulativeSteps));
      break;
    }

    const ok = snake.move(next.row, next.col);
    cumulativeSteps++;
    if (!ok) {
      frames.push(makeFrame(snake, foodSet, foodSpawnSteps, permanentSet, eatenContribSet, cumulativeSteps));
      break;
    }

    // Eat
    const headKey = `${snake.head.row},${snake.head.col}`;
    if (foodSet.has(headKey)) {
      foodSet.delete(headKey);
      foodSpawnSteps.delete(headKey);
      recentlyEatenSet.set(headKey, FOOD_COOLDOWN);
      eatenContribSet.add(headKey);
      eatenOrder.push(headKey); // record eat time (end = most recent)
      snake.grow(1);
    }

    // 20-step drop
    if (cumulativeSteps - lastDropStep >= threshold) {
      if (eatenContribSet.has(headKey) && !foodSet.has(headKey) && !permanentSet.has(headKey)) {
        permanentSet.add(headKey);
        snake.shrink(1);
        lastDropStep = cumulativeSteps;
      }
    }

    // Replenish: check every FOOD_CHECK_INTERVAL steps, oldest eaten first
    if (step % FOOD_CHECK_INTERVAL === 0) {
      const occ = snake.getOccupiedSet();
      for (const k of permanentSet) occ.add(k);
      for (const k of eatenContribSet) occ.add(k);
      replenishFood(foodSet, foodSpawnSteps, eatenOrder, step, occ, permanentSet, basePermanentSet, recentlyEatenSet, maxFood);
    }

    frames.push(makeFrame(snake, foodSet, foodSpawnSteps, permanentSet, eatenContribSet, cumulativeSteps));
    while (snake.body.length > snake.targetLength) snake.body.pop();
  }

  // Save simulation
  const simData = {
    basePermanentSet: [...basePermanentSet],
    frames: frames.map(f => ({
      snakeBody: f.snakeBody, snakeDirection: f.snakeDirection, snakeAlive: f.snakeAlive,
      foodSet: [...f.foodSet], foodSpawnSteps: [...f.foodSpawnSteps],
      permanentSet: [...f.permanentSet], eatenContribSet: [...f.eatenContribSet],
      cumulativeSteps: f.cumulativeSteps,
    })),
    cumulativeSteps,
  };
  fs.writeFileSync('simulation.json', JSON.stringify(simData));

  // Log
  console.log(`📊 ${frames.length} 帧, ${cumulativeSteps} 步, 永久:${permanentSet.size} 吃:${eatenContribSet.size}`);
  return { frames, finalPermanentSet: permanentSet, finalEatenSet: eatenContribSet, snake, foodSet, cumulativeSteps };
}

function makeFrame(snake, foodSet, fss, permSet, eatenSet, steps) {
  return {
    snakeBody: snake.body.map(s => ({ row: s.row, col: s.col })),
    snakeDirection: { dr: snake.direction.dr, dc: snake.direction.dc },
    snakeAlive: snake.alive,
    foodSet: new Set(foodSet), foodSpawnSteps: new Map(fss),
    permanentSet: new Set(permSet), eatenContribSet: new Set(eatenSet),
    cumulativeSteps: steps,
  };
}

function loadSimulation(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const bps = new Set(data.basePermanentSet);
  const frames = data.frames.map(f => ({
    snakeBody: f.snakeBody, snakeDirection: f.snakeDirection, snakeAlive: f.snakeAlive,
    foodSet: new Set(f.foodSet), foodSpawnSteps: new Map(f.foodSpawnSteps),
    permanentSet: new Set(f.permanentSet), eatenContribSet: new Set(f.eatenContribSet),
    cumulativeSteps: f.cumulativeSteps,
  }));
  return { basePermanentSet: bps, frames, cumulativeSteps: data.cumulativeSteps };
}

module.exports = { Snake, safeMove, countReachable, replenishFood, runSimulation, loadSimulation, ROWS: rows, COLS: cols };
