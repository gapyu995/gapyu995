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
function snakeNextMove(snake, foodSet, permanentSet, eatCounts, gridRows, gridCols) {
  const head = snake.head;
  const headKey = `${head.row},${head.col}`;

  const occupied = new Set();
  for (let i = 0; i < snake.body.length - 1; i++) occupied.add(`${snake.body[i].row},${snake.body[i].col}`);
  for (const k of permanentSet) occupied.add(k);

  // Immediate food check
  for (let d = 0; d < 4; d++) {
    const nr = head.row + DR[d], nc = head.col + DC[d];
    const k = `${nr},${nc}`;
    if (nr >= 0 && nr < gridRows && nc >= 0 && nc < gridCols && !occupied.has(k) && foodSet.has(k)) {
      return { row: nr, col: nc };
    }
  }

  // BFS to find ALL reachable foods with distances
  const visited = new Set(); visited.add(headKey);
  const queue = [];
  const foodTargets = []; // { key, firstR, firstC, dist }

  for (let d = 0; d < 4; d++) {
    const nr = head.row + DR[d], nc = head.col + DC[d];
    const k = `${nr},${nc}`;
    if (nr >= 0 && nr < gridRows && nc >= 0 && nc < gridCols && !occupied.has(k)) {
      if (foodSet.has(k)) foodTargets.push({ key: k, firstR: nr, firstC: nc, dist: 1 });
      visited.add(k);
      queue.push({ r: nr, c: nc, firstR: nr, firstC: nc, dist: 1 });
    }
  }

  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    for (let d = 0; d < 4; d++) {
      const nr = cur.r + DR[d], nc = cur.c + DC[d];
      const k = `${nr},${nc}`;
      if (nr >= 0 && nr < gridRows && nc >= 0 && nc < gridCols && !occupied.has(k) && !visited.has(k)) {
        if (foodSet.has(k)) foodTargets.push({ key: k, firstR: cur.firstR, firstC: cur.firstC, dist: cur.dist + 1 });
        visited.add(k);
        queue.push({ r: nr, c: nc, firstR: cur.firstR, firstC: cur.firstC, dist: cur.dist + 1 });
      }
    }
  }

  if (foodTargets.length > 0) {
    // Score each food: prefer low eatCount (under-explored), tiebreak by path safety
    let best = foodTargets[0];
    let bestScore = -Infinity;
    for (const ft of foodTargets) {
      const ec = eatCounts.get(ft.key) || 0;
      const simOcc = new Set(occupied);
      simOcc.add(`${ft.firstR},${ft.firstC}`);
      const space = countReachable(ft.firstR, ft.firstC, simOcc, gridRows, gridCols, 150);
      // High score = under-explored + safe path
      const score = (100 - ec * 30) + space;
      if (score > bestScore) { bestScore = score; best = ft; }
    }
    return { row: best.firstR, col: best.firstC };
  }

  // No food reachable: pick safest open direction
  const isGrowing = snake.body.length < snake.targetLength;
  const fullOcc = new Set(occupied);
  for (const s of snake.body) fullOcc.add(`${s.row},${s.col}`);
  if (!isGrowing && snake.body.length > 1) {
    fullOcc.delete(`${snake.body[snake.body.length - 1].row},${snake.body[snake.body.length - 1].col}`);
  }

  const cands = [];
  for (let d = 0; d < 4; d++) {
    const nr = head.row + DR[d], nc = head.col + DC[d];
    const k = `${nr},${nc}`;
    if (nr >= 0 && nr < gridRows && nc >= 0 && nc < gridCols && !fullOcc.has(k)) {
      const simOcc = new Set(fullOcc); simOcc.add(k);
      cands.push({ nr, nc, space: countReachable(nr, nc, simOcc, gridRows, gridCols, 200) });
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

// ===== Food replenish — every FOOD_CHECK_INTERVAL steps =====
const FOOD_CHECK_INTERVAL = 5;
function replenishFood(foodSet, foodSpawnSteps, eatCounts, currentStep, occupiedSet, permanentSet, basePermanentSet, recentlyEatenSet, maxFood) {
  if (foodSet.size >= maxFood) return;

  // blocked = snake body + permanent marks + existing food + cooldown cells
  const blocked = new Set(occupiedSet);
  for (const k of permanentSet) blocked.add(k);
  for (const k of foodSet) blocked.add(k);
  for (const [k] of recentlyEatenSet) blocked.add(k);

  // Pick from basePermanentSet: prioritize cells eaten the LEAST times
  // (eatCounts tracks how many times each cell has been eaten)
  // Then break ties by age (cells not eaten recently → eatCounts was set earlier)
  const candidates = [];
  for (const key of basePermanentSet) {
    if (blocked.has(key)) continue;
    if (permanentSet.has(key)) continue;
    const cnt = eatCounts.get(key) || 0;
    candidates.push({ key, cnt });
  }
  // Sort: fewest eats first → they've been waiting longest
  candidates.sort((a, b) => a.cnt - b.cnt);

  for (const c of candidates) {
    if (foodSet.size >= maxFood) break;
    const [r, cc] = c.key.split(',').map(Number);
    foodSet.add(c.key);
    foodSpawnSteps.set(c.key, currentStep);
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
  const eatCounts = new Map(); // key → times eaten
  const recentlyEatenSet = new Map();
  const FOOD_COOLDOWN = 3;
  let cumulativeSteps = 0;
  let lastDropStep = 0;
  const frames = [];

  // All original contrib cells = food initially
  const initOcc = snake.getOccupiedSet();
  for (const key of basePermanentSet) {
    if (!initOcc.has(key)) { foodSet.add(key); foodSpawnSteps.set(key, 0); }
    eatCounts.set(key, 0);
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
    let next = snakeNextMove(snake, foodSet, permanentSet, eatCounts, rows, cols);
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
      eatCounts.set(headKey, (eatCounts.get(headKey) || 0) + 1);
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

    // Replenish: check every N steps, least-eaten cells regrow first (= one-by-one feel)
    if (step % FOOD_CHECK_INTERVAL === 0) {
      const occ = snake.getOccupiedSet();
      for (const k of permanentSet) occ.add(k);
      for (const k of eatenContribSet) occ.add(k);
      replenishFood(foodSet, foodSpawnSteps, eatCounts, step, occ, permanentSet, basePermanentSet, recentlyEatenSet, maxFood);
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

module.exports = { Snake, snakeNextMove, countReachable, replenishFood, runSimulation, loadSimulation, ROWS: rows, COLS: cols };
