// Seeded, saved test suite: every model and every repeat gets byte-identical start states.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { SOLVED, applyMoves, mulberry32, randomScramble } from '../../shared/cube.js';
import { CONFIG } from './config.js';
import { exactDistance, kociembaLength } from './solver.js';

const SUITE_DIR = path.join(CONFIG.dataDir, 'suites');

// Assignment section 6. Warm-up and primary scrambles are kept only when their exact
// distance equals the scramble length, so "4-5 turns" really means 4-5 moves from solved.
export const SUITE_SPEC = [
  { tier: 'warmup', lengths: [3, 3, 4] },
  { tier: 'primary', lengths: [4, 4, 4, 4, 4, 5, 5, 5, 5, 5] },
  { tier: 'extension', lengths: [15, 18, 20] },
];

export async function generateSuite({ id = 'main', seed = 20261022 } = {}) {
  const rng = mulberry32(seed);
  const puzzles = [];
  const seen = new Set();
  for (const { tier, lengths } of SUITE_SPEC) {
    for (const [i, len] of lengths.entries()) {
      let scramble, facelets, optimal;
      for (;;) {
        scramble = randomScramble(len, rng);
        facelets = applyMoves(SOLVED, scramble);
        optimal = exactDistance(facelets);
        if (seen.has(facelets)) continue;
        if (tier === 'extension' || optimal === len) break;
      }
      seen.add(facelets);
      const exact = optimal != null;
      puzzles.push({
        id: `${tier}-${String(i + 1).padStart(2, '0')}`,
        tier,
        scrambleLength: len,
        scramble, // server-side only, never sent to models or the client
        facelets,
        // The scramble itself is also a solution, so the bound is the shorter of the two.
        optimal: exact ? optimal : Math.min(len, await kociembaLength(facelets)),
        optimalIsExact: exact,
        optimalMethod: exact ? 'exact search (meet-in-the-middle, HTM)' : 'Kociemba two-phase upper bound',
      });
    }
  }
  const suite = { id, seed, createdAt: new Date().toISOString(), metric: 'HTM (18 face turns)', puzzles };
  mkdirSync(SUITE_DIR, { recursive: true });
  writeFileSync(path.join(SUITE_DIR, `${id}.json`), JSON.stringify(suite, null, 2));
  return suite;
}

export function loadSuite(id = 'main') {
  const file = path.join(SUITE_DIR, `${id}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

export const publicPuzzle = ({ scramble, ...p }) => p;
