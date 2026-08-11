// generateGif.js
const fs = require('fs');
const { createCanvas } = require('canvas');
const GIFEncoder = require('gifencoder');

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

// ===== 2. 游戏类（同前） =====
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

// 保存每帧的数据（为了渲染方便，我们直接复制当前状态）
const frames = [];
const totalSteps = 40; // 帧数，可以调整

for (let step = 0; step < totalSteps; step++) {
  // 深拷贝当前地图状态
  const mapCopy = map.map(row => [...row]);
  const pacPos = { row: pacman.row, col: pacman.col };
  const ghostPos = ghosts.map(g => ({ row: g.row, col: g.col, color: g.color }));
  frames.push({ map: mapCopy, pac: pacPos, ghosts: ghostPos });
  
  // 移动一步
  pacman.move(map);
  ghosts.forEach(g => g.chase(pacman));
}

console.log(`✅ 已记录 ${frames.length} 帧`);

// ===== 4. 用 Canvas 渲染 GIF =====
const cellSize = 14;  // 比之前略小，适应GIF尺寸
const gap = 3;
const radius = 4;
const width = cols * (cellSize + gap) + gap;
const height = rows * (cellSize + gap) + gap + 40;

const canvas = createCanvas(width, height);
const ctx = canvas.getContext('2d');

// 创建 GIF 编码器
const encoder = new GIFEncoder(width, height);
encoder.start();
encoder.setRepeat(0);   // 0 = 无限循环
encoder.setDelay(150);  // 每帧150ms（约6.67fps）
encoder.setQuality(10);

// 遍历每一帧
frames.forEach((frame, idx) => {
  ctx.clearRect(0, 0, width, height);
  
  // 背景
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#e8eaed');
  grad.addColorStop(1, '#f5f5f7');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // 标题
  ctx.fillStyle = '#1c1c1e';
  ctx.font = 'bold 14px -apple-system, "SF Pro Display", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('💎 液态玻璃 · 贡献图', width/2, 22);
  ctx.font = '10px -apple-system, "SF Pro Display", sans-serif';
  ctx.fillStyle = '#8e8e93';
  ctx.fillText('GitHub 贡献数据动态模拟', width/2, 36);

  // 绘制格子
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * (cellSize + gap) + gap;
      const y = r * (cellSize + gap) + gap + 44;
      const color = colorMap[r][c];
      const isEaten = frame.map[r][c] === 0;
      let opacity = 0.85;
      if (color === '#ebedf0') opacity = 0.30;
      if (isEaten) opacity *= 0.4;

      // 阴影
      ctx.shadowColor = 'rgba(0,0,0,0.06)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;
      ctx.beginPath();
      ctx.roundRect(x+1, y+2, cellSize, cellSize, radius);
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.fill();
      ctx.shadowColor = 'transparent';

      // 主体
      const gradGlass = ctx.createRadialGradient(
        x + cellSize*0.3, y + cellSize*0.3, 2,
        x + cellSize*0.5, y + cellSize*0.5, cellSize*0.7
      );
      const baseColor = color || '#ebedf0';
      gradGlass.addColorStop(0, `rgba(255,255,255,${0.8 * opacity})`);
      gradGlass.addColorStop(0.5, `rgba(${hexToRgb(baseColor)}, ${0.7 * opacity})`);
      gradGlass.addColorStop(1, `rgba(${hexToRgb(baseColor)}, ${0.9 * opacity})`);
      ctx.beginPath();
      ctx.roundRect(x, y, cellSize, cellSize, radius);
      ctx.fillStyle = gradGlass;
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,0.4)`;
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // 高光
      ctx.beginPath();
      ctx.roundRect(x+2, y+1, cellSize-4, 3, 2);
      ctx.fillStyle = `rgba(255,255,255,${0.5 * opacity})`;
      ctx.fill();
    }
  }

  // 绘制吃豆人
  const pacX = frame.pac.col * (cellSize + gap) + gap + cellSize/2;
  const pacY = frame.pac.row * (cellSize + gap) + gap + 44 + cellSize/2;
  const size = cellSize * 0.4;
  const gradPac = ctx.createRadialGradient(pacX-2, pacY-2, 2, pacX, pacY, size);
  gradPac.addColorStop(0, '#FFF176');
  gradPac.addColorStop(0.5, '#FFD700');
  gradPac.addColorStop(1, '#FF9800');
  ctx.beginPath();
  ctx.arc(pacX, pacY, size, 0, Math.PI * 2);
  ctx.fillStyle = gradPac;
  ctx.fill();
  ctx.strokeStyle = '#FF8F00';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 嘴巴（这里简化，为了动感可以省略）
  // 眼睛
  ctx.beginPath();
  ctx.arc(pacX + size*0.3, pacY - size*0.3, size*0.2, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(pacX + size*0.35, pacY - size*0.28, size*0.1, 0, Math.PI*2);
  ctx.fillStyle = '#1c1c1e';
  ctx.fill();

  // 绘制幽灵
  frame.ghosts.forEach(ghost => {
    const gx = ghost.col * (cellSize + gap) + gap + cellSize/2;
    const gy = ghost.row * (cellSize + gap) + gap + 44 + cellSize/2;
    const gSize = cellSize * 0.5;
    const gradGhost = ctx.createRadialGradient(gx-2, gy-2, 2, gx, gy, gSize);
    gradGhost.addColorStop(0, ghost.color);
    gradGhost.addColorStop(1, ghost.color);
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.roundRect(gx - gSize, gy - gSize, gSize*2, gSize*2, 6);
    ctx.fillStyle = gradGhost;
    ctx.fill();
    // 眼睛
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(gx - gSize*0.3, gy - gSize*0.2, gSize*0.2, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(gx + gSize*0.3, gy - gSize*0.2, gSize*0.2, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#1c1c1e';
    ctx.beginPath();
    ctx.arc(gx - gSize*0.25, gy - gSize*0.15, gSize*0.08, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(gx + gSize*0.35, gy - gSize*0.15, gSize*0.08, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  // 添加帧编号（可选）
  ctx.fillStyle = '#8e8e93';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`帧 ${idx+1}/${frames.length}`, width-8, height-6);

  // 将canvas帧添加到GIF
  encoder.addFrame(ctx);
});

// 结束编码
encoder.finish();

// 写入文件
const buf = encoder.out.getData();
fs.writeFileSync('output.gif', buf);
console.log('✅ GIF 已生成: output.gif');

// 辅助函数：十六进制颜色转R,G,B字符串
function hexToRgb(hex) {
  if (!hex || hex === '#ebedf0') return '235,237,240';
  let c = hex.substring(1);
  if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
  const r = parseInt(c.substring(0,2), 16);
  const g = parseInt(c.substring(2,4), 16);
  const b = parseInt(c.substring(4,6), 16);
  return `${r},${g},${b}`;
}

// 修复 roundRect 的 polyfill（Canvas 原生不支持，需要定义）
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    if (r > w/2) r = w/2;
    if (r > h/2) r = h/2;
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.quadraticCurveTo(x + w, y, x + w, y + r);
    this.lineTo(x + w, y + h - r);
    this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.lineTo(x + r, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - r);
    this.lineTo(x, y + r);
    this.quadraticCurveTo(x, y, x + r, y);
    this.closePath();
    return this;
  };
}