import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG, ROOT } from './config.js';
import { ADAPTERS } from './adapters/index.js';
import { warmSolver } from './solver.js';
import { warmDistancePool } from './distancePool.js';
import { warmPlanner } from './adapters/plannerLanes.js';
import { generateSuite, loadSuite, publicPuzzle } from './suite.js';
import { allTrials, getActiveRun, getRun, listRuns, startRun, stopRun } from './runner.js';

const app = express();
app.use(express.json());

const strip = ({ subscribers, controller, t0, ...r }) => r;

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    activeRun: getActiveRun()?.id ?? null,
    suite: Boolean(loadSuite()),
    policy: { moveLimit: CONFIG.moveLimit, callTimeoutMs: CONFIG.callTimeoutMs, trialTimeLimitMs: CONFIG.trialTimeLimitMs, maxRetries: CONFIG.maxRetries },
    models: Object.fromEntries(Object.values(ADAPTERS).map((a) => [a.id, { configured: a.configured(), ...a.describe() }])),
  });
});

app.get('/api/suite', async (_req, res) => {
  const suite = loadSuite() ?? (await generateSuite());
  res.json({ ...suite, puzzles: suite.puzzles.map(publicPuzzle) });
});

app.post('/api/runs', (req, res) => {
  const suite = loadSuite();
  if (!suite) return res.status(400).json({ error: 'no suite; GET /api/suite first' });
  const { tier, puzzleIds, models, repeats = 1, count } = req.body ?? {};
  let ids = puzzleIds ?? suite.puzzles.filter((p) => p.tier === tier).map((p) => p.id);
  if (count) ids = ids.slice(0, count);
  const missing = (models ?? []).filter((m) => !ADAPTERS[m]?.configured());
  if (missing.length) return res.status(400).json({ error: `not configured: ${missing.join(', ')}` });
  try {
    const run = startRun({ suite, puzzleIds: ids, models, repeats: Math.max(1, Math.min(5, Number(repeats))) });
    res.json({ runId: run.id });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

app.get('/api/runs', (_req, res) => res.json(listRuns()));

app.get('/api/runs/:id', (req, res) => {
  const run = getRun(req.params.id);
  run ? res.json(strip(run)) : res.status(404).json({ error: 'not found' });
});

app.post('/api/runs/:id/stop', (req, res) => res.json({ stopped: stopRun(req.params.id) }));

// Server-Sent Events: replays everything after Last-Event-ID, then streams live.
app.get('/api/runs/:id/stream', (req, res) => {
  const run = getRun(req.params.id);
  if (!run) return res.status(404).end();
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();

  const send = (e) => {
    res.write(`id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`);
    if (e.type === 'run_end') res.end();
  };
  const from = Number(req.get('Last-Event-ID') ?? -1) + 1;
  run.events.slice(from).forEach(send);
  if (!run.subscribers || run.status !== 'running') return res.end();

  run.subscribers.add(send);
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => {
    clearInterval(ping);
    run.subscribers.delete(send);
  });
});

app.get('/api/trials', (_req, res) => res.json(allTrials()));

// Serve the built client when present (single-process demo: npm run build && npm start).
const dist = path.join(ROOT, 'client', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

warmSolver();
warmDistancePool();
warmPlanner();
app.listen(CONFIG.port, () => console.log(`Rubik's Cube Race server on http://localhost:${CONFIG.port}`));
