// Small worker pool for the runner's per-move distance check. A deep state takes ~150 ms of
// synchronous search; on the main thread that stalled every lane's move events and the next
// model calls, so fast models (Jev) were held back by the slow bookkeeping of all lanes.
import { Worker } from 'node:worker_threads';
import os from 'node:os';

const SIZE = Number(process.env.DISTANCE_POOL_SIZE ?? Math.max(1, Math.min(3, os.cpus().length - 2)));
const workers = [];
const pending = new Map();
let nextId = 0;
let turn = 0;

function spawn() {
  const w = new Worker(new URL('./distanceWorker.js', import.meta.url));
  w.unref();
  w.on('message', ({ id, distance }) => {
    pending.get(id)?.(distance);
    pending.delete(id);
  });
  w.on('error', (err) => {
    console.error('distance worker failed:', err.message);
    workers.splice(workers.indexOf(w), 1);
    // Never leave a trial waiting: unanswered lookups become "distance unknown".
    for (const resolve of pending.values()) resolve(null);
    pending.clear();
  });
  workers.push(w);
}

export function warmDistancePool() {
  while (workers.length < SIZE) spawn();
}

// Exact distance to solved (null when more than 8 moves away), computed in a worker.
export function distanceAsync(facelets) {
  warmDistancePool();
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    workers[turn++ % workers.length].postMessage({ id, facelets });
  });
}
