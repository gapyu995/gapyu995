// generateGame.js — 霓虹贪吃蛇 SVG 静态图
const fs = require('fs');
const { runSimulation, loadSimulation, ROWS, COLS } = require('./gameEngine');

// ===== 1. 读取贡献数据 =====
let rawData;
try {
  rawData = fs.readFileSync('contributions.json', 'utf8');
} catch (err) {
  console.error('⚠ 无法读取 contributions.json');
  rawData = null;
}

let colorMap = Array.from({ length: ROWS }, () => Array(COLS).fill('#ebedf0'));
const basePermanentSet = new Set();

if (rawData) {
  const data = JSON.parse(rawData);
  const userData = data.data || data;
  const weeks = userData.user.contributionsCollection.contributionCalendar.weeks;
  console.log(`✅ 成功读取 ${weeks.length} 周贡献数据`);
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
let frames, finalPermanentSet, finalEatenSet, cumulativeSteps;
const simFile = 'simulation.json';

if (fs.existsSync(simFile)) {
  console.log('📂 从 simulation.json 加载模拟数据...');
  const loaded = loadSimulation(simFile);
  frames = loaded.frames;
  cumulativeSteps = loaded.cumulativeSteps;
  finalPermanentSet = new Set(frames[frames.length - 1].permanentSet);
  finalEatenSet = new Set(frames[frames.length - 1].eatenContribSet);
} else {
  console.log('🐍 运行新模拟...');
  const result = runSimulation(basePermanentSet, {
    maxFood: 4, snakeStartRow: 3, snakeStartCol: 26,
    initialLength: 3, threshold: 20, totalSteps: 500,
  });
  frames = result.frames;
  finalPermanentSet = result.finalPermanentSet;
  finalEatenSet = result.finalEatenSet;
  cumulativeSteps = result.cumulativeSteps;
}

console.log(`📊 ${frames.length} 帧, ${cumulativeSteps} 步`);

// 最后一帧
const frame = frames[frames.length - 1];
const phase2Active = cumulativeSteps >= 20;

// ===== 3. SVG =====
const cellSize = 18;
const gap = 4;
const radius = 6;
const totalCellSpan = cellSize + gap;
const gridOffsetY = 56;
const width = COLS * totalCellSpan + gap;
const height = ROWS * totalCellSpan + gap + gridOffsetY + 36;

function cellCenter(r, c) { return { x: c * totalCellSpan + gap + cellSize / 2, y: r * totalCellSpan + gap + gridOffsetY + cellSize / 2 }; }
function cellTopLeft(r, c) { return { x: c * totalCellSpan + gap, y: r * totalCellSpan + gap + gridOffsetY }; }

const C = {
  neonGreen: '#39ff14', neonGreenDark: '#00c853', neonGreenBright: '#7cff4d',
  foodGold: '#FFD700', foodGoldLight: '#FFEA70',
  bgStart: '#0a0a0a', bgEnd: '#0d0d0d',
};

let svg = '';
svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background: linear-gradient(145deg, ${C.bgStart}, ${C.bgEnd}); font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;">\n`;

// Title
const phaseLabel = phase2Active ? `Phase 2 | ${cumulativeSteps} steps` : `Phase 1 | ${cumulativeSteps}/20 steps`;
svg += `<text x="${width/2}" y="24" text-anchor="middle" font-size="16" font-weight="700" fill="#e0e0e0">🐍 Neon Snake · Contribution Grid</text>\n`;
svg += `<text x="${width/2}" y="42" text-anchor="middle" font-size="11" fill="#7a7a7a">${phaseLabel} · Body: ${frame.snakeBody.length} · Food: ${frame.foodSet.size}</text>\n`;

// Defs
svg += `<defs>
  <filter id="snake-glow" x="-80%" y="-80%" width="260%" height="260%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="b1"/>
    <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b2"/>
    <feMerge><feMergeNode in="b2"/><feMergeNode in="b1"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="food-glow" x="-100%" y="-100%" width="300%" height="300%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <radialGradient id="food-grad" cx="35%" cy="30%" r="70%">
    <stop offset="0%" stop-color="${C.foodGoldLight}"/><stop offset="50%" stop-color="${C.foodGold}"/><stop offset="100%" stop-color="#FF8F00"/>
  </radialGradient>
  <linearGradient id="sg-head" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#7cff4d"/><stop offset="40%" stop-color="#39ff14"/><stop offset="100%" stop-color="#00e676"/></linearGradient>
  <linearGradient id="sg-body" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#4dff2e"/><stop offset="50%" stop-color="#39ff14"/><stop offset="100%" stop-color="#00cc44"/></linearGradient>
  <linearGradient id="sg-tail" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#39ff14"/><stop offset="50%" stop-color="#1dbd3a"/><stop offset="100%" stop-color="#00aa33"/></linearGradient>
</defs>\n`;

// Grid
const sbSet = new Set(frame.snakeBody.map(s => `${s.row},${s.col}`));
const permSet = frame.permanentSet;
const eatenSet = frame.eatenContribSet;

for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const { x, y } = cellTopLeft(r, c);
    const key = `${r},${c}`;
    const isSnake = sbSet.has(key);
    const isPerm = permSet.has(key);
    const isEaten = eatenSet.has(key);
    const isOrig = basePermanentSet.has(key);

    let fillColor, fillOpacity;
    if (isPerm) {
      // Phase 2 permanent mark — bright green highlight
      fillColor = '#30a14e'; fillOpacity = 0.85;
    } else if (isSnake) {
      fillColor = '#1a1a2e'; fillOpacity = 0.12;
    } else if (isEaten) {
      // Eaten cell — dark/empty, no original contribution shown
      fillColor = '#1a1a2e'; fillOpacity = 0.08;
    } else if (isOrig) {
      fillColor = colorMap[r][c]; fillOpacity = 0.55;
    } else {
      fillColor = '#1a1a2e'; fillOpacity = 0.08;
    }

    svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="${radius}" fill="${fillColor}" opacity="${fillOpacity}" stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>\n`;

    if (isPerm) {
      svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="${radius}" fill="none" stroke="${C.neonGreen}" stroke-width="1.8" opacity="0.8" filter="url(#snake-glow)"/>\n`;
      svg += `<circle cx="${x+cellSize/2}" cy="${y+cellSize/2}" r="2.5" fill="${C.neonGreen}" opacity="0.7"/>\n`;
    }
  }
}

// Food
const curStep = frame.cumulativeSteps;
const fsMap = frame.foodSpawnSteps || new Map();
for (const key of frame.foodSet) {
  const [r, c] = key.split(',').map(Number);
  const { x, y } = cellCenter(r, c);
  const age = curStep - (fsMap.get(key) || curStep);
  const scale = Math.min(1, age / 3);
  const fr = 4.5 * scale;
  svg += `<circle cx="${x}" cy="${y}" r="${fr}" fill="url(#food-grad)" filter="url(#food-glow)"/>\n`;
  if (scale > 0.3) svg += `<circle cx="${x-1}" cy="${y-1.5}" r="${1.2*scale}" fill="rgba(255,255,255,0.7)"/>\n`;
  svg += `<circle cx="${x}" cy="${y}" r="${fr+2}" fill="none" stroke="${C.foodGold}" stroke-width="0.6" opacity="${0.4*scale}"/>\n`;
}

// Snake body
const body = frame.snakeBody;
const bLen = body.length;

function segSize(i) { const t = bLen<=1?1:i/(bLen-1); return 17 - t*7; }
function segGrad(i) { const t = bLen<=1?0:i/(bLen-1); if(t<0.1)return'sg-head'; if(t>0.85)return'sg-tail'; return'sg-body'; }

// Connectors
for (let i = 0; i < bLen - 1; i++) {
  const a = body[i], b = body[i+1];
  const p1 = cellCenter(a.row, a.col), p2 = cellCenter(b.row, b.col);
  if (Math.abs(a.row-b.row) + Math.abs(a.col-b.col) !== 1) continue;
  const ss = Math.min(segSize(i), segSize(i+1)) * 0.65;
  const hw = ss/2;
  if (a.col !== b.col) {
    const mx = Math.min(p1.x, p2.x), MX = Math.max(p1.x, p2.x);
    svg += `<rect x="${mx}" y="${(p1.y+p2.y)/2 - hw}" width="${MX-mx}" height="${ss}" rx="3" fill="url(#${segGrad(i)})" filter="url(#snake-glow)" opacity="0.75"/>\n`;
  } else {
    const my = Math.min(p1.y, p2.y), MY = Math.max(p1.y, p2.y);
    svg += `<rect x="${(p1.x+p2.x)/2 - hw}" y="${my}" width="${ss}" height="${MY-my}" rx="3" fill="url(#${segGrad(i)})" filter="url(#snake-glow)" opacity="0.75"/>\n`;
  }
}

// Segments tail→head (head last = on top)
for (let i = bLen - 1; i >= 0; i--) {
  const seg = body[i];
  const { x: cx, y: cy } = cellCenter(seg.row, seg.col);
  const sz = segSize(i), hs = sz/2, sr = i===0?6:(i===bLen-1?4:5);
  const gid = segGrad(i);

  if (i === 0) {
    // HEAD
    const { dr, dc } = frame.snakeDirection;
    const dx = dc, dy = dr;
    const p1x = dr, p1y = -dc;
    const p2x = -dr, p2y = dc;

    svg += `<rect x="${cx-hs}" y="${cy-hs}" width="${sz}" height="${sz}" rx="${sr}" fill="url(#${gid})" filter="url(#snake-glow)" stroke="${C.neonGreenBright}" stroke-width="1" opacity="0.9"/>\n`;
    svg += `<rect x="${cx-hs+2.5}" y="${cy-hs+1.5}" width="${sz-6}" height="4" rx="2" fill="rgba(255,255,255,0.35)"/>\n`;

    // Snout
    const snL = 5, snW = 4;
    const stX = cx + dx*(hs+snL), stY = cy + dy*(hs+snL);
    svg += `<path d="M ${cx+dx*hs+p1x*snW} ${cy+dy*hs+p1y*snW} L ${stX} ${stY} L ${cx+dx*hs+p2x*snW} ${cy+dy*hs+p2y*snW} Z" fill="#00a844" stroke="${C.neonGreen}" stroke-width="0.5"/>\n`;

    // Eyes
    const ef = 3.5, el = 3.8, er = 2.8;
    const e1x = cx+dx*ef+p1x*el, e1y = cy+dy*ef+p1y*el;
    const e2x = cx+dx*ef+p2x*el, e2y = cy+dy*ef+p2y*el;
    svg += `<circle cx="${e1x}" cy="${e1y}" r="${er}" fill="white"/>\n`;
    svg += `<circle cx="${e2x}" cy="${e2y}" r="${er}" fill="white"/>\n`;
    const pr = 1.4;
    svg += `<circle cx="${e1x+dx*0.8}" cy="${e1y+dy*0.8}" r="${pr}" fill="#111"/>\n`;
    svg += `<circle cx="${e2x+dx*0.8}" cy="${e2y+dy*0.8}" r="${pr}" fill="#111"/>\n`;
    svg += `<circle cx="${e1x+dx*0.8+0.3}" cy="${e1y+dy*0.8-0.4}" r="0.55" fill="white"/>\n`;
    svg += `<circle cx="${e2x+dx*0.8+0.3}" cy="${e2y+dy*0.8-0.4}" r="0.55" fill="white"/>\n`;

    // Tongue
    const tbX = cx+dx*(hs+1), tbY = cy+dy*(hs+1);
    const tmX = tbX+dx*7, tmY = tbY+dy*7;
    svg += `<path d="M ${tbX} ${tbY} Q ${(tbX+tmX)/2} ${(tbY+tmY)/2-1}, ${tmX} ${tmY}" stroke="#ff1744" stroke-width="1" fill="none" stroke-linecap="round"/>\n`;
    svg += `<path d="M ${tmX} ${tmY} L ${tmX+dx*3.5+p1x*2} ${tmY+dy*3.5+p1y*2}" stroke="#ff1744" stroke-width="0.8" fill="none" stroke-linecap="round"/>\n`;
    svg += `<path d="M ${tmX} ${tmY} L ${tmX+dx*3.5+p2x*2} ${tmY+dy*3.5+p2y*2}" stroke="#ff1744" stroke-width="0.8" fill="none" stroke-linecap="round"/>\n`;
  } else {
    svg += `<rect x="${cx-hs}" y="${cy-hs}" width="${sz}" height="${sz}" rx="${sr}" fill="url(#${gid})" filter="url(#snake-glow)" stroke="${C.neonGreen}" stroke-width="0.4" opacity="0.8"/>\n`;
    svg += `<rect x="${cx-hs+2}" y="${cy-hs+1.5}" width="${sz-5}" height="2.5" rx="1.2" fill="rgba(255,255,255,0.25)"/>\n`;
  }
}

// Legend
const ly = height - 10;
svg += `<rect x="12" y="${ly-10}" width="14" height="14" rx="3" fill="url(#sg-body)" filter="url(#snake-glow)"/>\n`;
svg += `<text x="30" y="${ly+1}" font-size="9" fill="#888">Snake</text>\n`;
svg += `<circle cx="95" cy="${ly-3}" r="4" fill="url(#food-grad)" filter="url(#food-glow)"/>\n`;
svg += `<text x="103" y="${ly+1}" font-size="9" fill="#888">Food</text>\n`;
svg += `<rect x="150" y="${ly-10}" width="14" height="14" rx="3" fill="#30a14e" opacity="0.7"/>\n`;
svg += `<rect x="150" y="${ly-10}" width="14" height="14" rx="3" fill="none" stroke="${C.neonGreen}" stroke-width="1.5" opacity="0.8"/>\n`;
svg += `<text x="168" y="${ly+1}" font-size="9" fill="#888">Perm mark</text>\n`;
svg += `<text x="${width-14}" y="${ly+1}" text-anchor="end" font-size="9" fill="${phase2Active?C.neonGreen:'#888'}">Steps:${cumulativeSteps} Body:${bLen}</text>\n`;

svg += `</svg>`;

fs.writeFileSync('snake-contribution.svg', svg);
console.log('✅ snake-contribution.svg 已生成');
