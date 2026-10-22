// 0:14.75 style clock used on the race cards.
export function clock(ms) {
  if (ms == null || Number.isNaN(ms)) return '0:00.00';
  const total = Math.max(0, ms) / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

export function ms(v) {
  if (v == null) return '—';
  if (v < 1000) return `${Math.round(v)} ms`;
  return `${(v / 1000).toFixed(2)} s`;
}

export function seconds(v) {
  if (v == null) return '—';
  return v >= 60000 ? clock(v) : `${(v / 1000).toFixed(1)} s`;
}

export function num(v, digits = 1) {
  return v == null ? '—' : v.toFixed(digits);
}

export function pct(v) {
  return v == null ? '—' : `${Math.round(v)}%`;
}

export function ordinal(n) {
  return { 1: '1ST', 2: '2ND', 3: '3RD' }[n] ?? `${n}TH`;
}
