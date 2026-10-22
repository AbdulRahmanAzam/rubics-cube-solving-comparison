import { STICKER_COLORS } from './Cube3D.jsx';

// Flat unfolded view: U on top, L F R B in the middle row, D at the bottom.
const LAYOUT = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };
const OFFSET = { U: 0, R: 9, F: 18, D: 27, L: 36, B: 45 };

export default function CubeNet({ facelets, cell = 10 }) {
  const face = cell * 3 + 4;
  return (
    <svg width={face * 4} height={face * 3} viewBox={`0 0 ${face * 4} ${face * 3}`}>
      {Object.entries(LAYOUT).map(([f, [cx, cy]]) =>
        Array.from({ length: 9 }, (_, k) => (
          <rect
            key={`${f}${k}`}
            x={cx * face + 2 + (k % 3) * cell}
            y={cy * face + 2 + Math.floor(k / 3) * cell}
            width={cell - 1.5}
            height={cell - 1.5}
            rx={cell * 0.18}
            fill={STICKER_COLORS[facelets[OFFSET[f] + k]]}
            stroke="#1b1b1b"
            strokeWidth="0.6"
          />
        )),
      )}
    </svg>
  );
}
