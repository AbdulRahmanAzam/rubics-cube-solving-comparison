# Assignment 02 — Rubik's Cube Race: Implementation Plan

Status (2026-10-22, 2:30 PM): frontend + backend complete and tested end to end on real calls (Jev, Clef, Opus). Luna adapter written, untested (Codex usage limit until 4:57 PM). Next: Luna smoke test, warm-up pilot per fairness protocol 12b, full benchmark, own git repo, recording. `npm run dev` from the project root starts both.

Done:
- `shared/cube.js` engine (matches `cubejs` on all 18 moves + 500 random scrambles), `shared/models.js`, `shared/stats.js`
- `client/`: Race page (2x2 animated 3D cubes, timer, moves, status, medals, result ribbons, speed pill), Dashboard (table + charts + JSON export), Results slide (stats + 5 auto-answers), student badge on every page
- Event protocol in `client/src/lib/store.js` (run_start, puzzle_start, thinking, move, trial_end, run_end). The backend SSE stream must emit exactly these.

PDF page 4 images = reference UI (Opus / Jev / GPT-6 Sol / "Laya" cards, TIME m:ss.cc, MOVES, thinking.. / deciding.., rank medals, SOLVED / RAN OUT OF MOVES / OUT OF TIME, 2.5x speed pill). One card shows OUT OF TIME at 5:00.00, so the reference used a 5-minute limit per trial too. We support status `timeout`; the limit value is a backend setting (demo uses 5 min).

## 1. What the assignment actually asks

A controlled experiment, not just a game. Core question: is a fast System-1 decision model
(milliseconds, one-shot choice) more useful than a slow frontier LLM that plans, if the LLM solves in
fewer moves?

Hard requirements (graded):

| # | Requirement | Source |
|---|---|---|
| R1 | 3x3 cube UI: scrambled cube, "run benchmark" button, current move, move history, final result, clear SOLVED vs MOVE LIMIT REACHED | 3A |
| R2 | One deterministic engine shared by all models: valid scramble, serialize state (54 chars), apply move, check solved | 3B |
| R3 | Dashboard per model: avg per-move latency, total solve time, total moves, success rate %, optimality gap | 3C |
| R4 | State/action formulation (like Snake): model gets state, returns one action | 4 |
| R5 | 3 decision models via a Decisions interface (typed `choice` question, options = moves), record confidence/probabilities | 5 |
| R6 | Opus via chat, constrained JSON `{"move": "R'"}`, validate, log + count malformed (never silently fix) | 5 |
| R7 | API keys only in backend env, `.env.example` committed, no real keys | 5 |
| R8 | Test sets: warm-up 3-4 turns, primary 4-5 turns (exact optimum), extension 15-20 turns | 6 |
| R9 | Min 5 primary puzzles x 4 models = 20 trials; 10+ and repeats = stronger | 6 |
| R10 | Move limit 30; limit = failure; same timeout + retry policy for all, retries/invalid logged | 6 |
| R11 | BFS / complete search for exact shortest distance; gap = model moves - optimal | 7 |
| R12 | GitHub repo with setup instructions + env template | 8.1 |
| R13 | Screen recording: in-progress, completion, final stats slide, NAME + ROLL NO visible whole time | 8.2 |
| R14 | Answer the 5 questions with evidence (fastest, best solve rate, shortest, fastest = best?, which to use) | 8 |

Notes from careful reading:
- "Success rate" = % of trials solved within 30 moves.
- Gap is only meaningful for solved trials (unsolved = no gap, report separately). Report mean gap over solved trials plus count.
- Scramble length is not the optimal distance (moves can cancel), so the exact distance must be computed by search, not assumed.
- The models must never see the scramble sequence (inverting it is trivial). They see only the cube state and their own moves.
- Stack in PDF is a *suggestion* (Python/FastAPI); our React+Vite+Tailwind / Express+Node is allowed.
- "Through OpenRouter" is the intended route, but we have no OpenRouter credit. Decision (user, 2026-10-22): no OpenRouter code at all. Run everything through direct providers and state the deviation in the README and on the final slide.

## 2. Model access (free / owned routes)

| Model | Assignment ID | Our route | Endpoint | Cost |
|---|---|---|---|---|
| Jev 1.13 | `typesafe/jev-1.13` | TypeSafe direct. Key: `TYPESAFE_API_KEY` in `04 Tafreeh, Portfolio, Certificates, no use Projects/jev testing/.env` (copy into this project's `.env`) | `POST https://api.typesafe.ai/v1/systemone`, model `jev-latest`. Tested: the direct API only lists `jev-latest` (answers as `jev-1.14.0`) and `jev-preview`; `jev-1.13` returns 400 "Unknown model". So we run Jev 1.14 and say so. | own key |
| Cloudflare Clef | `cloudflare/clef` | Workers AI REST, free account | `POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/@cf/cloudflare/clef`, body `model: "clef"` | free 10,000 neurons/day |
| GPT-6 Luna Decisions | `openai/gpt-6-luna-decisions` | Primary: Codex CLI on ChatGPT subscription, model `gpt-6-luna` (confirmed in local Codex model list). Optional: OpenAI `/v1/decisions` if any API credit | `codex exec -m gpt-6-luna --output-schema ... --ephemeral` | subscription |
| Claude Opus 5.5 | `anthropic/claude-opus-5.5` | Claude Code CLI headless on subscription | `claude -p --model claude-opus-5-5 --output-format json --json-schema ... --no-session-persistence` | Agent SDK monthly credit |

Facts verified:
- Measured 2026-10-22: Jev direct call 0.62-0.78 s round trip for a 3-option choice (378 input tokens).
- Measured 2026-10-22: Clef call 0.87-1.42 s round trip (192 input tokens), token verified active. Cloudflare wraps the answer: `{result: {model, answers, usage}, success, errors}`, so the parser must unwrap `result`. Round-trip times include network latency from Pakistan, the same for every model.
- Decisions request shape is identical across TypeSafe / Cloudflare (and OpenRouter): `{model, state, questions: {next_move: {type: "choice", instructions, criteria: {label: description}}}}`. Response: `answers.next_move.{choice, confidence, probabilities}` + `usage`. So one shared request builder, three base URLs.
- OpenAI native Decisions uses a different shape (`input`, `questions[]` with `name`, `choices[{value, description}]`, answers array). Needs a small mapper if used.
- Jev choice limit 255 options (we use 18). Clef: 1-64 questions, 65k context.
- Clef budget: 21,818 neurons per 1M input tokens, so 10k neurons/day ≈ 458k input tokens/day ≈ 500+ moves/day at ~800 tokens/move. Enough for the full suite; split runs across days if needed. `clef-flash` is ~6x cheaper if we hit the cap (label clearly if used).
- Published Clef latency (Cloudflare blog): Clef median ~209 ms, Jev ~524 ms.
- `claude -p` JSON result includes `duration_ms` and `duration_api_ms`; `--json-schema` gives structured output; `--effort` sets thinking effort; `--system-prompt` replaces the Claude Code prompt; tools can be disabled.
- `codex exec` supports `--output-schema`, `--json` (JSONL events), `-o` last message, `--ephemeral`.

Honest deviations to state in the report:
1. Not routed through OpenRouter (no credit; student). Direct provider APIs and the official CLIs instead. Jev is 1.14 (1.13 no longer served on the direct API).
2. GPT-6 Luna runs as a chat model via Codex with a schema-constrained one-of-18 answer, not the Decisions endpoint. It is still a single forced choice from the same 18 options, but without a probability vector. If an OpenAI API key with even $1 of credit is available, switch to `/v1/decisions` (cost for the whole benchmark is cents at $0.10/M input).
3. CLI-backed models (Opus, Luna) are run stripped (see below), but each call still starts a process. We record both wall-clock and model-only latency; the dashboard compares speed on model-only latency, wall-clock shown too.

### Stripped CLI calls (user decision: only our prompt, nothing else)

Claude (tested, works on the subscription):
```
claude -p "<state JSON>" --model claude-opus-5-5 --output-format json \
  --json-schema '<move enum schema>' --system-prompt "<our game prompt>" \
  --tools "" --strict-mcp-config --setting-sources "" --disable-slash-commands \
  --no-session-persistence --effort high
```
Run from an empty working directory (no CLAUDE.md). Measured on a trivial prompt: total input 1,340 tokens (Claude Code's own prompt is gone), `duration_api_ms` 2,067 ms, wall 3,992 ms, so about 1.9 s is process start. Latency for Opus = `duration_api_ms`; the answer is in the `structured_output` field. Cost about $0.013 per trivial call; real moves with thinking will cost more.

Codex (flags verified, run blocked by usage limit until 4:57 PM 2026-10-22):
```
codex exec -m gpt-6-luna --output-schema schema.json --ephemeral \
  --skip-git-repo-check --sandbox read-only --disable plugins --disable apps \
  -c model_reasoning_effort=low --json "<prompt>"  < /dev/null
```
Must close stdin (`< /dev/null`, or `stdio: ['ignore', ...]` in Node), or it hangs on "Reading additional input from stdin". Run from an empty dir (no AGENTS.md). Model latency = time between `turn.started` and `turn.completed` JSONL events (measured by us as event arrival times). The Codex plan hit its usage limit during the test, so budget Luna calls carefully and run the Luna lane early in a fresh usage window.

Budget risk: Opus with thinking might use a few thousand tokens per move. Worst case 30 moves x 10+ puzzles. Opus usually stops early when it solves, but check remaining Agent SDK credit before the full run; run warm-up first to measure cost per move.

## 3. Architecture

```
rubiks-race/
  shared/            cube engine (pure JS ESM): used by server (authoritative) and client (render)
    cube.js          facelet model, 18 moves, apply, isSolved, toFacelets, fromFacelets
    scramble.js      seeded RNG (mulberry32) + scramble generator (no same-face repeats)
  server/            Express + Node 20+
    src/
      index.js       routes + SSE
      solver/
        optimal.js   IDA* exact shortest (HTM) for depth <= ~9, pruning table
        kociemba.js  wrapper over cubejs solver for extension set (upper bound only)
      adapters/
        decisions.js shared Decisions request builder + response parser
        jev.js       TypeSafe direct
        clef.js      Cloudflare Workers AI
        luna.js      codex CLI, stripped
        opus.js      claude CLI, stripped
        cli.js       shared spawn helper: empty cwd, stdin closed, timeout kill
      bench/
        suite.js     builds + saves test suite JSON (seeded, reproducible)
        runner.js    trial loop, retries, timeouts, logging
        stats.js     aggregates per model, per tier
      data/          suites/*.json, runs/*.json, runs/*.csv (gitignored except a sample)
    .env.example
  client/            React + Vite + Tailwind
    src/
      components/  Cube3D, CubeNet, ModelLane, MoveHistory, StatusBadge, StatsTable, Charts, StudentBadge
      pages/       Race, Dashboard, Slide
  README.md
```

Live updates: Server-Sent Events (`GET /api/runs/:id/stream`). Simple, one-way, works with Express, no socket library.

Storage: JSON files per run (plus CSV export). No database needed.

## 4. Cube engine (R2)

- Write our own small facelet engine (54 stickers, each move = sticker permutation). Easy to test, deterministic, and we control the move definitions. Use the `cubejs` npm package only as a cross-check in tests and for the Kociemba solver.
- Serialization: Kociemba facelet string, face order U R F D L B, 9 stickers per face read row by row, letter = face of the center that color belongs to. Solved = `UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB`.
- Move set: 18 face turns, half-turn metric (HTM): `U U' U2 D D' D2 R R' R2 L L' L2 F F' F2 B B' B2`. No slices, no rotations (God's number 20 is for HTM). Metric stated in report.
- Tests: each move x4 = identity, X X' = identity, known sequence (sexy move x6 = identity), facelet output matches cubejs for random sequences.

## 5. Exact optimal solver (R11)

- IDA* with a corner-orientation/edge-orientation admissible heuristic, or simply bidirectional BFS. Primary scrambles are 4-5 moves, so plain IDDFS with move pruning (no same face twice, opposite faces in fixed order) is enough: ~18 x 15^4 ≈ 900k nodes at depth 5, well under a second in Node.
- Also compute per-step: distance before and after each model move (for small states). This gives extra metrics: "% of moves that reduced distance" and a distance-over-time chart per model. Very good evidence for the System-1 vs System-2 story.
- Extension set (15-20 turns): exact optimum is infeasible without huge tables. Use Kociemba (cubejs) as an upper-bound reference, clearly labeled "reference (not proven optimal)". Expect nobody to solve these anyway, so gap mostly N/A; that set measures failure behavior.

## 6. Test suite (R8, R9)

Seeded and saved once to `data/suites/main.json` so every model and every repeat gets byte-identical start states.

| Tier | Count | Scramble | Notes |
|---|---|---|---|
| Warm-up | 3 | 3-4 turns | adapter + engine check |
| Primary | 10 | 5 at 4 turns, 5 at 5 turns | exact optimum stored; reject scrambles whose exact distance < 3 |
| Extension | 3 | 15-20 turns | Kociemba reference |

Primary run twice (repeat 1 and 2) for 2 x 10 x 4 = 80 primary trials. Minimum acceptable fallback: 5 primary x 4 = 20 if budget runs short.

## 7. State / action contract (R4, fairness)

Identical `state` object for all four models, built by one function:

```json
{
  "cube_facelets": "<54-char Kociemba string>",
  "faces": { "U": ["UUU","UUU","UUU"], "R": [...], "F": [...], "D": [...], "L": [...], "B": [...] },
  "notation": "Faces U R F D L B. Each face is read top-left to bottom-right while looking straight at that face. Sticker letter = the face whose center has that color. Solved = every face has 9 equal letters.",
  "recent_moves": ["R", "U'"],
  "moves_used": 2,
  "moves_remaining": 28
}
```

- History policy: full list of the model's own moves in this trial (max 30), same for everyone.
- Action space: the 18 HTM moves. Same instruction text: "Choose the single next move most likely to bring the cube closer to the solved state." Same 18 criteria descriptions (e.g. `"R'": "Turn the right face 90 degrees counterclockwise, as seen looking at the right face"`).
- Decision models: `choice` question with these 18 criteria. Store `choice`, `confidence`, full `probabilities`.
- Opus: system prompt = same instructions + criteria list + "Reply only with JSON {\"move\": \"<one of the 18>\"}"; user message = the same state JSON. Enforce with `--json-schema` (`move` enum of 18). Thinking enabled (`--effort high`) because that is the whole point of the frontier side.
- Luna (Codex): same prompt, `--output-schema` with the same enum.
- Validation: server checks the move is in the 18-move set before applying. Anything else = malformed.

## 8. Trial loop, timeouts, retries (R10)

Per trial: copy start state, loop until solved or 30 moves.

Same policy for every model:
- Per-call timeout: 120 s (Opus thinking can be slow; decision models never get near it).
- Transport errors (429/5xx/timeout/spawn failure): retry up to 2 times with backoff 1 s, 3 s. Logged as `retries`.
- Malformed output (parse failure or move not in set): logged + counted as `malformed`, re-asked once. If still malformed, that turn counts as a used move with no state change (so malformed output is penalized, never silently converted).
- Latency per move = time of the successful attempt only; total trial time = wall time including retries (both stored).

Run order: for each puzzle, run the four models in parallel (separate providers, so they do not slow each other), which gives the "race" view for the video. Repeats run sequentially.

Logged per move: model, puzzle id, step, state before, move, valid, malformed raw text (if any), latency wall ms, latency API ms, retries, confidence, probabilities, distance before/after (if computable), tokens/cost if returned.

## 9. Metrics + dashboard (R3, R14)

Per model (overall and per tier):
- Avg per-move latency (API) + p50/p95, wall latency shown next to it.
- Total time per trial (mean), in seconds.
- Total moves per trial (mean), plus moves for solved trials only.
- Success rate % = solved / trials.
- Optimality gap = moves - exact optimum, mean over solved primary trials, and "% solved optimally (gap 0)".
- Extra: malformed count, retries, % distance-reducing moves, mean confidence.

Charts (Recharts): latency bar (log scale, ms), success rate bar, gap bar, scatter "latency vs solve rate" (the trade-off picture), distance-to-solved line per model for a chosen puzzle.

Auto-generated answers panel for the 5 questions, filled from data (fastest = min avg latency, etc.), with the hybrid recommendation written by us from the evidence.

## 10. Frontend (R1, R13)

- `StudentBadge`: fixed top bar on every page with name + roll number (from `VITE_STUDENT_NAME`, `VITE_ROLL_NO`). Always visible during the recording, including the final slide. Non-negotiable.
- Race page: suite/tier selector, "Run benchmark" button, 4 lanes side by side. Each lane: CSS-3D cube (plus 2D net toggle) animating each move, current move big, move counter `n / 30`, last latency, scrolling move history chips, status badge: RUNNING / SOLVED in N moves / LIMIT REACHED (30).
- Shared scrambled start cube shown at top with puzzle id and exact optimal distance.
- Dashboard page: stats table + charts, filter by tier/repeat, CSV/JSON export.
- Slide page: full-screen, presentation-styled summary of section 3 stats + the 5 answers. This is the last thing in the video.
- Replay mode: replay a saved run with original timing (useful for the recording if a live run is slow or rate-limited; record a live run for at least the in-progress segment).

## 11. Optional bonus: hybrid agent (supports Q5)

Fifth lane "Hybrid": Opus plans a full solution once from the start state (one call, JSON array of moves), then the engine executes it; if the cube is not solved after the plan, a decision model picks moves (or Opus re-plans). Shows the real-world answer: plan slow once, act fast. Only if time allows; it is not required.

## 12. Security / repo (R7, R12)

- `.env` gitignored; `.env.example` with `TYPESAFE_API_KEY`, `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `OPUS_EFFORT`, `LUNA_EFFORT`, `MOVE_LIMIT=30`, `CALL_TIMEOUT_MS=120000`.
- All model calls server-side only; client talks only to our Express API.
- Commit sample run JSON (no keys) so the dashboard works on a fresh clone.
- README: setup, how to log in to `claude` and `codex` CLIs, how to get the free Cloudflare token (Workers AI permission), how to run the suite, deviations section, results + answers.
- Before calling it done: fresh clone, install, run end to end.

## 12b. Fairness protocol (user requirement: show the true result, no favourite)

Goal: every model plays at its own best inside its category, and the numbers decide.

1. Same input for all: identical start state, state JSON, instruction text, 18 move descriptions, history policy, move limit, timeout, retry policy. No hints for anyone: no scramble, no distance-to-solved, no lookahead or tools.
2. Best configuration per model, chosen in a pilot on warm-up puzzles only (never on primary puzzles), with the same tuning budget for each model (up to 3 prompt/setting variants each). The winning configuration is frozen and recorded before the primary run. Candidates:
   - Jev: `jev-latest` vs `jev-preview` (TypeSafe says preview "should be better in most ways").
   - Clef: `clef` (27B), not `clef-flash`, unless the free quota forces flash (then label it).
   - Luna: open question for the user. Low reasoning = closest to the Decisions API it is listed under; high reasoning = its "best" as a chat model. Option: run both and report both, clearly labelled.
   - Opus: effort `high` vs `max`.
   - Prompt variants may differ per interface (a `choice` question vs a chat message), but carry the same information.
3. Same latency definition: model time per move including the network trip to the provider, excluding our own process start-up. Reported next to wall-clock time.
4. No cherry-picking: every live run is saved server-side and counted. A failed or rate-limited call is logged as such, never silently re-run until it looks good. Repeats use the same seeds.
5. Ties are reported as ties. Every rate shows its sample size (solved/trials, gap n=).
6. The demo mode is a UI preview with uniformly random moves for every model, never saved or counted.
7. Q1-Q4 on the slide are computed from data. Q5 is written by the student after seeing the results. Nothing is pre-written.
8. The README lists the exact configuration per model (route, version actually returned by the API, effort, prompt variant) and all deviations.

## 13. Expected outcome (hypothesis, to be tested, not assumed)

Not shown anywhere in the app; only here for planning. The protocol above decides the result.

- Decision models: ~0.2-0.6 s per move, but one-step choices on a 54-char state with no lookahead; likely near-random, low solve rate except maybe some 3-4 move warm-ups.
- Opus with thinking: seconds to tens of seconds per move, can mentally simulate turns, likely much higher solve rate and small gaps on 4-5 move puzzles; extension set likely fails for all.
- Answer to Q5 likely "hybrid": frontier model plans, fast model executes / handles simple routing. The experiment decides.

## 14. Build order (later)

1. shared cube engine + tests (vs cubejs)
2. optimal solver + suite generator, save suite
3. adapters one by one with a single-call smoke test each (Jev, Clef, Luna, Opus), measure cost per move
4. runner + JSON logs, run warm-up tier
5. Express API + SSE
6. React race page, then dashboard, then slide
7. full benchmark run (split across days for Clef free quota if needed)
8. README, fresh-clone test, recording
