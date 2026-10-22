// Move certifier for the "Jev + planner" lane. Pattern from public Jev cube projects:
// a solver works out which turns provably bring the cube closer to solved, and the decision
// model chooses only among those certified turns. Jev still makes every move; the planner only
// decides which options it is offered.
//
// Guarantee: every certified move leaves a known solution one move shorter than before, so the
// remaining length drops by at least one per turn and the trial ends within the first plan's
// length (two-phase plans are at most 22 moves, under the 30-move limit).
//
// - Distance <= 8: exact search. Candidates are every optimal move, so the solve is optimal.
// - Deeper: Kociemba two-phase (cubejs). The first plan is shortened by racing the cube in all
//   24 orientations on a pool of solver workers. Each turn, every allowed move is solved one step
//   ahead; candidates are the moves whose follow-up is shortest, never longer than the plan minus one.
import Cube from 'cubejs';
import { FACES, FACE_NORMALS, STICKERS, applyMove, applyMoves, isSolved } from '../../shared/cube.js';
import { exactDistance } from './solver.js';
import { solveWithin } from './solverPool.js';

const IMPROVE_BUDGET_MS = Number(process.env.PLANNER_BUDGET_MS ?? 8000);

let ready = false;
function solve(facelets) {
  if (!ready) {
    Cube.initSolver();
    ready = true;
  }
  const s = Cube.fromString(facelets).solve().trim();
  return s ? s.split(/\s+/) : [];
}

// The 24 whole-cube rotations as integer matrices. Two-phase search is not symmetric, so the
// same cube seen from another orientation often gets a shorter solution.
const mul = (a, b) => a.map((row) => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));
const apply3 = (m, v) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
const ROTATIONS = (() => {
  const gens = [
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
    [[0, 0, 1], [0, 1, 0], [-1, 0, 0]],
  ];
  const seen = new Map([['1,0,0,0,1,0,0,0,1', [[1, 0, 0], [0, 1, 0], [0, 0, 1]]]]);
  const queue = [...seen.values()];
  while (queue.length) {
    const m = queue.shift();
    for (const g of gens) {
      const n = mul(g, m);
      const k = n.flat().join(',');
      if (!seen.has(k)) {
        seen.set(k, n);
        queue.push(n);
      }
    }
  }
  return [...seen.values()];
})();
const vkey = (pos, normal) => `${pos.join(',')}|${normal.join(',')}`;
const STICKER_AT = new Map(STICKERS.map((s, i) => [vkey(s.pos, s.normal), i]));
const FACE_OF_NORMAL = new Map(Object.entries(FACE_NORMALS).map(([f, n]) => [n.join(','), f]));

// The cube seen in orientation r, plus a function mapping a solution found there back to our frame.
function orientations(facelets) {
  return ROTATIONS.map((r) => {
    const rotated = Array(54);
    STICKERS.forEach((s, i) => {
      rotated[STICKER_AT.get(vkey(apply3(r, s.pos), apply3(r, s.normal)))] = facelets[i];
    });
    // Relabel colors so each letter again names the face its center now sits on.
    const label = Object.fromEntries(FACES.map((f) => [rotated[FACES.indexOf(f) * 9 + 4], f]));
    // A turn of face X in the rotated view is a turn of the face whose normal r maps onto X.
    const rt = r[0].map((_, j) => r.map((row) => row[j]));
    const back = (sol) => sol.map((m) => FACE_OF_NORMAL.get(apply3(rt, FACE_NORMALS[m[0]]).join(',')) + m.slice(1));
    return { facelets: rotated.map((c) => label[c]).join(''), back };
  });
}

// Keep asking the pool for a plan one move shorter than the best so far, until the budget runs out.
async function bestPlan(facelets) {
  let best = solve(facelets);
  const views = orientations(facelets);
  const deadline = performance.now() + IMPROVE_BUDGET_MS;
  while (best.length > 0 && performance.now() < deadline) {
    const hit = await solveWithin(views.map((v) => v.facelets), best.length - 1, deadline - performance.now());
    if (!hit) break;
    const plan = views[hit.index].back(hit.solution);
    if (!isSolved(applyMoves(facelets, plan)) || plan.length >= best.length) break;
    best = plan;
  }
  return best;
}

// facelets -> a known solution (move list). Filled by look-ahead, so the next turn is a cache hit.
const plans = new Map();

export function warmPlanner() {
  solve('UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB');
}

// Returns { method, remaining, candidates, labels } for the given state.
// candidates: the certified moves with the shortest follow-up ({ move, remainingAfter }).
// labels: every allowed move with the length of its known follow-up and whether it is certified
// (used by the hint lane, where the chooser may also pick a move that is not certified).
export async function certifiedMoves(facelets, allowed) {
  const d = exactDistance(facelets);
  if (d != null) {
    // Within 8 of solved a move changes the distance by exactly one, and 9 is past the exact limit.
    const labels = allowed.map((move) => {
      const after = exactDistance(applyMove(facelets, move)) ?? d + 1;
      return { move, remainingAfter: after, certified: after === d - 1 };
    });
    return { method: 'exact', remaining: d, candidates: labels.filter((l) => l.certified), labels };
  }

  let plan = plans.get(facelets);
  if (!plan) {
    plan = await bestPlan(facelets);
    plans.set(facelets, plan);
  }
  const labels = [];
  for (const move of allowed) {
    const child = applyMove(facelets, move);
    // A follow-up that starts on the same face could not be played next turn (allowed_moves rule).
    const playable = (p) => !p.length || p[0][0] !== move[0];
    let next = plans.get(child);
    const fresh = move === plan[0] ? plan.slice(1) : next ? null : solve(child);
    if (fresh && playable(fresh) && (!next || fresh.length < next.length)) {
      next = fresh;
      plans.set(child, next);
    }
    const known = next ?? fresh;
    const ok = Boolean(next) && playable(next) && next.length <= plan.length - 1;
    labels.push({ move, remainingAfter: known.length, certified: ok });
  }
  const found = labels.filter((l) => l.certified);
  if (!found.length) throw new Error(`planner found no certified move (plan ${plan.join(' ')})`);
  const best = Math.min(...found.map((c) => c.remainingAfter));
  return {
    method: 'kociemba',
    remaining: plan.length,
    candidates: found.filter((c) => c.remainingAfter === best),
    labels,
  };
}
