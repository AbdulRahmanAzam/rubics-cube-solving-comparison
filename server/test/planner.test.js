import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { SOLVED, allowedMoves, applyMove, applyMoves, isSolved, mulberry32, randomScramble } from '../../shared/cube.js';
import { exactDistance } from '../src/solver.js';

process.env.PLANNER_BUDGET_MS ??= '3000';
const { certifiedMoves } = await import('../src/planner.js');
after(() => setImmediate(() => process.exit(0))); // solver pool workers keep the process alive

// Any choice among certified moves must finish within the move limit.
async function play(facelets, rng) {
  const history = [];
  let s = facelets;
  while (!isSolved(s) && history.length < 30) {
    const { candidates } = await certifiedMoves(s, allowedMoves(history));
    assert.ok(candidates.length > 0);
    const move = candidates[Math.floor(rng() * candidates.length)].move;
    s = applyMove(s, move);
    history.push(move);
  }
  return { solved: isSolved(s), moves: history.length };
}

test('short scrambles are solved in the exact optimum', async () => {
  const rng = mulberry32(3);
  for (let i = 0; i < 5; i++) {
    const s = applyMoves(SOLVED, randomScramble(5, rng));
    const r = await play(s, rng);
    assert.equal(r.solved, true);
    assert.equal(r.moves, exactDistance(s));
  }
});

test('deep scrambles are solved within 22 moves whatever the chooser picks', async () => {
  const rng = mulberry32(4);
  for (let i = 0; i < 3; i++) {
    const r = await play(applyMoves(SOLVED, randomScramble(25, rng)), rng);
    assert.equal(r.solved, true);
    assert.ok(r.moves <= 22, `${r.moves} moves`);
  }
});
