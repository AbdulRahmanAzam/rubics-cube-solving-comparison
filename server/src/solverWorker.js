// One two-phase solver (see solverPool.js). Answers { solution: [...] } or { solution: null }.
import Cube from 'cubejs';
import { parentPort } from 'node:worker_threads';

Cube.initSolver();
parentPort.postMessage({ ready: true });
parentPort.on('message', ({ facelets, depth }) => {
  let solution = null;
  try {
    const s = Cube.fromString(facelets).solve(depth).trim();
    solution = s ? s.split(/\s+/) : [];
  } catch {
    // cubejs throws when no solution exists within `depth` moves
  }
  parentPort.postMessage({ solution });
});
