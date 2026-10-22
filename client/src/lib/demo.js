// UI preview only. Emits the same events as the backend stream so the screens can be
// developed before the backend exists. It is deliberately neutral: every model plays
// uniformly random legal moves, so the demo never suggests which model is better.
// Demo trials are never stored or counted in any statistic (see store.js).
import { MOVES, SOLVED, applyMoves, applyMove, isSolved, mulberry32, randomScramble } from '@shared/cube.js';
import { DEFAULT_LINEUP, MOVE_LIMIT } from '@shared/models.js';

// Only to make the animation feel alive. Same distribution for every model.
const DEMO_LATENCY = { mean: 900, jitter: 400 };

const SCRAMBLE_LENGTHS = { warmup: [3, 4], primary: [4, 5], extension: [15, 20] };

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });
}

export function demoPuzzles(tier, count, seed = Date.now()) {
  const rng = mulberry32(seed);
  const [lo, hi] = SCRAMBLE_LENGTHS[tier];
  return Array.from({ length: count }, (_, i) => {
    const len = lo + Math.floor(rng() * (hi - lo + 1));
    return {
      id: `${tier}-${String(i + 1).padStart(2, '0')}`,
      tier,
      facelets: applyMoves(SOLVED, randomScramble(len, rng)),
      optimal: null, // exact distance comes from the backend solver
      optimalIsExact: false,
      scrambleLength: len,
    };
  });
}

async function playLane(model, puzzle, emit, getSpeed, signal) {
  const rng = mulberry32(Math.floor(Math.random() * 2 ** 31));
  let state = puzzle.facelets;
  let modelMs = 0;

  for (let step = 1; step <= MOVE_LIMIT; step++) {
    emit({ type: 'thinking', model });
    const latency = Math.max(100, DEMO_LATENCY.mean + (rng() * 2 - 1) * DEMO_LATENCY.jitter);
    await sleep(latency / getSpeed(), signal);
    modelMs += latency;

    const move = MOVES[Math.floor(rng() * MOVES.length)];
    state = applyMove(state, move);
    emit({ type: 'move', model, step, move, valid: true, latencyMs: latency });

    if (isSolved(state)) return emit({ type: 'trial_end', model, status: 'solved', moves: step, totalMs: modelMs });
  }
  emit({ type: 'trial_end', model, status: 'limit', moves: MOVE_LIMIT, totalMs: modelMs });
}

export async function runDemo({ tier, count }, emit, getSpeed, signal) {
  const puzzles = demoPuzzles(tier, count);
  emit({ type: 'run_start', runId: `demo-${Date.now()}`, source: 'demo', total: puzzles.length });
  try {
    for (const [index, puzzle] of puzzles.entries()) {
      emit({ type: 'puzzle_start', puzzle, index });
      await sleep(900 / getSpeed(), signal);
      // Only the lanes on screen: hidden optional lanes would take medal ranks.
      await Promise.all(DEFAULT_LINEUP.map((id) => playLane(id, puzzle, emit, getSpeed, signal)));
      if (index < puzzles.length - 1) await sleep(6000, signal); // hold the completion stage on screen
    }
  } catch (err) {
    if (err.name !== 'AbortError') throw err;
  } finally {
    emit({ type: 'run_end' });
  }
}
