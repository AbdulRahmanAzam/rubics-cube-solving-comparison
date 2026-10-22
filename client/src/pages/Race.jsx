import { useEffect, useRef, useState } from 'react';
import { MODEL_BY_ID, TIERS } from '@shared/models.js';
import ModelCard from '../components/ModelCard.jsx';
import CubeNet from '../components/CubeNet.jsx';
import { useRace } from '../lib/store.js';
import { runDemo } from '../lib/demo.js';
import { fetchHealth, fetchRuns, fetchSuite, followRun, replayRun, startLiveRun, stopRun } from '../lib/live.js';

const SPEEDS = [1, 2.5, 5];

function Select({ value, onChange, disabled, children }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="min-w-0 rounded-xl border border-line bg-white px-2.5 py-1.5 text-[13px] font-semibold disabled:opacity-60"
    >
      {children}
    </select>
  );
}

export default function Race() {
  const { lanes, lineup, puzzle, puzzleIndex, puzzleTotal, running, speed, source, runId, setSpeed, dispatch } = useRace();
  const [mode, setMode] = useState('live');
  const [tier, setTier] = useState('warmup');
  const [count, setCount] = useState('all');
  const [repeats, setRepeats] = useState(1);
  const [lunaVariant, setLunaVariant] = useState('luna');
  const [jevVariant, setJevVariant] = useState('jev');
  const [lineupKind, setLineupKind] = useState('main');
  const [health, setHealth] = useState(null);
  const [suite, setSuite] = useState(null);
  const [runs, setRuns] = useState([]);
  const [replayId, setReplayId] = useState('');
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const abortRef = useRef(null);
  const followingRef = useRef(null); // run id this page is already streaming

  const refresh = () => {
    fetchHealth().then(setHealth).catch(() => setHealth(null));
    fetchSuite().then(setSuite).catch(() => setSuite(null));
    fetchRuns()
      .then((r) => {
        setRuns(r);
        setReplayId((cur) => cur || r[0]?.id || '');
      })
      .catch(() => setRuns([]));
  };
  useEffect(refresh, []);

  // Keep checking the backend so a restart or late start never leaves the page stuck as offline,
  // and re-attach to a live run that is already in progress (e.g. after a page reload).
  useEffect(() => {
    const tick = () =>
      fetchHealth()
        .then((h) => {
          setHealth(h);
          const st = useRace.getState();
          if (h.activeRun && !st.running && !followingRef.current) {
            followingRef.current = h.activeRun;
            followRun(h.activeRun, st.dispatch).then(() => {
              followingRef.current = null;
              refresh();
            });
          }
        })
        .catch(() => setHealth(null));
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (health && !suite) refresh();
  }, [health]);

  const offline = !health;
  const tierPuzzles = suite?.puzzles.filter((p) => p.tier === tier) ?? [];
  // Planner ablation: same planner in every lane, only the chooser differs.
  const models = lineupKind === 'ablation' ? ['jev-hints', 'jev-planner', 'planner-random', 'planner-only'] : ['opus', jevVariant, lunaVariant, 'clef'];
  const notConfigured = models.filter((m) => health && !health.models[m]?.configured);

  const start = async () => {
    setError(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      if (mode === 'live') {
        setStarting(true);
        followingRef.current = 'own';
        await startLiveRun({ tier, count: count === 'all' ? undefined : Number(count), models, repeats }, dispatch);
        refresh();
      } else if (mode === 'replay') {
        await replayRun(replayId, dispatch, () => useRace.getState().speed, ctrl.signal);
      } else {
        await runDemo({ tier, count: count === 'all' ? 3 : Number(count) }, dispatch, () => useRace.getState().speed, ctrl.signal);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
      if (followingRef.current === 'own') followingRef.current = null;
    }
  };

  const stop = () => {
    if (source === 'live' && runId) stopRun(runId).catch((err) => setError(err.message));
    abortRef.current?.abort();
  };

  // Live runs play in real time; the speed control applies to replays and the preview.
  const effectiveSpeed = source === 'live' ? 1 : speed;
  const banner =
    source === 'demo'
      ? { cls: 'bg-amber-100 text-amber-800', text: 'UI PREVIEW · random moves', title: 'Random moves for every model. Not real models, never saved or counted.' }
      : source === 'replay'
        ? { cls: 'bg-sky-100 text-sky-800', text: 'REPLAY', title: `Replay of saved run ${runId}` }
        : source === 'live'
          ? { cls: 'bg-green-100 text-green-800', text: running ? '● LIVE · real model calls' : 'LIVE run finished · saved' }
          : null;

  return (
    <div className="flex flex-col gap-3 lg:h-full">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-card px-3 py-2 shadow-sm sm:px-4">
        <div className="flex items-center gap-3">
          {puzzle ? (
            <>
              <CubeNet facelets={puzzle.facelets} cell={6} />
              <div className="leading-tight">
                <div className="text-[11px] font-bold tracking-widest text-muted">
                  PUZZLE {puzzleIndex + 1} / {puzzleTotal}
                </div>
                <div className="font-mono text-sm font-bold">{puzzle.id}</div>
                <div className="text-xs text-muted">
                  shortest solution{' '}
                  <b className="text-ink">
                    {puzzle.optimal == null ? '—' : `${puzzle.optimal} moves${puzzle.optimalIsExact ? '' : ' (upper bound)'}`}
                  </b>
                </div>
                {banner && (
                  <span title={banner.title} className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-black tracking-wide ${banner.cls}`}>
                    {banner.text}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted">
              {offline ? 'Backend offline: start it with npm run dev in /server.' : 'Pick a test set and run the benchmark.'}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          <Select value={mode} onChange={setMode} disabled={running}>
            <option value="live" disabled={offline}>Live benchmark</option>
            <option value="replay" disabled={offline || !runs.length}>Replay saved run</option>
            <option value="demo">UI preview (random)</option>
          </Select>

          {mode === 'replay' ? (
            <Select value={replayId} onChange={setReplayId} disabled={running}>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id.slice(0, 16).replace('T', ' ')} · {r.puzzleIds.length} puzzles · {r.status}
                </option>
              ))}
            </Select>
          ) : (
            <>
              <Select value={tier} onChange={setTier} disabled={running}>
                {TIERS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.scramble}
                  </option>
                ))}
              </Select>
              <Select value={count} onChange={setCount} disabled={running}>
                <option value="all">{mode === 'live' ? `All ${tierPuzzles.length || ''} puzzles` : '3 puzzles'}</option>
                {[1, 2, 3, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} puzzle{n > 1 ? 's' : ''}
                  </option>
                ))}
              </Select>
            </>
          )}

          {mode === 'live' && (
            <>
              <Select value={repeats} onChange={(v) => setRepeats(Number(v))} disabled={running}>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    ×{n} repeat{n > 1 ? 's' : ''}
                  </option>
                ))}
              </Select>
              <Select value={lineupKind} onChange={setLineupKind} disabled={running}>
                <option value="main">Main race</option>
                <option value="ablation">Planner ablation</option>
              </Select>
              {lineupKind === 'main' && (
                <>
                  <Select value={jevVariant} onChange={setJevVariant} disabled={running}>
                    <option value="jev">Jev: all moves</option>
                    <option value="jev-hints">Jev + planner hints</option>
                    <option value="jev-planner">Jev + certified moves</option>
                  </Select>
                  <Select value={lunaVariant} onChange={setLunaVariant} disabled={running}>
                    <option value="luna">Luna: low reasoning</option>
                    <option value="luna-high">Luna: high reasoning</option>
                  </Select>
                </>
              )}
            </>
          )}

          {mode !== 'live' && (
            <div className="flex rounded-full bg-ink p-1">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`rounded-full px-2.5 py-1 text-xs font-black ${speed === s ? 'bg-white text-ink' : 'text-white/70'}`}
                >
                  ▶▶ {s}x
                </button>
              ))}
            </div>
          )}

          {running ? (
            <button onClick={stop} className="rounded-xl bg-lose px-4 py-1.5 text-sm font-black text-white shadow">
              Stop
            </button>
          ) : (
            <button
              onClick={start}
              disabled={starting || (mode === 'live' && (offline || notConfigured.length > 0)) || (mode === 'replay' && !replayId)}
              className="rounded-xl bg-ink px-4 py-1.5 text-sm font-black text-white shadow disabled:opacity-40"
            >
              {mode === 'replay' ? 'Replay' : starting && !running ? 'Starting…' : 'Run benchmark'}
            </button>
          )}
        </div>
        {(error || notConfigured.length > 0 || (offline && mode !== 'demo')) && (
          <div className="w-full text-right text-xs font-semibold text-lose">
            {error ?? (offline ? 'Backend not reachable on port 5050. Start it with npm run dev in the project root; this page reconnects by itself.' : `Not configured on the server: ${notConfigured.map((m) => MODEL_BY_ID[m].name).join(', ')}`)}
          </div>
        )}
      </div>

      <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2 lg:grid-rows-[repeat(2,minmax(15rem,1fr))]">
        {lineup.map((id) => (
          <ModelCard key={id} model={MODEL_BY_ID[id]} lane={lanes[id]} start={puzzle?.facelets} speed={effectiveSpeed} />
        ))}
      </div>
    </div>
  );
}
