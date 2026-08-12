// generateGif.js - Neon Snake on GitHub Contribution Grid (GIF animation)
const fs = require('fs');
const Jimp = require('jimp');
const GIFEncoder = require('gif-encoder-2');
const { runSimulation, ROWS, COLS } = require('./gameEngine');

// ===== 1. Read contribution data =====
let rawData;
try {
  rawData = fs.readFileSync('contributions.json', 'utf8');
} catch (err) {
  rawData = null;
}

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
        if (day.contributionCount > 0) {
          basePermanentSet.add(`${row},${col}`);
        }
      }
    });
  });
}

// ===== 2. Run simulation (fewer steps for manageable GIF) =====
console.log('🐍 Running snake simulation for GIF...');
const { frames } = runSimulation(basePermanentSet, {
  maxFood: 4,
  spawnProb: 0.3,
  snakeStartRow: 3,
  snakeStartCol: 26,
  initialLength: 3,
  threshold: 20,
  totalSteps: 200,
});

console.log(`✅ ${frames.length} frames recorded`);

// ===== 3. Identify snake-added cells per frame =====
// We need to compute this per-frame (cumulative). We can rebuild it by tracking
// permanentSet over time. Let the engine have already captured it per frame.
// For simplicity: we compute snakeAdded per frame using the final base set diff
// Actually frame.permanentSet already tracks all permanents including originals.
// Let's compute: snakeAddedSet = frame.permanentSet - basePermanentSet

// ===== 4. GIF dimensions =====
const cellSize = 12;
const gap = 2;
const totalCellSpan = cellSize + gap; // 14
const padding = { top: 18, bottom: 12, left: 4, right: 4 };
const width = COLS * totalCellSpan + gap + padding.left + padding.right;
const height = ROWS * totalCellSpan + gap + padding.top + padding.bottom;

// ===== 5. Helper: hex to RGB array =====
function hexToRgb(hex) {
  if (!hex || hex === '#ebedf0') return [235, 237, 240];
  let c = hex.substring(1);
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  return [
    parseInt(c.substring(0, 2), 16),
    parseInt(c.substring(2, 4), 16),
    parseInt(c.substring(4, 6), 16),
  ];
}

// ===== 6. Jimp helper functions =====
function cellTopLeft(row, col) {
  return {
    x: col * totalCellSpan + gap + padding.left,
    y: row * totalCellSpan + gap + padding.top,
  };
}

function cellCenter(row, col) {
  const tl = cellTopLeft(row, col);
  return { x: tl.x + cellSize / 2, y: tl.y + cellSize / 2 };
}

function drawRect(image, x, y, w, h, rgbaColor) {
  const [r, g, b, a] = rgbaColor;
  const color = Jimp.rgbaToInt(r, g, b, a);
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(image.bitmap.width - 1, Math.round(x + w));
  const y1 = Math.min(image.bitmap.height - 1, Math.round(y + h));
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      image.setPixelColor(color, px, py);
    }
  }
}

function drawCircle(image, cx, cy, radius, rgbaColor) {
  const [r, g, b, a] = rgbaColor;
  const color = Jimp.rgbaToInt(r, g, b, a);
  const x0 = Math.max(0, Math.round(cx - radius));
  const y0 = Math.max(0, Math.round(cy - radius));
  const x1 = Math.min(image.bitmap.width - 1, Math.round(cx + radius));
  const y1 = Math.min(image.bitmap.height - 1, Math.round(cy + radius));
  const r2 = radius * radius;
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dx = px - cx, dy = py - cy;
      if (dx * dx + dy * dy <= r2) {
        image.setPixelColor(color, px, py);
      }
    }
  }
}

function blendOver(dst, src) {
  // dst and src are [r,g,b,a] 0-255
  const srcA = src[3] / 255;
  const dstA = dst[3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA === 0) return [0, 0, 0, 0];
  const outR = (src[0] * srcA + dst[0] * dstA * (1 - srcA)) / outA;
  const outG = (src[1] * srcA + dst[1] * dstA * (1 - srcA)) / outA;
  const outB = (src[2] * srcA + dst[2] * dstA * (1 - srcA)) / outA;
  return [Math.round(outR), Math.round(outG), Math.round(outB), Math.round(outA * 255)];
}

function getPixel(image, x, y) {
  const idx = (y * image.bitmap.width + x) * 4;
  if (idx < 0 || idx >= image.bitmap.data.length - 3) return [0, 0, 0, 0];
  return [
    image.bitmap.data[idx],
    image.bitmap.data[idx + 1],
    image.bitmap.data[idx + 2],
    image.bitmap.data[idx + 3],
  ];
}

function setPixelAlpha(image, x, y, rgbaColor) {
  if (x < 0 || x >= image.bitmap.width || y < 0 || y >= image.bitmap.height) return;
  const existing = getPixel(image, x, y);
  const blended = blendOver(existing, rgbaColor);
  image.setPixelColor(Jimp.rgbaToInt(blended[0], blended[1], blended[2], blended[3]), x, y);
}

function drawGlowCircle(image, cx, cy, maxRadius, rgbaColor) {
  // Draw concentric semi-transparent circles for a glow effect
  const [r, g, b, baseA] = rgbaColor;
  const steps = maxRadius * 2;
  for (let i = 0; i < steps; i++) {
    const rad = maxRadius * (i / steps);
    const alpha = Math.round(baseA * (1 - i / steps) * 0.5);
    if (alpha <= 0) continue;
    const glowColor = [r, g, b, alpha];
    const x0 = Math.max(0, Math.round(cx - rad));
    const y0 = Math.max(0, Math.round(cy - rad));
    const x1 = Math.min(image.bitmap.width - 1, Math.round(cx + rad));
    const y1 = Math.min(image.bitmap.height - 1, Math.round(cy + rad));
    const r2 = rad * rad;
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = px - cx, dy = py - cy;
        if (dx * dx + dy * dy <= r2) {
          setPixelAlpha(image, px, py, glowColor);
        }
      }
    }
  }
}

// ===== 7. Create GIF encoder =====
const encoder = new GIFEncoder(width, height, 'neuquant', true);
encoder.setDelay(120);
encoder.setRepeat(0);
encoder.start();

// ===== 8. Render each frame =====
(async () => {
  for (let idx = 0; idx < frames.length; idx++) {
    const frame = frames[idx];
    const image = await Jimp.create(width, height, Jimp.rgbaToInt(10, 10, 10, 255));

    // ----- Compute per-frame occupancy -----
    const snakeBodySet = new Set();
    for (const s of frame.snakeBody) {
      snakeBodySet.add(`${s.row},${s.col}`);
    }

    const snakeAddedCells = new Set();
    for (const key of frame.permanentSet) {
      if (!basePermanentSet.has(key)) {
        snakeAddedCells.add(key);
      }
    }

    // ----- Draw grid cells -----
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const { x, y } = cellTopLeft(r, c);
        const color = colorMap[r][c];
        const cellKey = `${r},${c}`;
        const isSnakeCell = snakeBodySet.has(cellKey);
        const isSnakeAdded = snakeAddedCells.has(cellKey);
        const isOriginalContrib = basePermanentSet.has(cellKey);

        let opacity = 0.75;
        if (color === '#ebedf0') opacity = 0.18;
        if (isSnakeCell) opacity = 0.10;

        const [cr, cg, cb] = hexToRgb(color);
        const alpha = Math.round(opacity * 255);
        drawRect(image, x, y, cellSize, cellSize, [cr, cg, cb, alpha]);

        // Highlight
        if (opacity > 0.2) {
          const hl = [255, 255, 255, Math.round(80 * opacity)];
          for (let dx = 2; dx < cellSize - 2; dx++) {
            setPixelAlpha(image, x + dx, y + 1, hl);
          }
        }

        // Snake-added permanent: neon green border glow
        if (isSnakeAdded && !isSnakeCell) {
          // Top and bottom borders
          const neon = [57, 255, 20, 160];
          for (let dx = 0; dx < cellSize; dx++) {
            setPixelAlpha(image, x + dx, y, neon);
            setPixelAlpha(image, x + dx, y + cellSize - 1, neon);
          }
          // Left and right borders
          for (let dy = 0; dy < cellSize; dy++) {
            setPixelAlpha(image, x, y + dy, neon);
            setPixelAlpha(image, x + cellSize - 1, y + dy, neon);
          }
          // Center dot
          drawCircle(image, x + cellSize / 2, y + cellSize / 2, 1.5, [57, 255, 20, 180]);
        }
      }
    }

    // ----- Draw food dots (with spawn animation) -----
    const currentStep = frame.cumulativeSteps;
    const foodSpawnSteps = frame.foodSpawnSteps || new Map();
    for (const key of frame.foodSet) {
      const [r, c] = key.split(',').map(Number);
      const { x, y } = cellCenter(r, c);
      const spawnStep = foodSpawnSteps.get(key) || currentStep;
      const age = currentStep - spawnStep;
      const scale = Math.min(1, age / 3);
      const foodR = Math.round(3 * scale);

      drawGlowCircle(image, x, y, 4 * scale, [255, 215, 0, Math.round(140 * scale)]);
      if (foodR > 0) {
        drawCircle(image, x, y, foodR, [255, 215, 0, 255]);
        drawCircle(image, x - 1, y - 1, Math.max(0.5, scale), [255, 255, 255, Math.round(180 * scale)]);
      }
    }

    // ----- Draw snake body WITH glow -----
    const body = frame.snakeBody;
    const bodyLen = body.length;

    // Glow pass: draw larger glow circles behind each segment
    for (let i = 0; i < bodyLen; i++) {
      const seg = body[i];
      const { x, y } = cellCenter(seg.row, seg.col);
      const t = bodyLen <= 1 ? 0 : i / (bodyLen - 1);
      const neonR = 57, neonG = Math.round(255 - t * 30), neonB = 20;
      drawGlowCircle(image, x, y, 7, [neonR, neonG, neonB, 140]);
    }

    // Connector pass: draw narrow rectangles between adjacent segments
    for (let i = 0; i < bodyLen - 1; i++) {
      const seg = body[i], next = body[i + 1];
      const { x: x1, y: y1 } = cellCenter(seg.row, seg.col);
      const { x: x2, y: y2 } = cellCenter(next.row, next.col);
      const dRow = Math.abs(seg.row - next.row);
      const dCol = Math.abs(seg.col - next.col);
      if (dRow + dCol !== 1) continue;

      // Uniform neon green — no darkening toward tail
      const t = bodyLen <= 1 ? 0 : i / (bodyLen - 1);
      const r = 50, g = Math.round(255 - t * 30), b = 30;

      if (dCol === 1) {
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const midY = Math.round((y1 + y2) / 2);
        drawRect(image, minX, midY - 2, maxX - minX, 4, [r, g, b, 220]);
      } else {
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        const midX = Math.round((x1 + x2) / 2);
        drawRect(image, midX - 2, minY, 4, maxY - minY, [r, g, b, 220]);
      }
    }

    // Segment bodies
    for (let i = 0; i < bodyLen; i++) {
      const seg = body[i];
      const { x, y } = cellCenter(seg.row, seg.col);
      const t = bodyLen <= 1 ? 0 : i / (bodyLen - 1);
      const segSize = Math.round(10 - t * 3);
      const half = segSize / 2;

      const r = 50;
      const g = Math.round(255 - t * 30);
      const b = Math.round(30 + t * 30);

      // Body segment with color
      drawCircle(image, x, y, half, [r, g, b, 240]);

      // Highlight
      if (segSize >= 4) {
        const hlSize = half * 0.4;
        drawCircle(image, x - 1, y - 1.5, hlSize, [255, 255, 255, 80]);
      }

      // Head-specific details
      if (i === 0) {
        const dir = frame.snakeDirection;
        // Eyes
        const perpDR = -dir.dc, perpDC = dir.dr;
        const eyeForward = 2, eyeLateral = 2.5;
        const eye1X = Math.round(x + dir.dc * eyeForward + perpDR * eyeLateral);
        const eye1Y = Math.round(y + dir.dr * eyeForward + perpDC * eyeLateral);
        const eye2X = Math.round(x + dir.dc * eyeForward - perpDR * eyeLateral);
        const eye2Y = Math.round(y + dir.dr * eyeForward - perpDC * eyeLateral);

        drawCircle(image, eye1X, eye1Y, 2, [255, 255, 255, 255]);
        drawCircle(image, eye2X, eye2Y, 2, [255, 255, 255, 255]);
        drawCircle(image, Math.round(eye1X + dir.dc * 0.5), Math.round(eye1Y + dir.dr * 0.5), 1, [0, 0, 0, 255]);
        drawCircle(image, Math.round(eye2X + dir.dc * 0.5), Math.round(eye2Y + dir.dr * 0.5), 1, [0, 0, 0, 255]);
      }
    }

    // ----- Add frame to encoder -----
    encoder.addFrame(image.bitmap.data);
    console.log(`✅ Rendered frame ${idx + 1}/${frames.length}`);
  }

  // ----- Finish and write -----
  encoder.finish();
  const buffer = encoder.out.getData();
  fs.writeFileSync('snake-contribution.gif', buffer);
  console.log('✅ GIF generated: snake-contribution.gif');
  console.log(`📂 Total frames: ${frames.length}, Size: ${(buffer.length / 1024).toFixed(1)} KB`);
})();
