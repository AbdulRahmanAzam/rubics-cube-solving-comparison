import { memo, useEffect, useMemo, useRef, useState } from 'react';
import Cube3D from './Cube3D.jsx';
import ModelLogo from './ModelLogo.jsx';
import { laneClock, useRace } from '../lib/store.js';
import { clock, ms, ordinal } from '../lib/format.js';
import { compactTokens, tokensOf } from '@shared/tokens.js';

function useTicking(active) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    let id;
    const loop = () => {
      setNow(performance.now());
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [active]);
  return now;
}

function KindBadge({ kind }) {
  const cls = 'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-white sm:text-xs';
  if (kind === 'baseline') return <span className={`${cls} bg-muted`}>NO MODEL</span>;
  return kind === 'llm' ? (
    <span className={`${cls} bg-llm`}>LLM</span>
  ) : (
    <span className={`${cls} bg-decision`}>
      DECISION<span className="hidden @[26rem]:inline"> MODEL</span>
    </span>
  );
}

function Medal({ rank }) {
  const styles = {
    1: 'from-yellow-200 via-gold to-yellow-600 text-yellow-950',
    2: 'from-gray-100 via-gray-300 to-gray-500 text-gray-800',
    3: 'from-orange-200 via-amber-600 to-amber-800 text-amber-950',
  };
  const label = ordinal(rank);
  return (
    <div
      className={`pop-in absolute left-2 top-2 z-10 grid size-11 place-items-center rounded-full bg-gradient-to-br shadow-lg ring-2 ring-white sm:size-14 ${
        styles[rank] ?? 'from-gray-100 via-gray-300 to-gray-500 text-gray-800'
      }`}
    >
      <span className="text-base font-black leading-none sm:text-xl">
        {label.slice(0, -2)}
        <sup className="text-[0.55em]">{label.slice(-2)}</sup>
      </span>
    </div>
  );
}

const ENDED = { solved: 'SOLVED', limit: 'RAN OUT OF MOVES', timeout: 'OUT OF TIME', error: 'API ERROR', stopped: 'STOPPED' };

// Own component so the 60fps tick re-renders only the clock, never the 3D canvas.
function LaneClock({ lane, speed, failed }) {
  const now = useTicking(lane.status === 'thinking');
  return (
    <div className={`tabular font-mono text-lg font-extrabold leading-tight @[30rem]:text-xl @[40rem]:text-2xl ${failed ? 'text-lose' : ''}`}>
      {clock(laneClock(lane, speed, now))}
    </div>
  );
}

// " · 1.2k in / 45 out tokens" for a history chip tooltip, or nothing when not reported.
function tokenNote(m) {
  const t = m.tokens ?? tokensOf(m.usage);
  return t ? ` · ${compactTokens(t.input)} in / ${compactTokens(t.output)} out tokens` : '';
}

const Label = ({ children }) => <div className="text-[10px] font-bold tracking-widest text-muted">{children}</div>;

// Memoized: a move in one lane re-renders only that lane's card, not all four.
export default memo(function ModelCard({ model, lane, start, speed }) {
  const moveLimit = useRace((s) => s.moveLimit);
  const thinking = lane.status === 'thinking';
  const ended = lane.status in ENDED;
  const solved = lane.status === 'solved';
  const failed = ended && !solved;

  // Keyed by the move string: a late 'distance' update on a move must not restart the cube.
  const moveKey = lane.moves.map((m) => (m.valid ? m.move : '')).join(' ');
  const validMoves = useMemo(() => (moveKey ? moveKey.split(' ').filter(Boolean) : []), [moveKey]);
  const last = lane.moves.at(-1);
  const avgMs = lane.moves.length ? lane.modelMs / lane.moves.length : null;

  const historyRef = useRef();
  useEffect(() => {
    // Instant jump: a smooth scroll restarted on every move stutters with fast models.
    const el = historyRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [lane.moves.length]);

  const status = thinking
    ? model.kind === 'llm'
      ? 'thinking..'
      : model.kind === 'baseline'
        ? 'planning..'
        : 'deciding..'
    : solved
      ? 'SOLVED ✓'
      : failed
        ? lane.status === 'error'
          ? 'ERROR (not scored)'
          : lane.status === 'stopped'
            ? 'STOPPED'
            : 'NOT SOLVED'
        : lane.status === 'idle' && start
          ? 'ready'
          : '';

  return (
    <article
      className={`@container flex h-[22rem] min-h-0 flex-col gap-2 rounded-3xl bg-card p-3 shadow-sm ring-2 transition-colors sm:h-[24rem] sm:p-4 md:h-[max(24rem,calc(50dvh-7rem))] lg:h-full ${
        solved && lane.rank === 1 ? 'ring-gold' : solved ? 'ring-win/60' : 'ring-transparent'
      }`}
    >
      <header className="flex min-w-0 items-center gap-2">
        <ModelLogo model={model} size={32} />
        <h2 className="min-w-0 truncate text-lg font-extrabold tracking-tight @[30rem]:text-xl @[40rem]:text-2xl">{model.short}</h2>
        <KindBadge kind={model.kind} />
        <span
          key={lane.moves.length}
          title="current move"
          className={`chip-in ml-auto min-w-11 shrink-0 rounded-lg px-2 py-0.5 text-center font-mono text-base font-extrabold @[30rem]:text-lg ${
            last && !last.valid ? 'bg-red-100 text-lose' : last ? 'bg-ink text-white' : 'bg-well text-muted'
          }`}
        >
          {last ? (last.valid ? last.move : '✕') : '—'}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 gap-2 @[30rem]:gap-3">
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl bg-well">
          {lane.rank > 0 && <Medal rank={lane.rank} />}
          {start ? (
            <div className="absolute inset-0">
              <Cube3D start={start} moves={validMoves} speed={speed} />
            </div>
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted">waiting for puzzle</div>
          )}
          {failed && (
            <div className="pop-in absolute inset-x-0 bottom-2 flex justify-center px-2">
              <span
                title={lane.error ?? undefined}
                className={`truncate rounded-full px-3 py-1 text-xs font-black tracking-wide text-white shadow @[30rem]:text-sm ${
                  lane.status === 'stopped' ? 'bg-muted' : 'bg-lose'
                }`}
              >
                {ENDED[lane.status]}
              </span>
            </div>
          )}
        </div>

        <div
          className={`flex w-[6.75rem] shrink-0 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border-2 px-1 text-center @[30rem]:w-32 @[40rem]:w-36 ${
            solved ? 'border-win bg-green-50' : failed ? 'border-lose/70 bg-red-50' : 'border-transparent bg-well'
          }`}
        >
          <div>
            <Label>TIME</Label>
            <LaneClock lane={lane} speed={speed} failed={failed} />
          </div>
          <div>
            <Label>MOVES</Label>
            <div className="tabular text-3xl font-black leading-none @[40rem]:text-4xl">
              {lane.moves.length}
              <span className="text-xs font-semibold text-muted"> /{moveLimit}</span>
            </div>
            <div className="mx-auto mt-1 h-1 w-16 overflow-hidden rounded-full bg-line" title={`${lane.moves.length} of ${moveLimit} moves used`}>
              <div
                className={`h-full rounded-full transition-[width] duration-200 ${solved ? 'bg-win' : failed ? 'bg-lose' : 'bg-ink'}`}
                style={{ width: `${Math.min(100, (lane.moves.length / moveLimit) * 100)}%` }}
              />
            </div>
            {last?.distanceAfter != null && !solved ? (
              <div className="mt-0.5 text-[10px] font-semibold text-muted" title="exact distance to solved after the last move">
                {last.distanceAfter} from solved
              </div>
            ) : (
              last?.planner &&
              !solved && (
                <div className="mt-0.5 text-[10px] font-semibold text-muted" title="length of the planner's known solution after the last move">
                  plan: {last.planner.remaining - 1} left
                </div>
              )
            )}
          </div>
          <div
            title={
              lane.tokens
                ? `Provider-reported tokens for this puzzle: ${lane.tokens.input.toLocaleString()} in, ${lane.tokens.output.toLocaleString()} out` +
                  (lane.tokens.reasoning != null ? ` (${lane.tokens.reasoning.toLocaleString()} of it reasoning)` : '') +
                  ` · per move ${compactTokens(lane.tokens.input / lane.moves.length)} in, ${compactTokens(lane.tokens.output / lane.moves.length)} out`
                : 'No token usage reported yet'
            }
          >
            <Label>TOKENS IN · OUT</Label>
            <div className="tabular font-mono text-sm font-extrabold leading-tight @[40rem]:text-base">
              {lane.tokens ? (
                <>
                  {compactTokens(lane.tokens.input)}
                  <span className="text-muted"> · </span>
                  {compactTokens(lane.tokens.output)}
                </>
              ) : (
                <span className="text-muted">—</span>
              )}
            </div>
          </div>
          <div
            className={`text-xs font-bold leading-tight @[30rem]:text-sm ${
              thinking ? 'thinking-pulse text-muted' : solved ? 'text-win' : failed ? 'text-lose' : 'text-muted'
            }`}
          >
            {status}
          </div>
        </div>
      </div>

      <footer className="flex h-6 shrink-0 items-center gap-2">
        <Label>HISTORY</Label>
        <div ref={historyRef} className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
          {lane.moves.map((m, i) => (
            <span
              key={i}
              title={`#${i + 1} · ${ms(m.latencyMs)}${tokenNote(m)}${m.confidence != null ? ` · conf ${(m.confidence * 100).toFixed(0)}%` : ''}${
                m.planner ? ` · offered ${m.planner.offered.join(' ')} · planner ${ms(m.planner.ms)}` : ''
              }${
                m.valid ? '' : ` · malformed: ${m.raw ?? ''}`
              }`}
              className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold ${i === lane.moves.length - 1 ? 'chip-in' : ''} ${
                m.valid ? 'bg-well text-ink' : 'bg-red-100 text-lose'
              }`}
            >
              {m.valid ? m.move : '✕'}
            </span>
          ))}
        </div>
        <span className="shrink-0 font-mono text-[11px] text-muted" title="last move latency · average per move">
          {last ? `${ms(last.latencyMs)} · avg ${ms(avgMs)}` : ''}
        </span>
      </footer>
    </article>
  );
});
