// Runs the planner off the main thread so its CPU time never delays other models' timed calls.
// Requests are handled one at a time: planner lanes run in parallel but share one solver pool,
// and the first lane to reach a new state leaves its plan cached for the others.
import { parentPort } from 'node:worker_threads';
import { certifiedMoves, warmPlanner } from './planner.js';
import { warmPool } from './solverPool.js';

warmPlanner();
warmPool();
let queue = Promise.resolve();
parentPort.on('message', ({ id, facelets, allowed }) => {
  queue = queue.then(async () => {
    try {
      const t = performance.now();
      const result = await certifiedMoves(facelets, allowed);
      parentPort.postMessage({ id, result: { ...result, ms: performance.now() - t } });
    } catch (err) {
      parentPort.postMessage({ id, error: err.message });
    }
  });
});
