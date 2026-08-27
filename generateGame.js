const fs = require('fs');
const crypto = require('crypto');
const {
  runSimulation,
  DEFAULT_SIMULATION_OPTIONS,
  SIMULATION_VERSION,
} = require('./gameEngine');
const { loadContributionData } = require('./contributionData');

const {
  rows,
  cols,
  colorMap,
  contributionSet,
  contributionWeights,
  totalContributions,
} = loadContributionData();

const simulationOptions = {
  ...DEFAULT_SIMULATION_OPTIONS,
  gridRows: rows,
  gridCols: cols,
  contributionWeights,
};
const { frames, maximumSnakeLength, shrinkInterval } = runSimulation(
  contributionSet,
  simulationOptions,
);

const cellSize = 18;
const gap = 4;
const radius = 5;
const span = cellSize + gap;
const gridOffsetY = 58;
const width = cols * span + gap;
const height = rows * span + gridOffsetY + 18;
const frameDelayMs = simulationOptions.frameDelayMs;
const durationMs = frames.length * frameDelayMs;
const animationVersion = `${SIMULATION_VERSION}-` + crypto
  .createHash('sha256')
  .update(fs.readFileSync('contributions.json'))
  .digest('hex')
  .slice(0, 12);

const colors = {
  background: '#0d1117',
  grid: '#161b22',
  gridStroke: '#21262d',
  text: '#8b949e',
  snakeHead: '#39ff14',
  snakeBody: '#20d94b',
  snakeTail: '#0aa83f',
  eye: '#0d1117',
};

function cellTopLeft(row, col) {
  return {
    x: col * span + gap,
    y: row * span + gap + gridOffsetY,
  };
}

function cellCenter(row, col) {
  const { x, y } = cellTopLeft(row, col);
  return { x: x + cellSize / 2, y: y + cellSize / 2 };
}

function parseKey(key) {
  return key.split(',').map(Number);
}

function contributionColor(key) {
  const [row, col] = parseKey(key);
  return colorMap[row]?.[col] || '#39d353';
}

function segmentSize(index) {
  if (maximumSnakeLength <= 1) return 17;
  return 17 - (index / (maximumSnakeLength - 1)) * 6;
}

function number(value) {
  return Number(value.toFixed(3));
}

const keyTimes = Array.from(
  { length: frames.length + 1 },
  (_, index) => number(index / frames.length),
).join(';');

function animate(attributeName, frameValues) {
  const values = [...frameValues, frameValues.at(-1)].join(';');
  return `<animate attributeName="${attributeName}" values="${values}" ` +
    `keyTimes="${keyTimes}" dur="${durationMs}ms" begin="0s" ` +
    'calcMode="discrete" repeatCount="indefinite"/>';
}

function segmentGeometry(frame, index) {
  const segment = frame.snakeBody[index];
  const size = segmentSize(index);
  if (!segment) return { x: 0, y: 0, opacity: 0 };
  const center = cellCenter(segment.row, segment.col);
  return {
    x: number(center.x - size / 2),
    y: number(center.y - size / 2),
    opacity: 1,
  };
}

function connectorGeometry(frame, index) {
  const current = frame.snakeBody[index];
  const next = frame.snakeBody[index - 1];
  const currentSize = segmentSize(index);
  const nextSize = segmentSize(index - 1);
  const thickness = number(Math.min(currentSize, nextSize) * 0.62);

  if (
    !current ||
    !next ||
    Math.abs(current.row - next.row) + Math.abs(current.col - next.col) !== 1
  ) {
    return { x: 0, y: 0, width: thickness, height: thickness, opacity: 0 };
  }

  const a = cellCenter(current.row, current.col);
  const b = cellCenter(next.row, next.col);
  return {
    x: number(Math.min(a.x, b.x) - (a.x === b.x ? thickness / 2 : 0)),
    y: number(Math.min(a.y, b.y) - (a.y === b.y ? thickness / 2 : 0)),
    width: number(a.x === b.x ? thickness : Math.abs(a.x - b.x) + thickness),
    height: number(a.y === b.y ? thickness : Math.abs(a.y - b.y) + thickness),
    opacity: 0.82,
  };
}

function eyePosition(frame, sign) {
  const head = frame.snakeBody[0];
  const center = cellCenter(head.row, head.col);
  const { dr, dc } = frame.snakeDirection;
  const sideRow = dc;
  const sideCol = -dr;
  const forward = 3.2;
  const side = 3.2;
  return {
    x: number(center.x + dc * forward + sideCol * side * sign),
    y: number(center.y + dr * forward + sideRow * side * sign),
  };
}

const metadata = {
  format: 'github-contribution-snake-smil',
  frames: frames.length,
  frameDelayMs,
  durationMs,
  repeatCount: 'indefinite',
  fill: 'remove',
  contributionDays: contributionSet.size,
  totalContributions,
  maximumSnakeLength,
  initialLength: simulationOptions.initialLength,
  shrinkInterval,
  growthPointsPerSegment: simulationOptions.growthPointsPerSegment,
  foodRegenerateSteps: simulationOptions.foodRegenerateSteps,
};

let svg = '';
svg += '<?xml version="1.0" encoding="UTF-8"?>\n';
svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
  `viewBox="0 0 ${width} ${height}" role="img" ` +
  `aria-label="Animated GitHub contribution snake" ` +
  `data-animation-duration-ms="${durationMs}" data-repeat-count="indefinite">\n`;
svg += `<metadata>${JSON.stringify(metadata)}</metadata>\n`;
svg += `<rect width="${width}" height="${height}" fill="${colors.background}"/>\n`;
svg += `<defs>
  <filter id="snake-glow" x="-70%" y="-70%" width="240%" height="240%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <linearGradient id="snake-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="${colors.snakeHead}"/>
    <stop offset="55%" stop-color="${colors.snakeBody}"/>
    <stop offset="100%" stop-color="${colors.snakeTail}"/>
  </linearGradient>
</defs>\n`;

svg += `<text x="${width / 2}" y="23" text-anchor="middle" ` +
  'font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" ' +
  `font-size="15" font-weight="700" fill="${colors.snakeHead}">` +
  'Neon Snake · GitHub Contributions</text>\n';
svg += `<text x="${width / 2}" y="43" text-anchor="middle" ` +
  'font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" ' +
  `font-size="10" fill="${colors.text}">` +
  `${totalContributions} contributions · ${contributionSet.size} active days · ` +
  `4 pts = +1 · every ${shrinkInterval} steps = -1</text>\n`;

svg += '<g id="contribution-grid">\n';
for (let row = 0; row < rows; row++) {
  for (let col = 0; col < cols; col++) {
    const { x, y } = cellTopLeft(row, col);
    svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" ` +
      `rx="${radius}" fill="${colors.grid}" stroke="${colors.gridStroke}" ` +
      'stroke-width="0.6"/>\n';
  }
}
svg += '</g>\n';

svg += '<g id="foods">\n';
for (const key of contributionSet) {
  const [row, col] = parseKey(key);
  const { x, y } = cellTopLeft(row, col);
  const opacityValues = frames.map(frame => frame.foodSet.has(key) ? 1 : 0);
  svg += `<rect data-key="${key}" x="${x}" y="${y}" ` +
    `width="${cellSize}" height="${cellSize}" rx="${radius}" ` +
    `fill="${contributionColor(key)}" opacity="${opacityValues[0]}">` +
    animate('opacity', opacityValues) + '</rect>\n';
}
svg += '</g>\n';

svg += '<g id="snake" filter="url(#snake-glow)">\n';
svg += '<g id="snake-connectors">\n';
for (let index = maximumSnakeLength - 1; index >= 1; index--) {
  const geometries = frames.map(frame => connectorGeometry(frame, index));
  const first = geometries[0];
  const thickness = number(Math.min(segmentSize(index), segmentSize(index - 1)) * 0.62);
  svg += `<rect x="${first.x}" y="${first.y}" width="${first.width}" ` +
    `height="${first.height}" rx="${number(thickness / 2)}" ` +
    `fill="url(#snake-gradient)" opacity="${first.opacity}">` +
    animate('x', geometries.map(item => item.x)) +
    animate('y', geometries.map(item => item.y)) +
    animate('width', geometries.map(item => item.width)) +
    animate('height', geometries.map(item => item.height)) +
    animate('opacity', geometries.map(item => item.opacity)) +
    '</rect>\n';
}
svg += '</g>\n';

svg += '<g id="snake-segments">\n';
for (let index = maximumSnakeLength - 1; index >= 0; index--) {
  const geometries = frames.map(frame => segmentGeometry(frame, index));
  const first = geometries[0];
  const size = number(segmentSize(index));
  svg += `<rect x="${first.x}" y="${first.y}" width="${size}" height="${size}" ` +
    `rx="${index === 0 ? 6 : 5}" ` +
    `fill="${index === 0 ? colors.snakeHead : 'url(#snake-gradient)'}" ` +
    `opacity="${first.opacity}">` +
    animate('x', geometries.map(item => item.x)) +
    animate('y', geometries.map(item => item.y)) +
    animate('opacity', geometries.map(item => item.opacity)) +
    '</rect>\n';
}
svg += '</g>\n';

for (const sign of [-1, 1]) {
  const positions = frames.map(frame => eyePosition(frame, sign));
  svg += `<circle cx="${positions[0].x}" cy="${positions[0].y}" r="1.65" ` +
    `fill="${colors.eye}">` +
    animate('cx', positions.map(item => item.x)) +
    animate('cy', positions.map(item => item.y)) +
    '</circle>\n';
}
svg += '</g>\n';
svg += '</svg>\n';

fs.writeFileSync('snake-contribution.svg', svg);

if (fs.existsSync('README.md')) {
  const readme = fs.readFileSync('README.md', 'utf8');
  const updatedReadme = readme.replace(
    /(<img\b[^>]*\bsrc=["'][^"']*snake-contribution\.svg)(?:\?v=[^"']*)?(["'])/g,
    (_, source, quote) => `${source}?v=${animationVersion}${quote}`,
  );
  if (updatedReadme !== readme) fs.writeFileSync('README.md', updatedReadme);
}

console.log(
  `snake-contribution.svg generated: ${frames.length} SMIL frames, ` +
  `${(durationMs / 1000).toFixed(2)} seconds, repeatCount=indefinite`,
);
