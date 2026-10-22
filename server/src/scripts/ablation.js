// Planner ablation from the command line: the four choosers on the same puzzles (suite puzzles
// plus fresh deep scrambles), real Jev calls. Prints one line per trial and a summary table, and
// saves everything to DATA_DIR/ablation/<time>.json. For dashboard results, run the "Planner
// ablation" line-up from the race page instead (that goes through the normal runner).
// Usage: node src/scripts/ablation.js [extraDeepScrambles=3] [seed=1] [lanes=jev-hints,jev-planner,planner-random,planner-only]
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SOLVED, applyMove, applyMoves, isSolved, mulberry32, randomScramble } from '../../../shared/cube.js';
import { ADAPTERS } from '../adapters/index.js';
import { buildState } from '../prompt.js';
import { CONFIG } from '../config.js';
import { generateSuite, loadSuite } from '../suite.js';

const extra = Number(process.argv[2] ?? 3);
const rng = mulberry32(Number(process.argv[3] ?? 1));
const lanes = (process.argv[4] ?? 'jev-hints,jev-planner,planner-random,planner-only').split(',');
const suite = loadSuite() ?? (await generateSuite());
const puzzles = [
  ...suite.puzzles.map((p) => ({ id: p.id, tier: p.tier, facelets: p.facelets, optimal: p.optimal, exact: p.optimalIsExact })),
  ...Array.from({ length: extra }, (_, i) => ({
    id: `random25-${i + 1}`,
    tier: 'random25',
    facelets: applyMoves(SOLVED, randomScramble(25, rng)),
    optimal: null,
    exact: false,
  })),
];

async function play(lane, p) {
  const adapter = ADAPTERS[lane];
  let s = p.facelets;
  const history = [];
  let modelMs = 0;
  let plannerMs = 0;
  let certified = 0;
  let turns = 0;
  while (!isSolved(s) && turns < CONFIG.moveLimit) {
    const state = buildState({ facelets: s, history, movesUsed: turns, moveLimit: CONFIG.moveLimit });
    const r = await adapter.decide({ state, timeoutMs: CONFIG.callTimeoutMs });
    turns++;
    modelMs += r.latencyMs;
    plannerMs += r.planner.ms;
    if (!state.allowed_moves.includes(r.move)) continue; // malformed: turn used, no state change
    if (r.planner.certified.includes(r.move)) certified++;
    s = applyMove(s, r.move);
    history.push(r.move);
  }
  return {
    lane,
    puzzle: p.id,
    tier: p.tier,
    optimal: p.optimal,
    exact: p.exact,
    solved: isSolved(s),
    moves: turns,
    certifiedPicks: certified,
    validMoves: history.length,
    modelMsPerMove: Math.round(modelMs / turns),
    plannerMsPerMove: Math.round(plannerMs / turns),
    history: history.join(' '),
  };
}

const results = [];
for (const p of puzzles) {
  for (const lane of lanes) {
    const r = await play(lane, p);
    results.push(r);
    console.log(
      `${p.id.padEnd(13)} ${lane.padEnd(15)} ${r.solved ? 'solved' : 'FAILED'} ${String(r.moves).padStart(2)} moves` +
        ` (opt ${p.optimal ?? '?'}) certified ${r.certifiedPicks}/${r.validMoves} model ${r.modelMsPerMove} ms/move`,
    );
  }
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const f = (v, d = 1) => (v == null ? '-' : v.toFixed(d));
console.log('\nchooser          solved   moves(solved)  deep moves  gap(exact)  certified picks  model ms/move');
for (const lane of lanes) {
  const rs = results.filter((r) => r.lane === lane);
  const solved = rs.filter((r) => r.solved);
  const deep = solved.filter((r) => r.tier === 'extension' || r.tier === 'random25');
  const gaps = solved.filter((r) => r.exact).map((r) => r.moves - r.optimal);
  const picks = rs.reduce((a, r) => a + r.certifiedPicks, 0) / rs.reduce((a, r) => a + r.validMoves, 0);
  console.log(
    `${lane.padEnd(16)} ${`${solved.length}/${rs.length}`.padEnd(8)} ${f(mean(solved.map((r) => r.moves))).padEnd(14)} ` +
      `${f(mean(deep.map((r) => r.moves))).padEnd(11)} ${(gaps.length ? `+${f(mean(gaps), 2)}` : '-').padEnd(11)} ` +
      `${f(picks * 100)}%`.padEnd(17) + ` ${f(mean(rs.map((r) => r.modelMsPerMove)), 0)}`,
  );
}

const dir = path.join(CONFIG.dataDir, 'ablation');
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify({ lanes, extra, seed: process.argv[3] ?? 1, results }, null, 2));
console.log(`\nsaved ${file}`);
process.exit(0);
