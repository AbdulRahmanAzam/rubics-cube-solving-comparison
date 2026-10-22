import { useMemo } from 'react';
import { MODELS, MODEL_BY_ID } from '@shared/models.js';
import { statsByModel, winners } from '@shared/stats.js';
import { useRace } from './store.js';

// The fair benchmark line-up. Planner ablation lanes get their own table and never enter the answers.
const BENCH = MODELS.filter((m) => !m.ablation);

// Only live trials ever reach the store, so every number here comes from real model calls.
export function useStats({ tier = 'all' } = {}) {
  const trials = useRace((s) => s.trials);
  return useMemo(() => {
    const filtered = trials.filter((t) => tier === 'all' || t.tier === tier);
    const stats = statsByModel(filtered, MODELS.map((m) => m.id));
    return {
      trials: filtered,
      stats,
      win: winners(Object.fromEntries(BENCH.map((m) => [m.id, stats[m.id]]))),
      puzzles: new Set(filtered.map((t) => `${t.runId}:${t.puzzleId}`)).size,
    };
  }, [trials, tier]);
}

const names = (ids) => {
  const n = ids.map((id) => MODEL_BY_ID[id].name);
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n.at(-1)}` : n.join('');
};

function fmtMs(v) {
  if (v == null) return 'n/a';
  return v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(2)} s`;
}

// Factual answers computed only from the measured data. They state numbers and sample
// sizes and never contain a pre-written verdict. Q5 is the student's own conclusion.
export function answers({ stats, win, trials }) {
  if (!trials.length) return QUESTIONS.map(() => 'No live results yet.');
  const s = (id) => stats[id];
  const withData = BENCH.filter((m) => s(m.id).trials > 0);
  const errorNote = BENCH.filter((m) => s(m.id).errors).map((m) => `${m.short} ${s(m.id).errors}`).join(', ');

  const q1 = win.fastest.length
    ? `${names(win.fastest)}: ${fmtMs(s(win.fastest[0]).avgLatencyMs)} per move on average. ` +
      `Others: ${withData
        .filter((m) => !win.fastest.includes(m.id))
        .map((m) => `${m.short} ${fmtMs(s(m.id).avgLatencyMs)}`)
        .join(', ')}.`
    : 'No latency data.';

  const rateList = withData.map((m) => `${m.short} ${s(m.id).solved}/${s(m.id).trials}`).join(', ');
  const q2 = win.highestSolveRate.length
    ? `${names(win.highestSolveRate)} at ${Math.round(s(win.highestSolveRate[0]).successRate)}%. Solved: ${rateList}.`
    : `No model solved any puzzle within 30 moves (${rateList}).`;

  const gapList = withData
    .filter((m) => s(m.id).gapSamples)
    .map((m) => `${m.short} +${s(m.id).avgGap.toFixed(2)} over ${s(m.id).gapSamples} solve${s(m.id).gapSamples > 1 ? 's' : ''}`)
    .join(', ');
  const q3 = win.smallestGap.length
    ? `${names(win.smallestGap)}: on average ${s(win.smallestGap[0]).avgGap.toFixed(2)} moves above the exact shortest solution. All: ${gapList}.` +
      (win.smallestGap.some((id) => s(id).gapSamples < 3) ? ' Small sample, treat with caution.' : '')
    : 'No solved puzzle with a known exact optimum, so no gap can be computed.';

  let q4;
  if (!win.fastest.length) q4 = 'No data.';
  else if (!win.highestSolveRate.length) q4 = `No model solved a puzzle, so speed cannot be traded against quality here.`;
  else {
    const overlap = win.fastest.filter((id) => win.highestSolveRate.includes(id));
    q4 = overlap.length
      ? `Yes: ${names(overlap)} was both the fastest and had the highest solve rate.`
      : `No: the fastest (${names(win.fastest)}) did not have the highest solve rate (${names(win.highestSolveRate)}).`;
  }

  const q2full = errorNote ? `${q2} Excluded API-error trials: ${errorNote}.` : q2;
  return [q1, q2full, q3, q4, null];
}

export const QUESTIONS = [
  'Which model is fastest in terms of making decisions?',
  'Which model achieved the highest solve rate?',
  'Which model found the shortest solutions, and how close were they to the known optimum?',
  'Did the fastest model also achieve the best solution quality?',
  'Would you use the fastest decision model, the frontier LLM, or a hybrid agent in a real-world application?',
];
