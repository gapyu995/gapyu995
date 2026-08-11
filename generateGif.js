// generateGif.js (纯 JS 版，无需 canvas)
const fs = require('fs');
const Jimp = require('jimp');
const GIFEncoder = require('gif-encoder-2');

// ===== 1. 读取贡献数据 =====
let rawData = fs.readFileSync('contributions.json', 'utf8');
let data = JSON.parse(rawData);
const userData = data.data || data;
const weeks = userData.user.contributionsCollection.contributionCalendar.weeks;

const rows = 7, cols = 52;
let map = Array.from({ length: rows }, () => Array(cols).fill(0));
let colorMap = Array.from({ length: rows }, () => Array(cols).fill('#ebedf0'));

weeks.forEach((week, weekIndex) => {
  week.contributionDays.forEach((day, dayIndex) => {
    const col = weekIndex, row = dayIndex;
    if (row < rows && col < cols) {
      const count = day.contributionCount;
      map[row][col] = count > 0 ? 1 : 0;
      colorMap[row][col] = day.color || '#ebedf0';
    }
  });
});

// ===== 2. 游戏类 =====
class PacMan {
  constructor() { this.row = 3; this.col = 26; }
  findNextMove(map) {
    for (let c = 0; c < cols; c++) if (map[this.row][c] === 1) return { row: this.row, col: c };
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (map[r][c] === 1) return { row: r, col: c };
    return { row: this.row, col: this.col };
  }
  move(map) {
    const next = this.findNextMove(map);
    if (map[next.row][next.col] === 1) map[next.row][next.col] = 0;
    this.row = next.row; this.col = next.col;
  }
}
class Ghost {
  constructor(name, startRow, startCol, color) {
    this.name = name; this.row = startRow; this.col = startCol; this.color = color;
  }
  chase(pacman) {
    const rowDiff = pacman.row - this.row, colDiff = pacman.col - this.col;
    if (Math.abs(rowDiff) >= Math.abs(colDiff)) {
      const newRow = this.row + Math.sign(rowDiff);
      if (newRow >= 0 && newRow < rows) { this.row = newRow; return; }
    } else {
      const newCol = this.col + Math.sign(colDiff);
      if (newCol >= 0 && newCol < cols) { this.col = newCol; return; }
    }
    this.randomMove();
  }
  randomMove() {
    const dirs = [{ row: -1, col: 0 }, { row: 1, col: 0 }, { row: 0, col: -1 }, { row: 0, col: 1 }];
    const d = dirs[Math.floor(Math.random() * dirs.length)];
    const nr = this.row + d.row, nc = this.col + d.col;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) { this.row = nr; this.col = nc; }
  }
}

// ===== 3. 模拟并记录帧 =====
const pacman = new PacMan();
const ghosts = [
  new Ghost('Blinky', 0, 0, '#FF453A'),
  new Ghost('Pinky', 6, 51, '#FF64DF'),
  new Ghost('Inky', 0, 51, '#64D2FF'),
  new Ghost('Clyde', 6, 0, '#FF9F0A')
];

const frames = [];
const totalSteps = 40;

for (let step = 0; step < totalSteps; step++) {
  const mapCopy = map.map(row => [...row]);
  const pacPos = { row: pacman.row, col: pacman.col };
  const ghostPos = ghosts.map(g => ({ row: g.row, col: g.col, color: g.color }));
  frames.push({ map: mapCopy, pac: pacPos, ghosts: ghostPos });
  pacman.move(map);
  ghosts.forEach(g => g.chase(pacman));
}

console.log(`✅ 已记录 ${frames.length} 帧`);

// ===== 4. 配置 GIF 参数 =====
const cellSize = 12;
const gap = 2;
const padding = { top: 20, bottom: 16, left: 4, right: 4 };
const width = cols * (cellSize + gap) + gap + padding.left + padding.right;
const height = rows * (cellSize + gap) + gap + padding.top + padding.bottom;

function hexToRgb(hex) {
  if (!hex || hex === '#ebedf0') return [235, 237, 240];
  let c = hex.substring(1);
  if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
  return [parseInt(c.substring(0,2), 16), parseInt(c.substring(2,4), 16), parseInt(c.substring(4,6), 16)];
}

// ===== 5. 创建 GIF 编码器 =====
const encoder = new GIFEncoder(width, height, 'neuquant', true);
encoder.setDelay(150);
encoder.setRepeat(0);
encoder.start();

// ===== 6. 逐帧绘制（使用 Jimp） =====
(async () => {
  for (let idx = 0; idx < frames.length; idx++) {
    const frame = frames[idx];
    const image = await Jimp.create(width, height, 0xFFFFFFFF);

    // 背景渐变
    for (let y = 0; y < height; y++) {
      const ratio = y / height;
      const r = Math.round(235 + (245 - 235) * ratio);
      const g = Math.round(235 + (245 - 235) * ratio);
      const b = Math.round(237 + (247 - 237) * ratio);
      const color = Jimp.rgbaToInt(r, g, b, 255);
      for (let x = 0; x < width; x++) {
        image.setPixelColor(color, x, y);
      }
    }

    // 绘制格子
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * (cellSize + gap) + gap + padding.left;
        const y = r * (cellSize + gap) + gap + padding.top;
        const color = colorMap[r][c];
        const isEaten = frame.map[r][c] === 0;
        let opacity = 0.85;
        if (color === '#ebedf0') opacity = 0.30;
        if (isEaten) opacity *= 0.4;

        const [cr, cg, cb] = hexToRgb(color);
        const alpha = Math.round(opacity * 255);
        const baseColor = Jimp.rgbaToInt(cr, cg, cb, alpha);
        for (let dy = 0; dy < cellSize; dy++) {
          for (let dx = 0; dx < cellSize; dx++) {
            image.setPixelColor(baseColor, x + dx, y + dy);
          }
        }
        if (opacity > 0.2) {
          const highlight = Jimp.rgbaToInt(255, 255, 255, Math.round(120 * opacity));
          for (let dx = 2; dx < cellSize-2; dx++) {
            image.setPixelColor(highlight, x + dx, y + 1);
          }
        }
      }
    }

    // 吃豆人
    const pacX = frame.pac.col * (cellSize + gap) + gap + padding.left + cellSize/2;
    const pacY = frame.pac.row * (cellSize + gap) + gap + padding.top + cellSize/2;
    const size = cellSize * 0.4;
    const pacColor = Jimp.rgbaToInt(255, 215, 0, 255);
    for (let angle = 0; angle < 2 * Math.PI; angle += 0.15) {
      for (let r2 = 0; r2 < size; r2 += 1) {
        const px = pacX + r2 * Math.cos(angle);
        const py = pacY + r2 * Math.sin(angle);
        if (px >= 0 && px < width && py >= 0 && py < height) {
          image.setPixelColor(pacColor, Math.round(px), Math.round(py));
        }
      }
    }
    const white = Jimp.rgbaToInt(255, 255, 255, 255);
    const black = Jimp.rgbaToInt(0, 0, 0, 255);
    image.setPixelColor(white, Math.round(pacX + size*0.3), Math.round(pacY - size*0.3));
    image.setPixelColor(white, Math.round(pacX + size*0.3+1), Math.round(pacY - size*0.3));
    image.setPixelColor(black, Math.round(pacX + size*0.35), Math.round(pacY - size*0.28));

    // 幽灵
    frame.ghosts.forEach(ghost => {
      const gx = ghost.col * (cellSize + gap) + gap + padding.left + cellSize/2;
      const gy = ghost.row * (cellSize + gap) + gap + padding.top + cellSize/2;
      const gSize = cellSize * 0.5;
      const [gr, gg, gb] = hexToRgb(ghost.color);
      const ghostColor = Jimp.rgbaToInt(gr, gg, gb, 200);
      for (let dy = -gSize; dy < gSize; dy++) {
        for (let dx = -gSize; dx < gSize; dx++) {
          const px = gx + dx, py = gy + dy;
          if (px >= 0 && px < width && py >= 0 && py < height) {
            image.setPixelColor(ghostColor, Math.round(px), Math.round(py));
          }
        }
      }
      image.setPixelColor(white, Math.round(gx - gSize*0.3), Math.round(gy - gSize*0.2));
      image.setPixelColor(white, Math.round(gx + gSize*0.3), Math.round(gy - gSize*0.2));
      image.setPixelColor(black, Math.round(gx - gSize*0.25), Math.round(gy - gSize*0.15));
      image.setPixelColor(black, Math.round(gx + gSize*0.35), Math.round(gy - gSize*0.15));
    });

    const bitmap = image.bitmap;
    encoder.addFrame(bitmap.data);
    console.log(`✅ 已渲染帧 ${idx+1}/${frames.length}`);
  }

  encoder.finish();
  const buffer = encoder.out.getData();
  fs.writeFileSync('output.gif', buffer);
  console.log('✅ GIF 已生成: output.gif');
})();