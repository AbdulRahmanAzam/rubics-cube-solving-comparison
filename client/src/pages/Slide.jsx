import { useEffect, useState } from 'react';
import { MODELS, MOVE_LIMIT } from '@shared/models.js';
import ModelLogo from '../components/ModelLogo.jsx';
import StudentBadge from '../components/StudentBadge.jsx';
import { QUESTIONS, answers, useStats } from '../lib/useStats.js';
import { ms, num, pct, seconds } from '../lib/format.js';
import { useRace } from '../lib/store.js';
import { fetchTrials } from '../lib/live.js';

const METRICS = [
  { key: 'avgLatencyMs', label: 'Avg latency / move', fmt: (s) => ms(s.avgLatencyMs), win: 'fastest' },
  { key: 'avgTotalMs', label: 'Avg total time', fmt: (s) => seconds(s.avgTotalMs) },
  { key: 'avgMoves', label: 'Avg moves', fmt: (s) => num(s.avgMoves) },
  {
    key: 'successRate',
    label: 'Success rate',
    fmt: (s) => (s.trials ? `${pct(s.successRate)} (${s.solved}/${s.trials})` : '—'),
    win: 'highestSolveRate',
  },
  {
    key: 'avgGap',
    label: 'Optimality gap',
    fmt: (s) => (s.avgGap == null ? '—' : `+${num(s.avgGap, 2)} (n=${s.gapSamples})`),
    win: 'smallestGap',
  },
];

const CONCLUSION_KEY = 'rubiks-race-conclusion-v1';

function readConclusion() {
  try {
    return localStorage.getItem(CONCLUSION_KEY) ?? '';
  } catch {
    return '';
  }
}

// Final slide for the end of the screen recording (assignment 8.2, point 3).
// Q1-Q4 are computed from live results only; Q5 is written by the student from that evidence.
export default function Slide() {
  const data = useStats();
  const { stats, win, trials, puzzles } = data;
  const qa = answers(data);
  const [conclusion, setConclusion] = useState(readConclusion);
  const setTrials = useRace((s) => s.setTrials);
  useEffect(() => {
    fetchTrials().then(setTrials).catch(() => {});
  }, [setTrials]);
  const shown = MODELS.filter((m) => !m.ablation && (!m.optional || stats[m.id].trials || stats[m.id].errors));

  const saveConclusion = (v) => {
    setConclusion(v);
    try {
      localStorage.setItem(CONCLUSION_KEY, v);
    } catch {
      // not persisted, still shown
    }
  };

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3 rounded-3xl bg-card p-4 shadow-sm sm:p-6 xl:gap-4 [@media(min-height:900px)]:gap-5 [@media(min-height:900px)]:p-8">
      <div className="flex flex-col-reverse items-start justify-between gap-3 md:flex-row md:gap-6">
        <div>
          <div className="text-xs font-black tracking-[0.25em] text-muted">AI ENGINEERING · ASSIGNMENT 02</div>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl [@media(min-height:900px)]:text-4xl">Rubik's Cube Race: benchmark results</h1>
          <p className="mt-1 text-sm text-muted sm:text-base">
            {trials.length} model-puzzle trials over {puzzles} puzzles · identical scrambles, state and rules for every model ·{' '}
            {MOVE_LIMIT}-move limit
          </p>
        </div>
        <StudentBadge large />
      </div>

      {!trials.length && (
        <div className="rounded-2xl bg-amber-50 px-4 py-3 font-semibold text-amber-800">
          No live results yet. This slide only uses real benchmark runs.
        </div>
      )}

      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${shown.length > 4 ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>
        {shown.map((m) => (
          <div key={m.id} className="min-w-0 rounded-2xl bg-well p-3 [@media(min-height:900px)]:p-4">
            <div className="mb-2 flex items-center gap-2">
              <ModelLogo model={m} size={32} />
              <div>
                <div className="truncate text-base font-extrabold leading-tight sm:text-lg">{m.name}</div>
                <div className="text-[11px] font-bold tracking-wide text-muted">
                  {m.kind === 'llm' ? 'FRONTIER LLM' : 'DECISION MODEL'}
                </div>
              </div>
            </div>
            <dl className="space-y-1">
              {METRICS.map((x) => {
                const best = x.win && win[x.win].includes(m.id);
                return (
                  <div
                    key={x.key}
                    className={`flex items-baseline justify-between gap-2 rounded-lg px-2 py-0.5 [@media(min-height:900px)]:py-1 ${best ? 'bg-green-100 ring-1 ring-win' : ''}`}
                  >
                    <dt className="whitespace-nowrap text-[13px] text-muted">{x.label}</dt>
                    <dd className="tabular whitespace-nowrap text-right font-mono text-sm font-extrabold 2xl:text-base">{x.fmt(stats[m.id])}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 content-start gap-x-8 gap-y-2.5 lg:grid-cols-2 [@media(min-height:900px)]:gap-y-4">
        {QUESTIONS.slice(0, 4).map((q, i) => (
          <div key={i}>
            <div className="text-xs font-bold text-muted sm:text-[13px]">
              Q{i + 1}. {q}
            </div>
            <div className="text-[15px] font-semibold leading-snug [@media(min-height:900px)]:text-lg">{qa[i]}</div>
          </div>
        ))}
        <div className="lg:col-span-2">
          <div className="text-xs font-bold text-muted sm:text-[13px]">Q5. {QUESTIONS[4]}</div>
          <textarea
            value={conclusion}
            onChange={(e) => saveConclusion(e.target.value)}
            rows={2}
            placeholder="Write your own conclusion here after looking at the numbers above."
            className="mt-1 w-full resize-none rounded-xl border border-line bg-white px-3 py-1.5 text-[15px] font-semibold outline-none focus:border-ink [@media(min-height:900px)]:text-lg"
          />
        </div>
      </div>
    </div>
  );
}
