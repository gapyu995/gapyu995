const assert = require('assert');
const {
  coordinateKey,
  isAdjacent,
  findShortestPath,
  safestMove,
  runSimulation,
  DEFAULT_SIMULATION_OPTIONS,
} = require('./gameEngine');

function testFindShortestPath() {
  const body = [{ row: 0, col: 0 }, { row: 0, col: -1 }];
  const direction = { dr: 0, dc: 1 };
  const path = findShortestPath(body, direction, body[0], '0,3', 3, 4);
  assert(Array.isArray(path));
  assert.strictEqual(path.length, 3);
  assert.deepStrictEqual(path[0], { row: 0, col: 1 });
}

function testSafestMove() {
  const body = [{ row: 1, col: 1 }, { row: 1, col: 0 }, { row: 0, col: 0 }];
  const direction = { dr: 0, dc: 1 };
  const move = safestMove(body, direction, body[0], 3, 3);
  assert(move, 'a safe move should exist');
  assert(isAdjacent(body[0], move));
}

function testRunSimulationSeamless() {
  const contributions = new Set(['0,0', '1,2', '2,4', '3,1', '4,3', '5,0']);
  const contributionWeights = new Map([
    ['0,0', 1],
    ['1,2', 2],
    ['2,4', 4],
    ['3,1', 1],
    ['4,3', 3],
    ['5,0', 2],
  ]);

  const { frames, totalSteps } = runSimulation(contributions, {
    ...DEFAULT_SIMULATION_OPTIONS,
    gridRows: 6,
    gridCols: 5,
    minSnakeLength: 2,
    shrinkInterval: 6,
    foodRegenerateSteps: 20,
    maxSimulationSteps: 800,
    seed: 12345,
    contributionWeights,
  });

  assert.strictEqual(frames.length, totalSteps);
  assert(frames.length > 20, 'the cycle should be long enough to be meaningful');

  let minSeen = Infinity;
  let maxSeen = 0;
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index];
    const length = frame.snakeBody.length;
    minSeen = Math.min(minSeen, length);
    maxSeen = Math.max(maxSeen, length);

    assert(length >= 1 && length <= contributions.size, `length out of bounds in frame ${index}`);

    for (let seg = 1; seg < length; seg++) {
      assert(isAdjacent(frame.snakeBody[seg - 1], frame.snakeBody[seg]), `disconnected in frame ${index}`);
    }
    const keys = frame.snakeBody.map(coordinateKey);
    assert.strictEqual(new Set(keys).size, keys.length, `overlap in frame ${index}`);
  }
  assert(maxSeen > minSeen, 'snake length should vary');
}

testFindShortestPath();
testSafestMove();
testRunSimulationSeamless();

console.log('All game engine regression tests passed.');
