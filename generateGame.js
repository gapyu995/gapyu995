// generateGame.js
const fs = require('fs');

// ===== 1. 读取贡献数据 =====
let rawData;
try {
  rawData = fs.readFileSync('contributions.json', 'utf8');
} catch (err) {
  console.error('❌ 无法读取 contributions.json，请先运行 node fetchData.js');
  process.exit(1);
}

let data;
try {
  data = JSON.parse(rawData);
} catch (err) {
  console.error('❌ contributions.json 不是有效的 JSON 格式', err);
  process.exit(1);
}

// 兼容两种数据结构
const userData = data.data || data;
if (!userData.user) {
  console.error('❌ 未找到 user 字段，请检查贡献数据');
  process.exit(1);
}

const weeks = userData.user.contributionsCollection.contributionCalendar.weeks;
if (!weeks || weeks.length === 0) {
  console.error('❌ 未找到贡献周数据');
  process.exit(1);
}

console.log(`✅ 成功读取 ${weeks.length} 周的贡献数据`);
console.log(`📊 总贡献数: ${userData.user.contributionsCollection.contributionCalendar.totalContributions}`);

// ===== 2. 构建游戏地图 (7行 × 52列) =====
const rows = 7;
const cols = 52;
let map = Array.from({ length: rows }, () => Array(cols).fill(0));
let colorMap = Array.from({ length: rows }, () => Array(cols).fill('#ebedf0'));

weeks.forEach((week, weekIndex) => {
  week.contributionDays.forEach((day, dayIndex) => {
    const col = weekIndex;
    const row = dayIndex;
    if (row < rows && col < cols) {
      const count = day.contributionCount;
      map[row][col] = count > 0 ? 1 : 0;
      colorMap[row][col] = day.color || '#ebedf0';
    }
  });
});

// ===== 3. 游戏类定义 =====
class PacMan {
  constructor() {
    this.row = 3;
    this.col = 26;
  }

  findNextMove(map) {
    for (let c = 0; c < cols; c++) {
      if (map[this.row][c] === 1) {
        return { row: this.row, col: c };
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (map[r][c] === 1) {
          return { row: r, col: c };
        }
      }
    }
    return { row: this.row, col: this.col };
  }

  move(map) {
    const next = this.findNextMove(map);
    if (map[next.row][next.col] === 1) {
      map[next.row][next.col] = 0;
    }
    this.row = next.row;
    this.col = next.col;
  }
}

class Ghost {
  constructor(name, startRow, startCol, color) {
    this.name = name;
    this.row = startRow;
    this.col = startCol;
    this.color = color;
  }

  chase(pacman) {
    const rowDiff = pacman.row - this.row;
    const colDiff = pacman.col - this.col;
    if (Math.abs(rowDiff) >= Math.abs(colDiff)) {
      const newRow = this.row + Math.sign(rowDiff);
      if (newRow >= 0 && newRow < rows) {
        this.row = newRow;
        return;
      }
    } else {
      const newCol = this.col + Math.sign(colDiff);
      if (newCol >= 0 && newCol < cols) {
        this.col = newCol;
        return;
      }
    }
    this.randomMove();
  }

  randomMove() {
    const directions = [
      { row: -1, col: 0 }, { row: 1, col: 0 },
      { row: 0, col: -1 }, { row: 0, col: 1 }
    ];
    const randomDir = directions[Math.floor(Math.random() * directions.length)];
    const newRow = this.row + randomDir.row;
    const newCol = this.col + randomDir.col;
    if (newRow >= 0 && newRow < rows && newCol >= 0 && newCol < cols) {
      this.row = newRow;
      this.col = newCol;
    }
  }
}

// ===== 4. 初始化游戏 =====
const pacman = new PacMan();
const ghosts = [
  new Ghost('Blinky', 0, 0, '#FF453A'),
  new Ghost('Pinky', 6, 51, '#FF64DF'),
  new Ghost('Inky', 0, 51, '#64D2FF'),
  new Ghost('Clyde', 6, 0, '#FF9F0A')
];

console.log('🎮 模拟游戏运行中...');
for (let step = 0; step < 50; step++) {
  pacman.move(map);
  ghosts.forEach(ghost => ghost.chase(pacman));
}
console.log('✅ 游戏模拟完成');

// ===== 5. 生成 SVG（完整版，含鲜艳吃豆人+扭曲残影） =====
function generateSVG() {
  const cellSize = 18;
  const gap = 4;
  const radius = 6;
  const width = cols * (cellSize + gap) + gap;
  const height = rows * (cellSize + gap) + gap + 70;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background: linear-gradient(145deg, #e8eaed, #f5f5f7); font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;">\n`;

  // 标题
  svg += `<text x="${width/2}" y="26" text-anchor="middle" font-size="17" font-weight="600" fill="#1c1c1e" letter-spacing="0.3">💎 液态玻璃 · 贡献图</text>\n`;
  svg += `<text x="${width/2}" y="42" text-anchor="middle" font-size="11" fill="#8e8e93">基于 GitHub 贡献数据 · 每一格都是剔透的玻璃</text>\n`;

  // 定义滤镜
  svg += `<defs>
    <filter id="drop-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.08)"/>
    </filter>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3"/>
    </filter>
  </defs>\n`;

  // ===== 5a. 液态玻璃格子 =====
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * (cellSize + gap) + gap;
      const y = r * (cellSize + gap) + gap + 52;
      const color = colorMap[r][c];
      const isEaten = map[r][c] === 0;

      let baseOpacity = 0.85;
      if (color === '#ebedf0') baseOpacity = 0.30;
      if (isEaten) baseOpacity = baseOpacity * 0.4;

      // 阴影
      svg += `<rect x="${x + 2}" y="${y + 3}" width="${cellSize}" height="${cellSize}" rx="${radius}" fill="rgba(0,0,0,0.06)" filter="url(#drop-shadow)"/>\n`;

      // 玻璃渐变
      const glassGradId = `glass-${r}-${c}`;
      svg += `<defs>
        <radialGradient id="${glassGradId}" cx="30%" cy="30%" r="70%" fx="25%" fy="25%">
          <stop offset="0%"   stop-color="rgba(255,255,255,0.6)" stop-opacity="${0.8 * baseOpacity}"/>
          <stop offset="40%"  stop-color="${color}" stop-opacity="${0.7 * baseOpacity}"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="${0.9 * baseOpacity}"/>
        </radialGradient>
      </defs>`;

      svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="${radius}" 
                    fill="url(#${glassGradId})" stroke="rgba(255,255,255,0.4)" stroke-width="0.8"/>\n`;

      // 高光
      svg += `<path d="M ${x + radius} ${y} L ${x + cellSize - radius} ${y} Q ${x + cellSize} ${y} ${x + cellSize} ${y + radius}" 
                fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1.5" opacity="${0.7 * baseOpacity}"/>\n`;
      svg += `<circle cx="${x + radius}" cy="${y + radius}" r="2" fill="rgba(255,255,255,0.5)" opacity="${0.6 * baseOpacity}"/>\n`;

      if (color !== '#ebedf0' && !isEaten) {
        svg += `<circle cx="${x + cellSize - 5}" cy="${y + 5}" r="2" fill="rgba(255,255,255,0.6)"/>\n`;
      }
    }
  }

  // ===== 5b. 鲜艳吃豆人 + 扭曲残影（新版） =====
  const pacX = pacman.col * (cellSize + gap) + gap;
  const pacY = pacman.row * (cellSize + gap) + gap + 52;
  const size = cellSize * 0.35;   // 缩小尺寸
  const pacCenterX = pacX + cellSize / 2;
  const pacCenterY = pacY + cellSize / 2;

  // 计算运动方向（从初始位置到最终位置）
  const startRow = 3, startCol = 26;
  const dRow = pacman.row - startRow;
  const dCol = pacman.col - startCol;
  let angle = 0;
  if (dCol !== 0 || dRow !== 0) {
    angle = Math.atan2(dRow, dCol);
  }

  // ---- 运动残影 ----
  const trailCount = 4;
  for (let i = 1; i <= trailCount; i++) {
    const t = i / (trailCount + 1);
    const trailScale = 1 - t * 0.6;
    const trailOpacity = 0.25 - t * 0.18;
    const trailX = pacCenterX - t * size * 1.8 * Math.cos(angle);
    const trailY = pacCenterY - t * size * 1.8 * Math.sin(angle);
    const stretchX = 1 + t * 1.2;
    const stretchY = 1 - t * 0.4;
    const trailSize = size * trailScale;
    svg += `<ellipse cx="${trailX}" cy="${trailY}" rx="${trailSize * stretchX}" ry="${trailSize * stretchY}" 
                     fill="#FFD700" opacity="${trailOpacity}" 
                     transform="rotate(${angle * 180 / Math.PI}, ${trailX}, ${trailY})"/>\n`;
  }

  // ---- 吃豆人主体（鲜艳渐变） ----
  svg += `<defs>
    <radialGradient id="pacman-grad-vibrant" cx="35%" cy="30%" r="70%" fx="30%" fy="25%">
      <stop offset="0%"   stop-color="#FFF176" />
      <stop offset="30%"  stop-color="#FFE53B" />
      <stop offset="70%"  stop-color="#FFC107" />
      <stop offset="100%" stop-color="#FF9800" />
    </radialGradient>
  </defs>`;

  const stretchFactorX = 1.2;
  const stretchFactorY = 0.8;
  const rx = size * stretchFactorX;
  const ry = size * stretchFactorY;

  svg += `<ellipse cx="${pacCenterX}" cy="${pacCenterY}" rx="${rx}" ry="${ry}" 
                   fill="url(#pacman-grad-vibrant)" stroke="#FF8F00" stroke-width="1.2"
                   transform="rotate(${angle * 180 / Math.PI}, ${pacCenterX}, ${pacCenterY})"/>\n`;

  // 高光
  svg += `<ellipse cx="${pacCenterX - rx * 0.3 * Math.cos(angle) + ry * 0.1 * Math.sin(angle)}" 
                   cy="${pacCenterY - rx * 0.3 * Math.sin(angle) - ry * 0.1 * Math.cos(angle)}" 
                   rx="${rx * 0.35}" ry="${ry * 0.25}" 
                   fill="rgba(255,255,255,0.5)" 
                   transform="rotate(${angle * 180 / Math.PI}, ${pacCenterX}, ${pacCenterY})"/>\n`;

  // 嘴巴
  const mouthAngleRad = 0.4;
  const topX = pacCenterX + rx * Math.cos(angle - mouthAngleRad);
  const topY = pacCenterY + ry * Math.sin(angle - mouthAngleRad);
  const botX = pacCenterX + rx * Math.cos(angle + mouthAngleRad);
  const botY = pacCenterY + ry * Math.sin(angle + mouthAngleRad);
  svg += `<path d="M ${pacCenterX} ${pacCenterY} L ${topX} ${topY} A ${rx} ${ry} 0 0 1 ${botX} ${botY} Z" 
            fill="#f5f5f7" stroke="#FF8F00" stroke-width="0.8" 
            transform="rotate(${angle * 180 / Math.PI}, ${pacCenterX}, ${pacCenterY})"/>\n`;

  // 眼睛
  const eyeOffX = rx * 0.3;
  const eyeOffY = -ry * 0.25;
  const eyeX = pacCenterX + eyeOffX * Math.cos(angle) - eyeOffY * Math.sin(angle);
  const eyeY = pacCenterY + eyeOffX * Math.sin(angle) + eyeOffY * Math.cos(angle);
  const eyeR = Math.min(rx, ry) * 0.2;
  svg += `<circle cx="${eyeX}" cy="${eyeY}" r="${eyeR}" fill="rgba(255,255,255,0.95)"/>\n`;
  const pupilOffX = eyeR * 0.3;
  const pupilOffY = -eyeR * 0.2;
  const pupilX = eyeX + pupilOffX * Math.cos(angle) - pupilOffY * Math.sin(angle);
  const pupilY = eyeY + pupilOffX * Math.sin(angle) + pupilOffY * Math.cos(angle);
  svg += `<circle cx="${pupilX}" cy="${pupilY}" r="${eyeR * 0.5}" fill="#1c1c1e"/>\n`;
  svg += `<circle cx="${pupilX + eyeR * 0.2}" cy="${pupilY - eyeR * 0.2}" r="${eyeR * 0.2}" fill="rgba(255,255,255,0.8)"/>\n`;

  // ===== 5c. 玻璃风格幽灵 =====
  ghosts.forEach(ghost => {
    const gx = ghost.col * (cellSize + gap) + gap;
    const gy = ghost.row * (cellSize + gap) + gap + 52;
    const ghostSize = cellSize * 1.4;
    const offset = (ghostSize - cellSize) / 2;

    const ghostGradId = `ghost-${ghost.name}`;
    svg += `<defs>
      <radialGradient id="${ghostGradId}" cx="30%" cy="30%" r="70%">
        <stop offset="0%" stop-color="${ghost.color}" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="${ghost.color}" stop-opacity="0.5"/>
      </radialGradient>
    </defs>`;

    svg += `<rect x="${gx - offset}" y="${gy - offset}" width="${ghostSize}" height="${ghostSize}" rx="${radius + 2}" 
                  fill="url(#${ghostGradId})" stroke="rgba(255,255,255,0.3)" stroke-width="1.2"/>\n`;
    svg += `<rect x="${gx - offset + 4}" y="${gy - offset + 3}" width="${ghostSize - 12}" height="4" rx="2" 
                  fill="rgba(255,255,255,0.3)"/>\n`;
    // 眼睛
    svg += `<circle cx="${gx - offset + ghostSize * 0.3}" cy="${gy - offset + ghostSize * 0.4}" r="${ghostSize * 0.12}" fill="#ffffff" opacity="0.9"/>\n`;
    svg += `<circle cx="${gx - offset + ghostSize * 0.7}" cy="${gy - offset + ghostSize * 0.4}" r="${ghostSize * 0.12}" fill="#ffffff" opacity="0.9"/>\n`;
    svg += `<circle cx="${gx - offset + ghostSize * 0.33}" cy="${gy - offset + ghostSize * 0.42}" r="${ghostSize * 0.06}" fill="#1c1c1e"/>\n`;
    svg += `<circle cx="${gx - offset + ghostSize * 0.73}" cy="${gy - offset + ghostSize * 0.42}" r="${ghostSize * 0.06}" fill="#1c1c1e"/>\n`;
  });

  // 底部图例
  const legendY = height - 5;
  svg += `<text x="10" y="${legendY}" font-size="9" fill="#8e8e93">✨ 玻璃质感 · 透明度随贡献度变化</text>\n`;
  svg += `<text x="${width - 10}" y="${legendY}" text-anchor="end" font-size="9" fill="#8e8e93">🟡 吃豆人  ·  👻 幽灵</text>\n`;

  svg += `</svg>`;
  return svg;   // ⚠️ 确保这里有 return
}

// ===== 6. 保存 SVG =====
const svgContent = generateSVG();
fs.writeFileSync('output.svg', svgContent);
console.log('✅ 游戏 SVG 已生成: output.svg');
console.log('📂 请双击 output.svg 用浏览器打开预览');