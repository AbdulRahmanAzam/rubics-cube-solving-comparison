import { create } from 'zustand';
import { DEFAULT_LINEUP, MODELS, MOVE_LIMIT } from '@shared/models.js';
import { sumTokens, tokensOf } from '@shared/tokens.js';

// Race state is driven entirely by events, so live runs (SSE), replays of saved runs and the
// UI preview all go through the same reducer.
//
// Events:
//   run_start    { runId, source: 'live'|'replay'|'demo', total, models? }
//   puzzle_start { puzzle: { id, tier, facelets, optimal, optimalIsExact, scrambleLength }, index }
//   thinking     { model }
//   move         { model, step, move, valid, raw?, latencyMs, confidence?, probabilities?, distanceAfter?, usage?, tokens? }
//   distance     { model, step, distanceBefore, distanceAfter } (arrives after its move; older runs
//                carry the distance inside the move event instead)
//   trial_end    { model, status: 'solved'|'limit'|'timeout'|'error'|'stopped', moves, totalMs, retries, malformed, error?, trial? }
//   run_end      {}
//
// Statistics only ever use trial records produced by the server for live runs.

const freshLane = () => ({
  status: 'idle',
  moves: [],
  modelMs: 0,
  tokens: null, // { input, output, reasoning } summed over the lane's moves; null = not reported
  thinkingSince: null,
  totalMs: null,
  rank: null,
  malformed: 0,
  retries: 0,
  error: null,
});

const freshLanes = () => Object.fromEntries(MODELS.map((m) => [m.id, freshLane()]));

export const useRace = create((set, get) => ({
  source: null,
  runId: null,
  running: false,
  speed: 1,
  lineup: DEFAULT_LINEUP,
  moveLimit: MOVE_LIMIT,
  puzzle: null,
  puzzleIndex: 0,
  puzzleTotal: 0,
  lanes: freshLanes(),
  nextRank: { best: 1, worst: DEFAULT_LINEUP.length },
  trials: [],

  setSpeed: (speed) => set({ speed }),
  setTrials: (trials) => set({ trials }),

  dispatch: (e) => {
    const lane = (id) => get().lanes[id];
    const patchLane = (id, patch) => set({ lanes: { ...get().lanes, [id]: { ...get().lanes[id], ...patch } } });

    switch (e.type) {
      case 'run_start': {
        const lineup = e.models ?? DEFAULT_LINEUP;
        set({ source: e.source, runId: e.runId, running: true, puzzleTotal: e.total, puzzleIndex: 0, lineup, moveLimit: e.moveLimit ?? MOVE_LIMIT });
        break;
      }

      case 'puzzle_start':
        set({
          puzzle: e.puzzle,
          puzzleIndex: e.index,
          lanes: freshLanes(),
          nextRank: { best: 1, worst: get().lineup.length },
        });
        break;

      case 'thinking':
        patchLane(e.model, { status: 'thinking', thinkingSince: performance.now() });
        break;

      case 'move': {
        const l = lane(e.model);
        patchLane(e.model, {
          moves: [...l.moves, e],
          modelMs: l.modelMs + (e.latencyMs ?? 0),
          // Older saved runs carry only `usage` on the move.
          tokens: sumTokens([l.tokens, e.tokens ?? tokensOf(e.usage)]),
          thinkingSince: null,
          malformed: l.malformed + (e.valid ? 0 : 1),
        });
        break;
      }

      case 'distance': {
        const moves = lane(e.model).moves;
        const i = moves.findIndex((m) => m.step === e.step);
        if (i < 0) break;
        const next = moves.slice();
        next[i] = { ...moves[i], distanceBefore: e.distanceBefore, distanceAfter: e.distanceAfter };
        patchLane(e.model, { moves: next });
        break;
      }

      case 'trial_end': {
        // Solvers take medals from the top in finishing order; unsolved lanes fill from the bottom.
        const { best, worst } = get().nextRank;
        const solved = e.status === 'solved';
        const ranked = e.status !== 'stopped' && e.status !== 'error';
        const rank = !ranked ? null : solved ? best : worst;
        if (ranked) set({ nextRank: solved ? { best: best + 1, worst } : { best, worst: worst - 1 } });
        patchLane(e.model, {
          status: e.status,
          totalMs: e.totalMs,
          thinkingSince: null,
          rank,
          retries: e.retries ?? 0,
          error: e.error ?? null,
        });
        if (get().source === 'live' && e.trial && e.status !== 'stopped') {
          set({ trials: [...get().trials, e.trial] });
        }
        break;
      }

      case 'run_end':
        set({ running: false });
        break;
    }
  },
}));

// Live clock of one lane: model time of finished moves plus the current think time.
export function laneClock(lane, speed, now) {
  if (lane.totalMs != null) return lane.totalMs;
  const thinking = lane.thinkingSince != null ? (now - lane.thinkingSince) * speed : 0;
  return lane.modelMs + thinking;
}
