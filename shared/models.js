// The four benchmarked models. Order = grid order on the race screen.
export const MODELS = [
  {
    id: 'opus',
    name: 'Claude Opus 5.5',
    short: 'Opus 5.5',
    kind: 'llm',
    category: 'Frontier LLM',
    assignmentId: 'anthropic/claude-opus-5.5',
    route: 'Claude Code CLI (headless, stripped)',
    color: '#D97757',
  },
  {
    id: 'jev',
    name: 'Jev',
    short: 'Jev',
    kind: 'decision',
    category: 'System-1 decision model',
    assignmentId: 'typesafe/jev-1.13',
    route: 'TypeSafe System One API (jev-latest = 1.14)',
    color: '#C026D3',
  },
  // Planner ablation (server/src/adapters/plannerLanes.js). Same planner, different chooser.
  // `ablation` lanes are not the fair benchmark: they are kept out of the main table and the
  // five answers, and shown in their own table.
  {
    id: 'jev-hints',
    lane: 'jev',
    optional: true,
    ablation: true,
    name: 'Jev + planner hints',
    short: 'Jev + hints',
    kind: 'decision',
    category: 'Jev picks from all moves, each labeled closer / no progress / farther',
    assignmentId: 'typesafe/jev-1.13',
    route: 'TypeSafe System One API; every allowed move labeled by exact search / Kociemba look-ahead',
    color: '#A21CAF',
  },
  {
    id: 'jev-planner',
    lane: 'jev',
    optional: true,
    ablation: true,
    name: 'Jev + certified moves',
    short: 'Jev + certified',
    kind: 'decision',
    category: 'Jev picks only among solver-certified moves',
    assignmentId: 'typesafe/jev-1.13',
    route: 'TypeSafe System One API; options pre-filtered by exact search / Kociemba look-ahead',
    color: '#86198F',
  },
  {
    id: 'planner-random',
    optional: true,
    ablation: true,
    name: 'Planner + random pick',
    short: 'Random pick',
    kind: 'baseline',
    category: 'No model: random certified move',
    route: 'Planner only, no model call',
    color: '#64748B',
  },
  {
    id: 'planner-only',
    optional: true,
    ablation: true,
    name: 'Planner alone',
    short: 'Planner alone',
    kind: 'baseline',
    category: 'No model: plays its own best move',
    route: 'Planner only, no model call',
    color: '#334155',
  },
  {
    id: 'luna',
    name: 'GPT-6 Luna',
    short: 'GPT-6 Luna',
    kind: 'decision',
    category: 'System-1 decision model',
    assignmentId: 'openai/gpt-6-luna-decisions',
    route: 'Codex CLI (headless, stripped), reasoning effort low',
    color: '#10A37F',
  },
  {
    // Same model, high reasoning effort. Optional: replaces the low-effort Luna lane when selected.
    id: 'luna-high',
    lane: 'luna',
    optional: true,
    name: 'GPT-6 Luna (high reasoning)',
    short: 'GPT-6 Luna · high',
    kind: 'decision',
    category: 'System-1 decision model, run with high reasoning',
    assignmentId: 'openai/gpt-6-luna-decisions',
    route: 'Codex CLI (headless, stripped), reasoning effort high',
    color: '#0B7A5E',
  },
  {
    id: 'clef',
    name: 'Cloudflare Clef',
    short: 'Clef',
    kind: 'decision',
    category: 'System-1 decision model',
    assignmentId: 'cloudflare/clef',
    route: 'Cloudflare Workers AI',
    color: '#F38020',
  },
];

export const MODEL_BY_ID = Object.fromEntries(MODELS.map((m) => [m.id, m]));

// Default race line-up: one model per lane.
export const DEFAULT_LINEUP = MODELS.filter((m) => !m.optional).map((m) => m.id);

export const MOVE_LIMIT = 30;

export const TIERS = [
  { id: 'warmup', name: 'Warm-up', scramble: '3-4 turns' },
  { id: 'primary', name: 'Primary', scramble: '4-5 turns' },
  { id: 'extension', name: 'Extension', scramble: '15-20 turns' },
];
