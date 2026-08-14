const assert = require('assert');
const {
  coordinateKey,
  isAdjacent,
  buildHamiltonianCycle,
  buildLengthSchedule,
  resolveShrinkInterval,
  runSimulation,
  DEFAULT_SIMULATION_OPTIONS,
} = require('./gameEngine');

function testHamiltonianCycle() {
  const gridRows = 7;
  const gridCols = 54;
  const cycle = buildHamiltonianCycle(gridRows, gridCols);

  assert.strictEqual(cycle.length, gridRows * gridCols + 1);
  assert.deepStrictEqual(cycle[0], cycle[cycle.length - 1], 'cycle must close');

  const keys = cycle.map(coordinateKey);
  assert.strictEqual(new Set(keys.slice(0, -1)).size, gridRows * gridCols, 'visits every cell once');

  for (let index = 1; index < cycle.length; index++) {
    assert(isAdjacent(cycle[index - 1], cycle[index]), `cycle step ${index} must be adjacent`);
  }
}

function testLengthScheduleIsPeriodic() {
  const totalSteps = 20;
  const growthPoints = new Int32Array(totalSteps);
  growthPoints[2] = 4;

  const schedule = buildLengthSchedule(totalSteps, growthPoints, 10, 4, 3, 10);

  assert.strictEqual(schedule[0], 3);
  assert.strictEqual(schedule[2], 4);
  assert.strictEqual(schedule[totalSteps - 1], 3);
  for (let step = 0; step < totalSteps; step++) {
    assert(schedule[step] >= 3 && schedule[step] <= 10);
  }
}

function testResolveShrinkInterval() {
  const growthPoints = new Int32Array(100);
  for (let step = 0; step < 100; step += 5) growthPoints[step] = 4; // 20 growth segments
  assert.strictEqual(resolveShrinkInterval(0, 100, growthPoints, 4), 5);
  assert.strictEqual(resolveShrinkInterval(10, 100, growthPoints, 4), 10);
}

function testRunSimulationWithVariableLength() {
  const gridRows = 7;
  const gridCols = 12;
  const contributions = new Set([
    '0,0', '1,1', '2,3', '0,4', '3,1', '3,4', '5,10', '6,2', '2,8', '4,6',
  ]);
  const contributionWeights = new Map([
    ['0,0', 1],
    ['1,1', 2],
    ['2,3', 3],
    ['0,4', 4],
    ['3,1', 2],
    ['3,4', 1],
    ['5,10', 4],
    ['6,2', 1],
    ['2,8', 3],
    ['4,6', 2],
  ]);
  const minSnakeLength = 3;
  const eatTrailSteps = 5;

  const { frames, totalSteps } = runSimulation(contributions, {
    ...DEFAULT_SIMULATION_OPTIONS,
    gridRows,
    gridCols,
    minSnakeLength,
    eatTrailSteps,
    seed: 987654,
    contributionWeights,
  });

  assert.strictEqual(frames.length, gridRows * gridCols);
  assert.strictEqual(totalSteps, gridRows * gridCols);

  let minSeen = Infinity;
  let maxSeen = 0;
  const eatenEver = new Set();

  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index];
    const length = frame.snakeBody.length;
    minSeen = Math.min(minSeen, length);
    maxSeen = Math.max(maxSeen, length);

    assert(length >= minSnakeLength, `frame ${index} shorter than minimum`);
    assert(length <= contributions.size, `frame ${index} exceeds the contribution cap`);

    for (let seg = 1; seg < length; seg++) {
      assert(isAdjacent(frame.snakeBody[seg - 1], frame.snakeBody[seg]), `disconnected in frame ${index}`);
    }

    const bodyKeys = frame.snakeBody.map(coordinateKey);
    assert.strictEqual(new Set(bodyKeys).size, bodyKeys.length, `overlap in frame ${index}`);

    const eatenKeys = new Set();
    for (let k = 0; k < eatTrailSteps; k++) {
      const idx = (index - k + frames.length) % frames.length;
      eatenKeys.add(coordinateKey(frames[idx].snakeBody[0]));
    }
    for (const key of eatenKeys) eatenEver.add(key);
    for (const key of contributions) {
      assert.strictEqual(
        frame.foodSet.has(key),
        !eatenKeys.has(key),
        `food state mismatch for ${key} in frame ${index}`,
      );
    }
  }

  assert(maxSeen > minSeen, 'snake length should vary (grow and shrink)');
  for (const key of contributions) {
    assert(eatenEver.has(key), `contribution ${key} should be eaten during the loop`);
  }

  // Seamless loop boundary.
  const last = frames[frames.length - 1];
  const first = frames[0];
  assert(isAdjacent(last.snakeBody[0], first.snakeBody[0]), 'boundary head must be adjacent');
  const overlap = Math.min(first.snakeBody.length, last.snakeBody.length);
  for (let seg = 0; seg + 1 < overlap; seg++) {
    assert.deepStrictEqual(first.snakeBody[seg + 1], last.snakeBody[seg], 'boundary body must shift by one');
  }
}

testHamiltonianCycle();
testLengthScheduleIsPeriodic();
testResolveShrinkInterval();
testRunSimulationWithVariableLength();

console.log('All game engine regression tests passed.');
