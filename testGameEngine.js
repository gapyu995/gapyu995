const assert = require('assert');
const {
  coordinateKey,
  isAdjacent,
  generatePath,
  runSimulation,
  DEFAULT_SIMULATION_OPTIONS,
} = require('./gameEngine');

function testGeneratePathIsSelfAvoiding() {
  const gridRows = 4;
  const gridCols = 5;
  const contributions = new Set(['1,1', '2,3', '0,4', '3,1']);
  const seed = 12345;
  const { mulberry32 } = require('./gameEngine');
  const random = mulberry32(seed);

  const start = { row: 1, col: 0 };
  const end = { row: 0, col: 1 };
  const path = generatePath(start, end, gridRows, gridCols, contributions, random, 6);

  assert(Array.isArray(path), 'path should be generated');
  assert.deepStrictEqual(path[0], start);
  assert.deepStrictEqual(path[path.length - 1], end);

  const keys = path.map(coordinateKey);
  assert.strictEqual(new Set(keys).size, keys.length, 'path must not revisit cells');

  for (let index = 1; index < path.length; index++) {
    assert(
      isAdjacent(path[index - 1], path[index]),
      `path step ${index} must be adjacent`,
    );
  }
}

function testSeamlessMultiplePaths() {
  const gridRows = 4;
  const gridCols = 5;
  const contributions = new Set(['0,0', '1,1', '2,3', '0,4', '3,1', '3,4']);
  const snakeLength = 3;
  const eatTrailSteps = 4;
  const pathCount = 5;

  const { frames, totalSteps } = runSimulation(contributions, {
    ...DEFAULT_SIMULATION_OPTIONS,
    gridRows,
    gridCols,
    snakeLength,
    eatTrailSteps,
    pathCount,
    minPathLength: 5,
    seed: 987654,
  });

  assert.strictEqual(frames.length, totalSteps);
  assert(frames.length > pathCount * 5, 'paths should be long enough to be distinct');

  const junctionKey = '0,0';
  let junctionVisits = 0;
  for (const frame of frames) {
    if (coordinateKey(frame.snakeBody[0]) === junctionKey) junctionVisits++;
  }
  assert.strictEqual(junctionVisits, pathCount, 'head must pass through the junction once per path');

  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index];
    assert.strictEqual(frame.snakeBody.length, snakeLength);
    assert(frame.snakeAlive);

    for (let seg = 1; seg < frame.snakeBody.length; seg++) {
      assert(
        isAdjacent(frame.snakeBody[seg - 1], frame.snakeBody[seg]),
        `snake body must stay connected in frame ${index}`,
      );
    }

    const bodyKeys = frame.snakeBody.map(coordinateKey);
    assert.strictEqual(new Set(bodyKeys).size, bodyKeys.length, `overlap in frame ${index}`);

    const eatenKeys = new Set();
    for (let k = 0; k < eatTrailSteps; k++) {
      const idx = (index - k + frames.length) % frames.length;
      eatenKeys.add(coordinateKey(frames[idx].snakeBody[0]));
    }
    for (const key of contributions) {
      assert.strictEqual(
        frame.foodSet.has(key),
        !eatenKeys.has(key),
        `food state mismatch for ${key} in frame ${index}`,
      );
    }
  }

  // Seamless loop boundary: last frame advances into the first with one step.
  const last = frames[frames.length - 1];
  const first = frames[0];
  assert(
    isAdjacent(last.snakeBody[0], first.snakeBody[0]),
    'last frame head must be adjacent to first frame head',
  );
  for (let seg = 0; seg + 1 < snakeLength; seg++) {
    assert.deepStrictEqual(
      first.snakeBody[seg + 1],
      last.snakeBody[seg],
      'body must shift by exactly one segment across the loop boundary',
    );
  }
}

testGeneratePathIsSelfAvoiding();
testSeamlessMultiplePaths();

console.log('All game engine regression tests passed.');
