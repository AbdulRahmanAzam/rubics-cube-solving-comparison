import { test } from 'node:test';
import assert from 'node:assert/strict';
import Cube from 'cubejs';
import { MOVES, SOLVED, allowedMoves, applyMove, applyMoves, invertMove, isSolved, mulberry32, randomScramble } from '../../shared/cube.js';
import { exactDistance } from '../src/solver.js';

test('every move matches cubejs', () => {
  for (const m of MOVES) assert.equal(applyMove(SOLVED, m), new Cube().move(m).asString(), m);
});

test('random sequences match cubejs and invert to solved', () => {
  const rng = mulberry32(1);
  for (let i = 0; i < 200; i++) {
    const seq = randomScramble(20, rng);
    const s = applyMoves(SOLVED, seq);
    assert.equal(s, new Cube().move(seq.join(' ')).asString());
    assert.ok(isSolved(applyMoves(s, [...seq].reverse().map(invertMove))));
  }
});

// Brute-force iterative deepening as an independent check of the meet-in-the-middle solver.
function bruteDistance(state, max) {
  const dfs = (s, depth, prev) => {
    if (isSolved(s)) return true;
    if (depth === 0) return false;
    return MOVES.some((m) => m[0] !== prev && dfs(applyMove(s, m), depth - 1, m[0]));
  };
  for (let d = 0; d <= max; d++) if (dfs(state, d, null)) return d;
  return null;
}

test('exact solver agrees with brute force up to depth 5', () => {
  const rng = mulberry32(99);
  for (let len = 0; len <= 5; len++) {
    for (let i = 0; i < 4; i++) {
      const s = applyMoves(SOLVED, randomScramble(len, rng));
      assert.equal(exactDistance(s), bruteDistance(s, 5), `len ${len}`);
    }
  }
});

test('allowed moves exclude only the previous face', () => {
  assert.deepEqual(allowedMoves([]), MOVES);
  const after = allowedMoves(['R', "U'"]);
  assert.equal(after.length, 15);
  assert.ok(after.every((m) => m[0] !== 'U'));
  assert.ok(after.includes('R'));
});
