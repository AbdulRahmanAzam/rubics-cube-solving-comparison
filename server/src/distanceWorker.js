// Exact distance search off the main thread (see distancePool.js). Answers { id, distance }.
import { parentPort } from 'node:worker_threads';
import { exactDistance, warmSolver } from './solver.js';

warmSolver();
parentPort.on('message', ({ id, facelets }) => {
  parentPort.postMessage({ id, distance: exactDistance(facelets) });
});
