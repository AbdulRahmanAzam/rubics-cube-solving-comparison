// Aggregate trial records into the per-model benchmark table (assignment section 3C + 7).
//
// Trial record shape (from the server):
// { model, puzzleId, tier, optimal, optimalIsExact, status: 'solved'|'limit'|'timeout'|'error',
//   moves, validMoves, totalMs, latencies: [ms...], malformed, retries, improvingMoves,
//   inputTokens, outputTokens, reasoningTokens }   (token totals null when the provider reported none)
//
// Trials that ended in 'error' (provider outage, usage limit, auth) say nothing about the
// model's cube solving, so they are left out of every rate and shown as a separate count.

const SCORED = new Set(['solved', 'limit', 'timeout']);

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function percentile(xs, p) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

export function modelStats(allTrials) {
  const trials = allTrials.filter((t) => SCORED.has(t.status));
  const latencies = trials.flatMap((t) => t.latencies);
  const solved = trials.filter((t) => t.status === 'solved');
  const gaps = solved.filter((t) => t.optimalIsExact && t.optimal != null).map((t) => t.moves - t.optimal);
  const exactTrials = trials.filter((t) => t.optimalIsExact);
  const exactMoves = exactTrials.reduce((a, t) => a + (t.validMoves ?? t.moves), 0);
  // Tokens per move, over trials whose provider reported usage.
  const metered = trials.filter((t) => t.inputTokens != null && t.moves > 0);
  const meteredMoves = metered.reduce((a, t) => a + t.moves, 0);
  const perMove = (key) => (meteredMoves ? metered.reduce((a, t) => a + (t[key] ?? 0), 0) / meteredMoves : null);
  const reasoned = metered.filter((t) => t.reasoningTokens != null);
  return {
    trials: trials.length,
    errors: allTrials.filter((t) => t.status === 'error').length,
    solved: solved.length,
    successRate: trials.length ? (solved.length / trials.length) * 100 : null,
    avgLatencyMs: mean(latencies),
    p50LatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    avgTotalMs: mean(trials.map((t) => t.totalMs)),
    avgMoves: mean(trials.map((t) => t.moves)),
    avgMovesSolved: mean(solved.map((t) => t.moves)),
    avgGap: mean(gaps),
    optimalSolves: gaps.filter((g) => g === 0).length,
    gapSamples: gaps.length,
    // Share of moves that reduced the exact distance to solved (puzzles with a known optimum).
    improvingRate: exactMoves ? (exactTrials.reduce((a, t) => a + (t.improvingMoves ?? 0), 0) / exactMoves) * 100 : null,
    inputTokensPerMove: perMove('inputTokens'),
    outputTokensPerMove: perMove('outputTokens'),
    reasoningTokensPerMove: reasoned.length ? perMove('reasoningTokens') : null,
    avgTokensPerTrial: metered.length ? mean(metered.map((t) => t.inputTokens + t.outputTokens)) : null,
    malformed: trials.reduce((a, t) => a + (t.malformed || 0), 0),
    // Planner lanes: share of moves the chooser took from the certified list.
    certifiedPickRate: (() => {
      const planned = trials.filter((t) => t.certifiedPicks != null && t.validMoves);
      const moves = planned.reduce((a, t) => a + t.validMoves, 0);
      return moves ? (planned.reduce((a, t) => a + t.certifiedPicks, 0) / moves) * 100 : null;
    })(),
    retries: allTrials.reduce((a, t) => a + (t.retries || 0), 0),
  };
}

export function statsByModel(trials, modelIds) {
  return Object.fromEntries(modelIds.map((id) => [id, modelStats(trials.filter((t) => t.model === id))]));
}

// Leaders for the assignment questions. Each entry is an array of model ids:
// empty when there is no data, more than one id on a tie (ties are never broken by list order).
export function winners(stats) {
  const ids = Object.keys(stats).filter((id) => stats[id].trials > 0);
  const leaders = (score, dir) => {
    const ok = ids.filter((id) => score(stats[id]) != null);
    if (!ok.length) return [];
    const top = dir * Math.min(...ok.map((id) => dir * score(stats[id])));
    return ok.filter((id) => Math.abs(score(stats[id]) - top) < 1e-9);
  };
  const anySolved = ids.some((id) => stats[id].solved > 0);
  return {
    fastest: leaders((s) => s.avgLatencyMs, 1),
    highestSolveRate: anySolved ? leaders((s) => s.successRate, -1) : [],
    smallestGap: leaders((s) => s.avgGap, 1),
  };
}
