// Pool of two-phase solver workers that can be killed. cubejs search is synchronous and a
// tight depth limit can run for minutes, so a race is the only way to bound it: every worker
// still busy when a race ends is terminated and replaced.
import { Worker } from 'node:worker_threads';
import os from 'node:os';

const SIZE = Number(process.env.SOLVER_POOL_SIZE ?? Math.max(2, Math.min(6, os.cpus().length - 2)));
const pool = [];

function spawn() {
  const w = new Worker(new URL('./solverWorker.js', import.meta.url));
  const slot = { worker: w, ready: new Promise((r) => w.once('message', r)) };
  w.on('error', () => replace(slot));
  pool.push(slot);
  return slot;
}

function replace(slot) {
  const i = pool.indexOf(slot);
  if (i < 0) return;
  pool.splice(i, 1);
  slot.worker.terminate();
  spawn();
}

export function warmPool() {
  while (pool.length < SIZE) spawn();
}

// Solves the given states (all views of one cube) with at most `depth` moves.
// Resolves { index, solution } for the first view solved, or null when the time runs out.
export async function solveWithin(states, depth, timeMs) {
  warmPool();
  return new Promise((resolve) => {
    let next = 0;
    let done = false;
    const running = new Set();
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (const slot of running) replace(slot);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), Math.max(0, timeMs));
    const feed = async (slot) => {
      await slot.ready;
      while (!done && next < states.length) {
        const index = next++;
        running.add(slot);
        const msg = await new Promise((r) => {
          slot.worker.once('message', r);
          slot.worker.postMessage({ facelets: states[index], depth });
        });
        running.delete(slot);
        if (done) return;
        if (msg.solution && msg.solution.length <= depth) return finish({ index, solution: msg.solution });
      }
      if (!done && next >= states.length && running.size === 0) finish(null);
    };
    for (const slot of [...pool]) feed(slot);
  });
}
