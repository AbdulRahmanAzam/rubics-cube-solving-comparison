// Exact shortest-solution distance (half-turn metric) for states up to 8 moves away.
//
// Meet in the middle: a breadth-first table holds every state within 4 moves of solved.
// A depth-limited search of at most 4 moves from the query state then finds the exact
// distance: if the true distance D <= 8, the optimal path passes a state D-4 moves from
// the query that lies inside the table.
import { MOVES, SOLVED, applyMove } from '../../shared/cube.js';

const TABLE_DEPTH = 4;
export const EXACT_LIMIT = TABLE_DEPTH * 2;

const OPPOSITE = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };
const ORDER = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };

// Canonical sequences only: never the same face twice in a row, and opposite faces
// (which commute) only in one fixed order. Every optimal solution has a canonical form.
function allowed(prev, move) {
  if (!prev) return true;
  if (prev[0] === move[0]) return false;
  if (OPPOSITE[prev[0]] === move[0] && ORDER[prev[0]] > ORDER[move[0]]) return false;
  return true;
}

let table = null;

function buildTable() {
  const t = new Map([[SOLVED, 0]]);
  let frontier = [SOLVED];
  for (let d = 1; d <= TABLE_DEPTH; d++) {
    const next = [];
    for (const s of frontier) {
      for (const m of MOVES) {
        const n = applyMove(s, m);
        if (!t.has(n)) {
          t.set(n, d);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return t;
}

export function warmSolver() {
  table ??= buildTable();
  return table.size;
}

// Exact distance to solved, or null when it is more than EXACT_LIMIT moves.
export function exactDistance(state) {
  warmSolver();
  const direct = table.get(state);
  if (direct != null) return direct;

  let best = Infinity;
  const dfs = (s, depth, prev) => {
    const t = table.get(s);
    if (t != null && depth + t < best) best = depth + t;
    if (depth >= TABLE_DEPTH || depth + TABLE_DEPTH + 1 >= best) return;
    for (const m of MOVES) if (allowed(prev, m)) dfs(applyMove(s, m), depth + 1, m);
  };
  dfs(state, 0, null);
  return best <= EXACT_LIMIT ? best : null;
}

// Moves that bring the state strictly closer to solved (for move-quality analysis).
export function improvingMoves(state, distance = exactDistance(state)) {
  if (distance == null || distance === 0) return [];
  return MOVES.filter((m) => exactDistance(applyMove(state, m)) === distance - 1);
}

let kociembaReady = false;

// Upper bound for deep scrambles (two-phase algorithm). Not proven optimal.
export async function kociembaLength(state) {
  const { default: Cube } = await import('cubejs');
  if (!kociembaReady) {
    Cube.initSolver();
    kociembaReady = true;
  }
  const solution = Cube.fromString(state).solve().trim();
  return solution ? solution.split(/\s+/).length : 0;
}
