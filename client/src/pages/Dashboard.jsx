import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  LabelList,
} from 'recharts';
import { MODELS, TIERS } from '@shared/models.js';
import ModelLogo from '../components/ModelLogo.jsx';
import { useRace } from '../lib/store.js';
import { fetchTrials } from '../lib/live.js';
import { useStats } from '../lib/useStats.js';
import { ms, num, pct, seconds } from '../lib/format.js';
import { compactTokens } from '@shared/tokens.js';

function Panel({ title, sub, children, className = '' }) {
  return (
    <div className={`rounded-2xl bg-card p-4 shadow-sm ${className}`}>
      <div className="mb-2">
        <h3 className="text-sm font-extrabold">{title}</h3>
        {sub && <p className="text-xs text-muted">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

const LOG_DOMAIN = [(min) => min / 2, (max) => max * 1.6];

function ModelBar({ data, dataKey, format, log = false }) {
  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#eceef2" />
        <XAxis dataKey="short" tickLine={false} axisLine={false} tick={{ fontSize: 12, fontWeight: 600 }} />
        <YAxis
          scale={log ? 'log' : 'auto'}
          domain={log ? LOG_DOMAIN : [0, 'auto']}
          allowDataOverflow={log}
          tickFormatter={format}
          tickLine={false}
          axisLine={false}
          width={56}
          tick={{ fontSize: 11 }}
        />
        <Tooltip formatter={(v) => format(v)} cursor={{ fill: '#f4f5f8' }} />
        <Bar dataKey={dataKey} radius={[6, 6, 0, 0]} maxBarSize={56}>
          {data.map((d) => (
            <Cell key={d.id} fill={d.color} />
          ))}
          <LabelList dataKey={dataKey} position="top" formatter={(v) => (v == null ? '' : format(v))} fontSize={11} fontWeight={700} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Alternate labels above/below the dots so neighbours with similar latency do not overlap.
function ScatterLabel({ x, y, value, index }) {
  const below = index % 2 === 1;
  return (
    <text x={x} y={below ? y + 20 : y - 10} textAnchor="middle" fontSize={12} fontWeight={700} fill="#374151">
      {value}
    </text>
  );
}

export default function Dashboard() {
  const [tier, setTier] = useState('all');
  const { stats, trials, puzzles } = useStats({ tier });
  const setTrials = useRace((s) => s.setTrials);
  const [loadError, setLoadError] = useState(null);

  // The server's saved runs are the only source of results.
  useEffect(() => {
    fetchTrials().then(setTrials).catch((err) => setLoadError(err.message));
  }, [setTrials]);

  const rows = MODELS.filter((m) => !m.ablation && (!m.optional || stats[m.id].trials || stats[m.id].errors)).map((m) => ({ ...m, ...stats[m.id] }));
  const ablationRows = MODELS.filter((m) => m.ablation && (stats[m.id].trials || stats[m.id].errors)).map((m) => ({ ...m, ...stats[m.id] }));
  // Sorted by latency so neighbouring dots get alternating label positions.
  const scatterRows = rows.filter((r) => r.avgLatencyMs).sort((a, b) => a.avgLatencyMs - b.avgLatencyMs);
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(trials, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'trials.json' });
    a.click();
  };

  return (
    <div className="flex flex-col gap-3 pb-6">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-card px-4 py-2.5 shadow-sm">
        <h2 className="mr-2 text-lg font-extrabold">Statistical benchmark</h2>
        <span className="text-sm text-muted">
          {trials.length} live model-puzzle trials · {puzzles} puzzles{loadError && <b className="ml-2 text-lose">backend offline: {loadError}</b>}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <select value={tier} onChange={(e) => setTier(e.target.value)} className="rounded-xl border border-line px-3 py-1.5 text-sm font-semibold">
            <option value="all">All test sets</option>
            {TIERS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          
          <button onClick={exportJson} className="rounded-xl border border-line px-3 py-1.5 text-sm font-semibold">
            Export JSON
          </button>

        </div>
      </div>

      <Panel title="Per-model results" sub="Latency = model time per move. Gap = moves − exact shortest solution, solved puzzles with a known optimum only. Trials ended by provider errors are excluded from rates and counted under ERRORS. Tokens are as reported by each provider, re-asks included; reasoning tokens are part of OUT.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1060px] whitespace-nowrap text-[13px] [&_td]:px-2 [&_th]:px-2 [&_td:first-child]:pl-0 [&_th:first-child]:pl-0">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-bold tracking-wider text-muted">
                <th className="py-2">MODEL</th>
                <th className="text-right">TRIALS</th>
                <th className="text-right" title="average model time per move">LATENCY / MOVE</th>
                <th className="text-right" title="95th percentile latency per move">P95</th>
                <th className="text-right" title="average input (prompt) tokens per move, as reported by the provider">TOKENS IN / MOVE</th>
                <th className="text-right" title="average output tokens per move (reasoning included), as reported by the provider">OUT / MOVE</th>
                <th className="text-right" title="average total model time per puzzle">TOTAL TIME</th>
                <th className="text-right" title="average moves used per puzzle">MOVES</th>
                <th className="text-right" title="solved within the move limit">SUCCESS</th>
                <th className="text-right" title="moves minus exact shortest solution, solved puzzles only">GAP</th>
                <th className="text-right" title="solves with zero gap">OPTIMAL</th>
                <th className="text-right" title="answers that were not one of the 18 legal moves">MALFORMED</th>
                <th className="text-right" title="moves that reduced the exact distance to solved">CLOSER</th>
                <th className="text-right">RETRIES</th>
                <th className="text-right" title="trials ended by provider errors, excluded from rates">ERRORS</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line/60 last:border-0">
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <ModelLogo model={r} size={26} />
                      <div>
                        <div className="font-bold">{r.name}</div>
                        <div className="text-[11px] text-muted">{r.category}</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-right">{r.trials}</td>
                  <td className="text-right font-bold">{ms(r.avgLatencyMs)}</td>
                  <td className="text-right text-muted">{ms(r.p95LatencyMs)}</td>
                  <td className="text-right" title={r.avgTokensPerTrial != null ? `${Math.round(r.avgTokensPerTrial).toLocaleString()} tokens per puzzle on average` : undefined}>
                    {compactTokens(r.inputTokensPerMove)}
                  </td>
                  <td className="text-right" title={r.reasoningTokensPerMove != null ? `${compactTokens(r.reasoningTokensPerMove)} of it reasoning` : undefined}>
                    {compactTokens(r.outputTokensPerMove)}
                    {r.reasoningTokensPerMove > 0 && <span className="ml-1 text-muted">({compactTokens(r.reasoningTokensPerMove)} think)</span>}
                  </td>
                  <td className="text-right">{seconds(r.avgTotalMs)}</td>
                  <td className="text-right">{num(r.avgMoves)}</td>
                  <td className="text-right font-bold">{pct(r.successRate)}{r.trials ? <span className="ml-1 font-normal text-muted">({r.solved}/{r.trials})</span> : null}</td>
                  <td className="text-right font-bold">{r.avgGap == null ? '—' : `+${num(r.avgGap, 2)}`}{r.gapSamples ? <span className="ml-1 font-normal text-muted">(n={r.gapSamples})</span> : null}</td>
                  <td className="text-right">{r.gapSamples ? `${r.optimalSolves}/${r.gapSamples}` : '—'}</td>
                  <td className="text-right">{r.malformed}</td>
                  <td className="text-right">{pct(r.improvingRate)}</td>
                  <td className="text-right">{r.retries}</td>
                  <td className="text-right">{r.errors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {ablationRows.length > 0 && (
        <Panel
          title="Planner ablation: what does the chooser add?"
          sub="Same planner, different chooser. Planner alone = upper bound; random pick among certified moves = what any chooser gets; Jev + certified = Jev picks among certified moves only; Jev + hints = Jev picks from every move, labeled closer / no progress / farther, and can pick wrong. Not part of the fair benchmark above or the five answers."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] whitespace-nowrap text-[13px] [&_td]:px-2 [&_th]:px-2 [&_td:first-child]:pl-0 [&_th:first-child]:pl-0">
              <thead>
                <tr className="border-b border-line text-left text-[10px] font-bold tracking-wider text-muted">
                  <th className="py-2">CHOOSER</th>
                  <th className="text-right">TRIALS</th>
                  <th className="text-right" title="solved within the move limit">SUCCESS</th>
                  <th className="text-right" title="average moves on solved puzzles">MOVES (SOLVED)</th>
                  <th className="text-right" title="moves minus exact shortest solution, solved puzzles with a known optimum">GAP</th>
                  <th className="text-right" title="share of moves taken from the planner's certified list">CERTIFIED PICKS</th>
                  <th className="text-right" title="model time per move (0 when no model is called)">MODEL LATENCY / MOVE</th>
                  <th className="text-right">ERRORS</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {ablationRows.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 last:border-0">
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <ModelLogo model={r} size={26} />
                        <div>
                          <div className="font-bold">{r.name}</div>
                          <div className="text-[11px] text-muted">{r.category}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-right">{r.trials}</td>
                    <td className="text-right font-bold">{pct(r.successRate)}{r.trials ? <span className="ml-1 font-normal text-muted">({r.solved}/{r.trials})</span> : null}</td>
                    <td className="text-right">{num(r.avgMovesSolved)}</td>
                    <td className="text-right">{r.avgGap == null ? '—' : `+${num(r.avgGap, 2)}`}{r.gapSamples ? <span className="ml-1 text-muted">(n={r.gapSamples})</span> : null}</td>
                    <td className="text-right font-bold">{pct(r.certifiedPickRate)}</td>
                    <td className="text-right">{r.kind === 'baseline' ? 'no model' : ms(r.avgLatencyMs)}</td>
                    <td className="text-right">{r.errors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Panel title="Avg latency per move" sub="log scale, lower is faster">
          <ModelBar data={rows.filter((r) => r.avgLatencyMs)} dataKey="avgLatencyMs" format={ms} log />
        </Panel>
        <Panel title="Success rate" sub="solved within 30 moves">
          <ModelBar data={rows} dataKey="successRate" format={pct} />
        </Panel>
        <Panel title="Optimality gap" sub="extra moves over the shortest solution">
          <ModelBar data={rows} dataKey="avgGap" format={(v) => (v == null ? '—' : num(v, 2))} />
        </Panel>
        <Panel title="Avg total time per puzzle" sub="lower is faster">
          <ModelBar data={rows} dataKey="avgTotalMs" format={seconds} />
        </Panel>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Panel title="Input tokens per move" sub="prompt size each model receives, log scale, lower is cheaper">
          <ModelBar data={rows.filter((r) => r.inputTokensPerMove)} dataKey="inputTokensPerMove" format={compactTokens} log />
        </Panel>
        <Panel
          title="Output tokens per move"
          sub={`tokens generated per decision, reasoning included, log scale${
            rows.some((r) => r.outputTokensPerMove === 0)
              ? ` · reported 0: ${rows.filter((r) => r.outputTokensPerMove === 0).map((r) => r.short).join(', ')}`
              : ''
          }`}
        >
          <ModelBar data={rows.filter((r) => r.outputTokensPerMove)} dataKey="outputTokensPerMove" format={compactTokens} log />
        </Panel>
      </div>

      <Panel title="Speed vs quality" sub="each dot is a model: further left = faster decisions, higher = more cubes solved">
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart margin={{ top: 28, right: 70, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="#eceef2" />
            <XAxis type="number" dataKey="avgLatencyMs" name="Latency" scale="log" domain={LOG_DOMAIN} tickFormatter={ms} tick={{ fontSize: 11 }} />
            <YAxis type="number" dataKey="successRate" name="Success" domain={[0, 110]} ticks={[0, 25, 50, 75, 100]} tickFormatter={pct} tick={{ fontSize: 11 }} width={48} />
            <ZAxis range={[260, 260]} />
            <Tooltip formatter={(v, n) => (n === 'Latency' ? ms(v) : pct(v))} />
            <Scatter data={scatterRows}>
              {rows
                .filter((r) => r.avgLatencyMs)
                .map((r) => (
                  <Cell key={r.id} fill={r.color} />
                ))}
              <LabelList dataKey="short" content={ScatterLabel} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}
