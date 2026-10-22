// Deterministic 3x3 cube engine shared by server (authoritative) and client (rendering).
//
// State = 54-char facelet string in Kociemba order U R F D L B, 9 stickers per face,
// each letter names the face whose center has that color.
// Coordinates: x right, y up, z toward the viewer (front). Cubie coords are -1, 0, 1.

export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
export const SOLVED = FACES.map((f) => f.repeat(9)).join('');

// Half-turn metric: 18 face turns, no slices or rotations.
export const MOVES = FACES.flatMap((f) => [f, `${f}'`, `${f}2`]);

export const MOVE_DESCRIPTIONS = Object.fromEntries(
  MOVES.map((m) => {
    const names = { U: 'upper', D: 'bottom', R: 'right', L: 'left', F: 'front', B: 'back' };
    const face = names[m[0]];
    const turn = m.endsWith('2')
      ? '180 degrees'
      : m.endsWith("'")
        ? '90 degrees counterclockwise'
        : '90 degrees clockwise';
    return [m, `Turn the ${face} face ${turn}, as seen looking directly at the ${face} face`];
  }),
);

export const FACE_NORMALS = {
  U: [0, 1, 0],
  R: [1, 0, 0],
  F: [0, 0, 1],
  D: [0, -1, 0],
  L: [-1, 0, 0],
  B: [0, 0, -1],
};

// Position of the cubie holding sticker (face, row, col), rows/cols read while facing that face.
function stickerPosition(face, r, c) {
  switch (face) {
    case 'U': return [c - 1, 1, r - 1];
    case 'R': return [1, 1 - r, 1 - c];
    case 'F': return [c - 1, 1 - r, 1];
    case 'D': return [c - 1, -1, 1 - r];
    case 'L': return [-1, 1 - r, c - 1];
    case 'B': return [1 - c, 1 - r, -1];
  }
}

// STICKERS[i] = { face, pos, normal } for facelet index i.
export const STICKERS = FACES.flatMap((face) =>
  Array.from({ length: 9 }, (_, k) => ({
    face,
    pos: stickerPosition(face, Math.floor(k / 3), k % 3),
    normal: FACE_NORMALS[face],
  })),
);

const key = (pos, normal) => `${pos.join(',')}|${normal.join(',')}`;
const INDEX_OF = new Map(STICKERS.map((s, i) => [key(s.pos, s.normal), i]));

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Clockwise quarter turn seen from outside the face = -90 degrees about its outward normal.
// Rodrigues with cos = 0, sin = -1: v' = -(k x v) + k (k . v)
function rotateCW(v, k) {
  const kxv = cross(k, v);
  const kv = dot(k, v);
  return [0, 1, 2].map((i) => -kxv[i] + k[i] * kv + 0);
}

// PERM[move][dest] = source index: new[dest] = old[PERM[move][dest]]
function quarterPerm(face) {
  const k = FACE_NORMALS[face];
  const perm = Array.from({ length: 54 }, (_, i) => i);
  STICKERS.forEach((s, src) => {
    if (dot(s.pos, k) !== 1) return;
    const dest = INDEX_OF.get(key(rotateCW(s.pos, k), rotateCW(s.normal, k)));
    perm[dest] = src;
  });
  return perm;
}

const compose = (p, q) => p.map((src) => q[src]); // apply q, then p

export const PERM = {};
for (const f of FACES) {
  const q = quarterPerm(f);
  const h = compose(q, q);
  PERM[f] = q;
  PERM[`${f}2`] = h;
  PERM[`${f}'`] = compose(h, q);
}

export const isValidMove = (m) => Object.hasOwn(PERM, m);

export function applyMove(state, move) {
  const p = PERM[move];
  if (!p) throw new Error(`Invalid move: ${move}`);
  let out = '';
  for (let i = 0; i < 54; i++) out += state[p[i]];
  return out;
}

export function applyMoves(state, moves) {
  return moves.reduce(applyMove, state);
}

export const isSolved = (state) => {
  for (let f = 0; f < 6; f++) {
    const c = state[f * 9 + 4];
    for (let i = 0; i < 9; i++) if (state[f * 9 + i] !== c) return false;
  }
  return true;
};

export function invertMove(m) {
  if (m.endsWith('2')) return m;
  return m.endsWith("'") ? m[0] : `${m}'`;
}

// Faces as 3 row strings each, for prompts and the 2D net.
export function toFaces(state) {
  return Object.fromEntries(
    FACES.map((f, i) => {
      const s = state.slice(i * 9, i * 9 + 9);
      return [f, [s.slice(0, 3), s.slice(3, 6), s.slice(6, 9)]];
    }),
  );
}

// Seeded RNG so test suites are reproducible.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AXIS = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };

// Random scramble without same-face repeats or redundant same-axis triples (U D U).
export function randomScramble(length, rng = Math.random) {
  const seq = [];
  while (seq.length < length) {
    const m = MOVES[Math.floor(rng() * MOVES.length)];
    const prev = seq.at(-1);
    const prev2 = seq.at(-2);
    if (prev && prev[0] === m[0]) continue;
    if (prev && prev2 && AXIS[prev[0]] === AXIS[m[0]] && AXIS[prev2[0]] === AXIS[m[0]]) continue;
    seq.push(m);
  }
  return seq;
}

// Turning the same face twice in a row is never useful (U then U' cancels, U then U equals U2),
// so the game offers every move except the previous move's face. No shortest solution needs one.
export function allowedMoves(history = []) {
  const prev = history.at(-1);
  return prev ? MOVES.filter((m) => m[0] !== prev[0]) : MOVES;
}
