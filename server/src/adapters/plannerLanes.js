// Planner ablation lanes. All four share one planner (see planner.js) and differ only in who
// chooses the move, so comparing them shows what the chooser adds on top of the search:
//
//   planner-only    no model: plays the planner's own best move (upper bound)
//   planner-random  no model: random pick among the certified moves (any chooser gets this)
//   jev-planner     Jev picks, offered only the certified moves (cannot go wrong)
//   jev-hints       Jev picks from every allowed move, each labeled by the planner; it can pick
//                   a move that is not certified, so it can lose moves or run out of them
//
// Model latency is Jev's call only (0 for the no-model baselines). Planner time is logged per
// move as planner.ms and counted in wall time.
import { Worker } from 'node:worker_threads';
import { MOVE_DESCRIPTIONS, mulberry32 } from '../../../shared/cube.js';
import { CONFIG } from '../config.js';
import { postDecision } from './decisions.js';

let worker = null;
let nextId = 0;
const pending = new Map();

function plannerWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('../plannerWorker.js', import.meta.url));
  worker.unref();
  worker.on('message', ({ id, result, error }) => {
    const p = pending.get(id);
    pending.delete(id);
    if (error) p?.reject(new Error(error));
    else p?.resolve(result);
  });
  worker.on('error', (err) => {
    for (const p of pending.values()) p.reject(err);
    pending.clear();
    worker = null;
  });
  return worker;
}

export function certify(facelets, allowed) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    plannerWorker().postMessage({ id, facelets, allowed });
  });
}

export const warmPlanner = () => certify('UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB', []).catch(() => {});

const plural = (n) => `${n} move${n === 1 ? '' : 's'}`;

function plannerLog(plan, offered) {
  return {
    ms: Math.round(plan.ms),
    method: plan.method,
    remaining: plan.remaining,
    offered,
    certified: plan.labels.filter((l) => l.certified).map((l) => l.move),
  };
}

const PLANNER = 'exact search (<= 8 moves) / Kociemba two-phase look-ahead';

async function askJev(state, plan, instructions, options, timeoutMs) {
  const criteria = Object.fromEntries(options.map(([move, text]) => [move, `${MOVE_DESCRIPTIONS[move]}. ${text}`]));
  const r = await postDecision({
    url: CONFIG.jev.url,
    token: CONFIG.jev.apiKey,
    model: CONFIG.jev.model,
    state: { ...state, solver_remaining_moves: plan.remaining },
    question: { type: 'choice', instructions, criteria },
    timeoutMs,
  });
  return { ...r, wallMs: r.wallMs + plan.ms, planner: plannerLog(plan, options.map(([m]) => m)) };
}

export const jevPlanner = {
  id: 'jev-planner',
  configured: () => Boolean(CONFIG.jev.apiKey),
  describe: () => ({ route: 'TypeSafe System One API, offered only solver-certified moves', model: CONFIG.jev.model, planner: PLANNER }),
  async decide({ state, timeoutMs }) {
    const plan = await certify(state.cube_facelets, state.allowed_moves);
    const options = plan.candidates.map(({ move, remainingAfter }) => [
      move,
      `Certified: after this turn the cube is ${plural(remainingAfter)} from solved (closer).`,
    ]);
    return askJev(
      state,
      plan,
      "You are solving a 3x3 Rubik's Cube one move at a time. Every option below was checked by a solver and brings the cube closer to solved. Choose the single next move.",
      options,
      timeoutMs,
    );
  },
};

export const jevHints = {
  id: 'jev-hints',
  configured: () => Boolean(CONFIG.jev.apiKey),
  describe: () => ({ route: 'TypeSafe System One API, every allowed move labeled by the solver', model: CONFIG.jev.model, planner: PLANNER }),
  async decide({ state, timeoutMs }) {
    const plan = await certify(state.cube_facelets, state.allowed_moves);
    const options = plan.labels.map(({ move, remainingAfter, certified }) => [
      move,
      certified
        ? `CLOSER: after this turn the cube is ${plural(remainingAfter)} from solved.`
        : remainingAfter > plan.remaining
          ? `FARTHER: after this turn the cube is about ${plural(remainingAfter)} from solved.`
          : `NO PROGRESS: after this turn the cube is still about ${plural(Math.max(remainingAfter, plan.remaining))} from solved.`,
    ]);
    return askJev(
      state,
      plan,
      `You are solving a 3x3 Rubik's Cube one move at a time. The cube is now ${plural(plan.remaining)} from solved. ` +
        'A solver has labeled every option with where the cube ends up after that move. Choose the move that brings the cube closest to solved.',
      options,
      timeoutMs,
    );
  },
};

// Baselines: no model call, so model latency is 0 and only planner time is spent.
function baseline(id, route, pick) {
  return {
    id,
    configured: () => true,
    describe: () => ({ route, model: 'none', planner: PLANNER }),
    async decide({ state }) {
      const plan = await certify(state.cube_facelets, state.allowed_moves);
      const move = pick(plan.candidates, state);
      return { move, latencyMs: 0, wallMs: plan.ms, modelVersion: 'none', planner: plannerLog(plan, plan.candidates.map((c) => c.move)) };
    },
  };
}

// Seeded by the state, so a repeat of the same puzzle replays the same choices.
const seedOf = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

export const plannerOnly = baseline('planner-only', 'Planner alone (no model): plays its own best move', (c) => c[0].move);
export const plannerRandom = baseline(
  'planner-random',
  'Planner + random chooser (no model): random certified move',
  (c, state) => c[Math.floor(mulberry32(seedOf(state.cube_facelets + state.moves_used))() * c.length)].move,
);
