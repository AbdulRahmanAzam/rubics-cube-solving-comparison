// Benchmark runner. One run = selected puzzles x repeats; on each puzzle all models play
// in parallel from the same start state under the same rules.
//
// Policy (identical for every model):
// - Transport errors (network, HTTP 429/5xx, timeouts, CLI crash) are retried up to
//   CONFIG.maxRetries times with backoff. Retries are counted; their time is not model time.
//   If retries run out, or the error is not retryable (auth, usage limit), the trial ends
//   with status 'error' and is excluded from solve-rate statistics (and shown separately).
// - A malformed answer (unparseable, or not in state.allowed_moves) is logged with its raw
//   text and the model is asked once more. If the second answer is also malformed, the turn
//   is used up with no state change. Malformed answers are never converted into moves.
// - Move latency = model time of the answers given for that turn (re-asks included).
// - Move tokens = provider-reported tokens of the answers given for that turn (re-asks included).
// - The move limit ends a trial as 'limit' (unsolved). An optional time limit ends it as 'timeout'.
// - The exact distance after each move is bookkeeping only: it runs in worker threads and
//   arrives as a separate 'distance' event, so it never delays a model's next turn.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { applyMove, isSolved } from '../../shared/cube.js';
import { sumTokens, tokensOf } from '../../shared/tokens.js';
import { CONFIG } from './config.js';
import { ADAPTERS } from './adapters/index.js';
import { buildState } from './prompt.js';
import { distanceAsync } from './distancePool.js';
import { publicPuzzle } from './suite.js';

const RUN_DIR = path.join(CONFIG.dataDir, 'runs');
mkdirSync(RUN_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PUZZLE_HOLD_MS = Number(process.env.PUZZLE_HOLD_MS ?? 6000);

const runs = new Map();
let activeRun = null;

export const getActiveRun = () => activeRun;
export const getRun = (id) => runs.get(id) ?? loadRunFile(id);

function loadRunFile(id) {
  const file = path.join(RUN_DIR, `${id}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

export function listRuns() {
  return readdirSync(RUN_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const r = JSON.parse(readFileSync(path.join(RUN_DIR, f), 'utf8'));
      const { events, trials, ...meta } = r;
      return { ...meta, trialCount: trials.length };
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

// All finished trials from every saved run (the dashboard's single source of truth).
export function allTrials() {
  return readdirSync(RUN_DIR)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => JSON.parse(readFileSync(path.join(RUN_DIR, f), 'utf8')).trials)
    .map(({ moveLog, ...t }) => (t.inputTokens === undefined && moveLog ? { ...t, ...trialTokens(moveLog) } : t));
}

function save(run) {
  const { subscribers, controller, t0, ...data } = run;
  writeFileSync(path.join(RUN_DIR, `${run.id}.json`), JSON.stringify(data));
}

function emit(run, event) {
  const e = { ...event, t: Math.round(performance.now() - run.t0), seq: run.events.length };
  run.events.push(e);
  for (const send of run.subscribers) send(e);
}

async function askModel(adapter, state, run) {
  let retries = 0;
  const answers = [];
  for (;;) {
    if (run.controller.signal.aborted) return { stopped: true, retries, answers };
    let r;
    try {
      r = await adapter.decide({ state, timeoutMs: CONFIG.callTimeoutMs });
    } catch (err) {
      if (err.retryable !== false && retries < CONFIG.maxRetries) {
        await sleep(CONFIG.retryBackoffMs[retries] ?? 3000);
        retries++;
        continue;
      }
      return { error: err.message, retries, answers };
    }
    answers.push(r);
    if (state.allowed_moves.includes(r.move)) return { ok: r, retries, answers };
    if (answers.length >= 2) return { malformed: r, retries, answers };
  }
}

// Token totals of one trial. Older saved moves have only `usage` (final answer of the turn).
export function trialTokens(moveLog) {
  const t = sumTokens(moveLog.map((m) => m.tokens ?? tokensOf(m.usage)));
  return { inputTokens: t?.input ?? null, outputTokens: t?.output ?? null, reasoningTokens: t?.reasoning ?? null };
}

async function playTrial(run, modelId, puzzle, repeat) {
  const adapter = ADAPTERS[modelId];
  const limit = CONFIG.moveLimit;
  let state = puzzle.facelets;
  const applied = [];
  const moveLog = [];
  let turns = 0;
  let modelMs = 0;
  let retries = 0;
  let malformed = 0;
  let improving = 0;
  let certifiedPicks = 0;
  // Distance lookups run in workers while the model keeps playing; awaited at trial end.
  let distance = puzzle.optimalIsExact ? Promise.resolve(puzzle.optimal) : distanceAsync(state);
  const lookups = [];
  let status = 'limit';
  let error = null;
  let modelVersion = null;
  const wallStart = performance.now();

  while (turns < limit) {
    if (run.controller.signal.aborted) {
      status = 'stopped';
      break;
    }
    if (CONFIG.trialTimeLimitMs && modelMs >= CONFIG.trialTimeLimitMs) {
      status = 'timeout';
      break;
    }

    emit(run, { type: 'thinking', model: modelId });
    const input = buildState({ facelets: state, history: applied, movesUsed: turns, moveLimit: limit });
    const res = await askModel(adapter, input, run);
    retries += res.retries;
    if (res.stopped) {
      status = 'stopped';
      break;
    }
    if (res.error) {
      status = 'error';
      error = res.error;
      break;
    }

    turns++;
    const latencyMs = res.answers.reduce((a, r) => a + (r.latencyMs ?? 0), 0);
    const wallMs = res.answers.reduce((a, r) => a + (r.wallMs ?? 0), 0);
    const tokens = sumTokens(res.answers.map((r) => tokensOf(r.usage)));
    modelMs += latencyMs;
    const bad = res.answers.filter((r) => !input.allowed_moves.includes(r.move));
    malformed += bad.length;
    const final = res.ok ?? res.malformed;
    modelVersion = final.modelVersion ?? modelVersion;

    const valid = Boolean(res.ok);
    const distanceBefore = distance;
    if (valid) {
      state = applyMove(state, res.ok.move);
      applied.push(res.ok.move);
      distance = distanceAsync(state);
      if (res.ok.planner?.certified.includes(res.ok.move)) certifiedPicks++;
    }

    const entry = {
      step: turns,
      move: valid ? res.ok.move : null,
      valid,
      raw: valid ? undefined : String(final.raw ?? final.move ?? '').slice(0, 300),
      malformedAnswers: bad.map((r) => String(r.raw ?? r.move ?? '').slice(0, 300)),
      latencyMs,
      wallMs,
      confidence: final.confidence ?? null,
      probabilities: final.probabilities ?? null,
      usage: final.usage ?? null,
      tokens,
      toolCalls: final.toolCalls ?? undefined,
      planner: final.planner ?? undefined,
      distanceBefore: null,
      distanceAfter: null,
    };
    moveLog.push(entry);
    emit(run, { type: 'move', model: modelId, ...entry });
    lookups.push(
      Promise.all([distanceBefore, distance]).then(([before, after]) => {
        entry.distanceBefore = before;
        entry.distanceAfter = after;
        if (valid && before != null && after != null && after < before) improving++;
        emit(run, { type: 'distance', model: modelId, step: entry.step, distanceBefore: before, distanceAfter: after });
      }),
    );

    if (isSolved(state)) {
      status = 'solved';
      break;
    }
  }

  await Promise.all(lookups);
  distance = await distance;

  const trial = {
    runId: run.id,
    source: 'live',
    model: modelId,
    config: adapter.describe(),
    modelVersion,
    puzzleId: puzzle.id,
    tier: puzzle.tier,
    repeat,
    optimal: puzzle.optimal,
    optimalIsExact: puzzle.optimalIsExact,
    status,
    error,
    moves: turns,
    validMoves: applied.length,
    totalMs: modelMs,
    wallMs: performance.now() - wallStart,
    latencies: moveLog.map((m) => m.latencyMs),
    ...trialTokens(moveLog),
    malformed,
    retries,
    improvingMoves: improving,
    // Planner lanes only: moves that were on the planner's certified list.
    certifiedPicks: moveLog.some((m) => m.planner) ? certifiedPicks : undefined,
    finalDistance: distance,
    moveLog,
    at: new Date().toISOString(),
  };
  emit(run, { type: 'trial_end', model: modelId, status, moves: turns, totalMs: modelMs, retries, malformed, error, trial: { ...trial, moveLog: undefined } });
  if (status !== 'stopped') run.trials.push(trial);
  save(run);
}

export function startRun({ suite, puzzleIds, models, repeats = 1 }) {
  if (activeRun) throw new Error(`run ${activeRun.id} is still running`);
  const puzzles = puzzleIds.map((id) => suite.puzzles.find((p) => p.id === id)).filter(Boolean);
  if (!puzzles.length) throw new Error('no puzzles selected');
  const unknown = models.filter((m) => !ADAPTERS[m]);
  if (unknown.length) throw new Error(`unknown models: ${unknown.join(', ')}`);

  const id = new Date().toISOString().replace(/[:.]/g, '-');
  const run = {
    id,
    suiteId: suite.id,
    puzzleIds: puzzles.map((p) => p.id),
    models,
    repeats,
    policy: {
      moveLimit: CONFIG.moveLimit,
      callTimeoutMs: CONFIG.callTimeoutMs,
      trialTimeLimitMs: CONFIG.trialTimeLimitMs,
      maxRetries: CONFIG.maxRetries,
      malformedReasks: 1,
    },
    modelConfigs: Object.fromEntries(models.map((m) => [m, ADAPTERS[m].describe()])),
    status: 'running',
    startedAt: new Date().toISOString(),
    events: [],
    trials: [],
    t0: performance.now(),
    subscribers: new Set(),
    controller: new AbortController(),
  };
  runs.set(id, run);
  activeRun = run;

  (async () => {
    const total = puzzles.length * repeats;
    emit(run, { type: 'run_start', runId: id, source: 'live', total, models, moveLimit: CONFIG.moveLimit });
    let index = 0;
    try {
      for (let r = 1; r <= repeats; r++) {
        for (const puzzle of puzzles) {
          if (run.controller.signal.aborted) break;
          emit(run, { type: 'puzzle_start', puzzle: publicPuzzle(puzzle), index: index++, repeat: r });
          await Promise.all(models.map((m) => playTrial(run, m, puzzle, r)));
          if (index < total && !run.controller.signal.aborted) await sleep(PUZZLE_HOLD_MS);
        }
      }
      run.status = run.controller.signal.aborted ? 'stopped' : 'done';
    } catch (err) {
      run.status = 'failed';
      run.error = err.message;
      console.error(err);
    } finally {
      run.finishedAt = new Date().toISOString();
      emit(run, { type: 'run_end', status: run.status });
      save(run);
      activeRun = null;
    }
  })();

  return run;
}

export function stopRun(id) {
  const run = runs.get(id);
  if (!run || run.status !== 'running') return false;
  run.controller.abort();
  return true;
}
