// generateGif.js — 霓虹贪吃蛇 GIF 动画（从 simulation.json 加载）
const fs = require('fs');
const Jimp = require('jimp');
const GIFEncoder = require('gif-encoder-2');
const { runSimulation, loadSimulation, ROWS, COLS } = require('./gameEngine');

// ===== 1. 读取贡献数据 =====
let rawData;
try { rawData = fs.readFileSync('contributions.json', 'utf8'); } catch (err) { rawData = null; }

let colorMap = Array.from({ length: ROWS }, () => Array(COLS).fill('#ebedf0'));
const basePermanentSet = new Set();

if (rawData) {
  const data = JSON.parse(rawData);
  const userData = data.data || data;
  const weeks = userData.user.contributionsCollection.contributionCalendar.weeks;
  weeks.forEach((week, weekIndex) => {
    week.contributionDays.forEach((day, dayIndex) => {
      const col = weekIndex, row = dayIndex;
      if (row < ROWS && col < COLS) {
        colorMap[row][col] = day.color || '#ebedf0';
        if (day.contributionCount > 0) basePermanentSet.add(`${row},${col}`);
      }
    });
  });
}

// ===== 2. 运行或加载模拟 =====
let frames;
const simFile = 'simulation.json';

if (fs.existsSync(simFile)) {
  console.log('📂 从 simulation.json 加载模拟...');
  frames = loadSimulation(simFile).frames;
} else {
  console.log('🐍 运行新模拟...');
  frames = runSimulation(basePermanentSet, {
    maxFood: 4, snakeStartRow: 3, snakeStartCol: 26,
    initialLength: 3, threshold: 20, totalSteps: 200,
  }).frames;
}

console.log(`✅ ${frames.length} 帧`);

// ===== 3. GIF 参数 =====
const cellSize = 12;
const gap = 2;
const totalSpan = cellSize + gap;
const pad = { t: 16, b: 12, l: 4, r: 4 };
const width = COLS * totalSpan + gap + pad.l + pad.r;
const height = ROWS * totalSpan + gap + pad.t + pad.b;

function cellC(r, c) { return { x: c * totalSpan + gap + pad.l + cellSize / 2, y: r * totalSpan + gap + pad.t + cellSize / 2 }; }
function cellTL(r, c) { return { x: c * totalSpan + gap + pad.l, y: r * totalSpan + gap + pad.t }; }

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

function drawRect(img, x, y, w, h, rgba) {
  const c = Jimp.rgbaToInt(...rgba);
  for (let py = Math.max(0, Math.round(y)); py < Math.min(img.bitmap.height, Math.round(y + h)); py++)
    for (let px = Math.max(0, Math.round(x)); px < Math.min(img.bitmap.width, Math.round(x + w)); px++)
      img.setPixelColor(c, px, py);
}

function drawCircle(img, cx, cy, r, rgba) {
  const c = Jimp.rgbaToInt(...rgba);
  const r2 = r * r;
  for (let py = Math.max(0, Math.round(cy - r)); py < Math.min(img.bitmap.height, Math.round(cy + r)); py++)
    for (let px = Math.max(0, Math.round(cx - r)); px < Math.min(img.bitmap.width, Math.round(cx + r)); px++)
      if ((px - cx) ** 2 + (py - cy) ** 2 <= r2) img.setPixelColor(c, px, py);
}

// ===== 4. 渲染 =====
const encoder = new GIFEncoder(width, height, 'neuquant', true);
encoder.setDelay(120);
encoder.setRepeat(0);
encoder.start();

(async () => {
  for (let idx = 0; idx < frames.length; idx++) {
    const frame = frames[idx];
    const img = await Jimp.create(width, height, Jimp.rgbaToInt(10, 10, 10, 255));

    const sbSet = new Set(frame.snakeBody.map(s => `${s.row},${s.col}`));
    const permSet = frame.permanentSet;
    const eatenSet = frame.eatenContribSet;

    // Grid
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const { x, y } = cellTL(r, c);
        const key = `${r},${c}`;
        if (permSet.has(key)) {
          drawRect(img, x, y, cellSize, cellSize, [48, 161, 78, 255]);
          drawRect(img, x + 1, y + 1, cellSize - 2, 2, [255, 255, 255, 60]);
        } else if (sbSet.has(key)) {
          drawRect(img, x, y, cellSize, cellSize, [22, 27, 34, 255]);
        } else if (eatenSet.has(key)) {
          drawRect(img, x, y, cellSize, cellSize, [13, 13, 13, 255]);
        } else if (basePermanentSet.has(key)) {
          drawRect(img, x, y, cellSize, cellSize, [48, 161, 78, 180]);
        } else {
          drawRect(img, x, y, cellSize, cellSize, [20, 22, 27, 255]);
        }
      }
    }

    // Snake body
    const body = frame.snakeBody;
    const dir = frame.snakeDirection;
    const segR = cellSize * 0.38;

    for (let i = 0; i < body.length - 1; i++) {
      const { x: cx, y: cy } = cellC(body[i].row, body[i].col);
      const t = body.length > 1 ? i / (body.length - 1) : 0;
      const s = segR * (0.55 + 0.45 * t);
      drawCircle(img, cx, cy, s, [50, lerp(225, 255, t), lerp(30, 60, t), 255]);
      drawCircle(img, cx - s * 0.1, cy - s * 0.15, s * 0.25, [255, 255, 255, Math.round(25 + t * 40)]);
    }

    // Head
    if (body.length > 0) {
      const h = body[0];
      const { x: hx, y: hy } = cellC(h.row, h.col);
      const hR = segR * 1.15;
      drawCircle(img, hx, hy, hR + 1, [0, 255, 136, 60]);
      drawCircle(img, hx, hy, hR, [0, 255, 136, 255]);
      drawCircle(img, hx - hR * 0.15, hy - hR * 0.2, hR * 0.22, [255, 255, 255, 80]);

      const angle = Math.atan2(dir.dr, dir.dc);
      const ed = hR * 0.18, eo = hR * 0.15, er = hR * 0.15;
      const e1x = hx + ed * Math.cos(angle) - eo * Math.sin(angle);
      const e1y = hy + ed * Math.sin(angle) + eo * Math.cos(angle);
      const e2x = hx + ed * Math.cos(angle) + eo * Math.sin(angle);
      const e2y = hy + ed * Math.sin(angle) - eo * Math.cos(angle);

      drawCircle(img, e1x, e1y, er, [255, 255, 255, 240]);
      drawCircle(img, e2x, e2y, er, [255, 255, 255, 240]);
      const po = er * 0.3;
      drawCircle(img, e1x + po * Math.cos(angle), e1y + po * Math.sin(angle), er * 0.5, [13, 17, 23, 255]);
      drawCircle(img, e2x + po * Math.cos(angle), e2y + po * Math.sin(angle), er * 0.5, [13, 17, 23, 255]);
    }

    // Food
    const cs = frame.cumulativeSteps;
    const fss = frame.foodSpawnSteps || new Map();
    for (const key of frame.foodSet) {
      const [fr, fc] = key.split(',').map(Number);
      const { x: fx, y: fy } = cellC(fr, fc);
      const age = cs - (fss.get(key) || cs);
      const sc = Math.min(1, age / 3);
      const fR = 3 * sc;
      drawCircle(img, fx, fy, 4 * sc, [255, 180, 50, Math.round(40 * sc)]);
      if (fR > 0) {
        drawCircle(img, fx, fy, fR, [253, 203, 110, 255]);
        drawCircle(img, fx - 1, fy - 1, Math.max(0.5, sc), [255, 255, 255, Math.round(180 * sc)]);
      }
    }

    encoder.addFrame(img.bitmap.data);
    if ((idx + 1) % 30 === 0) console.log(`✅ 帧 ${idx + 1}/${frames.length}`);
  }

  encoder.finish();
  fs.writeFileSync('snake-contribution.gif', encoder.out.getData());
  console.log('✅ snake-contribution.gif 已生成');
})();
