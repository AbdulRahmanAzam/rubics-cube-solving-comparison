# Rubik's Cube Race

AI Engineering, Assignment 02. **Abdul Rahman Azam, 23K-0061**

Can fast System-1 decision models beat a frontier LLM at solving a Rubik's Cube? Four models play
the same scrambled cubes under the same rules, one move per call, until they solve the cube or hit
the 30-move limit. The app measures speed (latency per move, total time) and thinking quality
(solve rate, optimality gap against the exact shortest solution).

| Model | Category | Assignment ID | How it is called here |
|---|---|---|---|
| Claude Opus 5.5 | Frontier LLM | `anthropic/claude-opus-5.5` | Claude Code CLI, headless and stripped (see below) |
| Jev | System-1 decision model | `typesafe/jev-1.13` | TypeSafe System One API, `choice` question |
| GPT-6 Luna | System-1 decision model | `openai/gpt-6-luna-decisions` | Codex CLI, headless and stripped, schema-forced answer |
| Cloudflare Clef | System-1 decision model | `cloudflare/clef` | Cloudflare Workers AI, `choice` question |

## Stack

- `client/`: React 19 + Vite + Tailwind 4, three.js cubes (react-three-fiber), Recharts
- `server/`: Node 22 + Express 5, Server-Sent Events for the live race
- `shared/`: the cube engine, model list and statistics, used by both sides

## Setup

```bash
npm run setup                 # installs root, server and client
cp .env.example .env          # fill in TYPESAFE_API_KEY, CF_ACCOUNT_ID, CF_API_TOKEN
cp client/.env.example client/.env   # student name and roll number shown on screen
claude                        # log in once (Opus)
codex login                   # log in once (Luna)
npm test                      # engine + solver tests
npm run smoke                 # one real call per model: credentials, parsing, latency
npm run dev                   # server on :5050, client on http://localhost:5173
```

API keys live only in the root `.env`, read by the server. The browser never sees them.

## How the AI plays (state/action formulation)

Like the Snake example from class, the game is a state/action loop:

- **State**: the 54-character facelet string (Kociemba order U R F D L B), the same faces as 3x3
  grids, a notation explanation, the model's own previous moves, moves used and moves remaining.
  The scramble is never shown (inverting it would be trivial), and no hint such as the distance to
  solved is given.
- **Action**: one of the 18 face turns of the half-turn metric (`U U' U2 ... B B' B2`), except the
  face turned by the previous move (`allowed_moves`, 15 options after the first move). Turning the
  same face twice in a row is never useful (`U` then `U'` cancels, `U` then `U` is `U2`) and no
  shortest solution contains it. The rule was added after Jev spent whole trials on one face
  (`R R' R R2 ...`). It applies to every model; a chat model naming a blocked move gets a malformed answer.
- **Decision models** get a `choice` question whose options are the allowed moves, each with a plain
  description. The chosen option, its confidence and the full probability vector are logged.
- **Chat models** get the identical instruction, notation and move list as a system prompt and must
  answer `{"move": "R'"}`, enforced with a JSON schema. The server validates every answer.

## Fairness rules

1. Every model gets byte-identical start states (seeded suite in `server/data/suites/main.json`),
   the same state object, the same instruction and move descriptions, the same move limit,
   timeout and retry policy.
2. The CLI-based models see only our prompt. Claude runs with no tools, no MCP servers, no skills,
   no settings or CLAUDE.md and no saved session. Codex runs with user config, rules, plugins,
   apps, browser/computer tools and hooks switched off, in an ephemeral session. Both run from an
   empty folder outside any repository.
3. Latency is model time per move, including the network trip to the provider and excluding our
   own process start-up: HTTP round trip for Jev and Clef, `duration_api_ms` for Claude, and
   `turn.started` to `turn.completed` for Codex. Wall-clock time is stored next to it.
4. Transport errors (network, HTTP 429/5xx, timeouts) are retried up to 2 times with backoff and
   counted. A trial that still fails, or hits a usage limit, ends as `error`: it is excluded from
   all rates and reported in its own column, because it says nothing about cube solving.
5. A malformed answer is logged with its raw text, counted, and asked once more. A second
   malformed answer uses up the turn with no state change. Malformed output is never converted.
6. Every live run is saved and counted. There is no delete button.
7. Ties are shown as ties, every rate shows its sample size, and the results slide answers Q1-Q4
   from the data only. Q5 is the student's own conclusion.
8. The "UI preview" mode plays random moves for every model and is never saved or counted.

## Experiment design

| Test set | Scramble | Puzzles | Shortest solution |
|---|---|---|---|
| Warm-up | 3-4 turns | 3 | exact |
| Primary | 4-5 turns | 10 | exact |
| Extension | 15-20 turns | 3 | upper bound (Kociemba two-phase, capped by scramble length) |

Warm-up and primary scrambles are kept only when their exact distance equals the scramble length.
Exact distances come from a meet-in-the-middle search (`server/src/solver.js`): a breadth-first
table of all 46,741 states within 4 moves of solved plus a 4-move search from the query state
gives the exact distance for anything up to 8 moves. It is checked against brute force in the tests.
The same solver measures, after every model move, whether the move brought the cube closer.

**Optimality gap = moves used - exact shortest moves**, computed on solved primary/warm-up trials.

## Using the app

- **Race**: pick a test set, number of puzzles, repeats and Luna's reasoning setting, then
  *Run benchmark*. Four lanes show the 3D cube, time, moves, current move, move history, distance
  to solved, and the result (SOLVED / RAN OUT OF MOVES / API ERROR) with rank medals.
- **Replay saved run**: plays a recorded run back with its real timing at 1x, 2.5x or 5x.
- **Dashboard**: per-model latency, total time, moves, success rate, optimality gap, optimal
  solves, malformed answers, closer-move rate, retries and errors, with charts.
- **Results slide**: the final slide for the recording.

## Deviations from the brief (stated honestly)

1. **Not routed through OpenRouter.** As a student I have no OpenRouter credit, so each model is
   called through its own provider or official CLI.
2. **Jev is 1.14, not 1.13.** The TypeSafe API only serves `jev-latest` (answers as `jev-1.14.0`)
   and `jev-preview`. `jev-1.13` returns "Unknown model".
3. **GPT-6 Luna runs as a chat model through Codex**, not through the Decisions endpoint. The
   answer is still a single forced choice among the same 18 moves, but without a probability
   vector. Low reasoning is the closest match to the Decisions API; a high-reasoning variant is
   available and reported separately.
4. **Claude and Codex calls start a CLI process.** That start-up time is excluded from model
   latency and kept in the wall-clock column.

## Why the decision models fail (checked, not assumed)

Jev's probabilities over the 18 moves are close to uniform (about 0.055 each, which is 1/18), so it
is guessing. Checks done on 2026-10-22:

- Cubes only one turn from solved: `jev-latest` 0/6, `jev-preview` 0/12 (it answers as
  `jev-1.14.0` too). With extra help (color names, wrong-sticker counts per face, and the instruction
  "the cube is one turn away, undo it") Jev reached at most 2/6, often the right face turned the wrong way.
- Even a perfect picker that always chooses the move with the best simple score (stickers in place,
  solved pieces, or the best score reachable within 2-3 more moves) solves only 0-2 of 40
  five-move scrambles. A cube has no smooth path to follow one move at a time; solving needs real
  search (planning several moves ahead), which a one-shot classifier does not do.
- Engine and prompt were ruled out: the engine matches `cubejs` on every move, and Opus solves the
  same states from the same input optimally.

"Any cube can be solved in 20 moves" is the length of the best solution found by computer search.
It does not mean that 30 moves chosen without search will solve it.

## Planner ablation: what does Jev add on top of search?

Public Jev cube projects all use the same pattern: code does the search, Jev makes the choice.
[jev-rubiks](https://github.com/maxlibin/jev-rubiks) lets a Kociemba solver solve and Jev coach;
a [Laya/Jev cube post](https://www.linkedin.com/posts/mohammedalaa_lead-triage-on-device-with-laya-mlx-activity-7507984672396824576-2uHv)
reports its model picks the right turn 15% of the time from 15 turns with distances written next to
them, but plays correctly when offered only the turns a planner certified. Other students running
this assignment ([fasihh/aiEngA2](https://github.com/fasihh/aiEngA2)) got 0/5 with plain Jev,
same as us.

A planner can solve the cube with no model at all, so we measure what the chooser adds. Four
lanes share one planner and differ only in who picks the move (race page: "Planner ablation"
line-up; command line: `npm run ablation -- <extraDeepScrambles> <seed>` in `server/`):

| Lane | Chooser | Options it sees | Can go wrong? |
|---|---|---|---|
| `planner-only` | none: the planner's own best move | - | no (upper bound) |
| `planner-random` | none: random pick | certified moves | no (what any chooser gets) |
| `jev-planner` | Jev | certified moves only | no |
| `jev-hints` | Jev | every allowed move (12-15), labeled CLOSER / NO PROGRESS / FARTHER with the move count | yes |

How the planner works (`server/src/planner.js`):

- Within 8 moves of solved it uses the exact search, so every certified move is optimal.
- Deeper cubes use Kociemba two-phase (`cubejs`). The first plan is shortened by racing the cube in
  all 24 orientations on a pool of solver workers (`PLANNER_BUDGET_MS`, default 8 s, once per
  state). Each turn, every allowed move is solved one step ahead; a move is certified when its
  follow-up is shorter than the current plan.
- Certified moves always shorten the known solution by at least one, so any chooser that picks
  only certified moves solves within the first plan's length (at most 22, under the 30-move limit).
- Planner time runs in a worker thread (it never slows the other lanes' timed calls), is logged per
  move (`planner.ms`) and counted in wall time. Model latency is Jev's call only, 0 for baselines.

Results, 2026-10-22, live Jev calls, 16 suite puzzles + 4 fresh 25-turn scrambles (seed 7):

| Chooser | Solved | Moves, solved (mean) | Deep scrambles (mean) | Gap on exact puzzles | Certified picks | Model latency / move |
|---|---|---|---|---|---|---|
| Planner alone | 20/20 | 9.6 | 19.6 | +0.00 | 100% | no model |
| Random pick | 20/20 | 9.6 | 19.6 | +0.00 | 100% | no model |
| Jev + certified | 20/20 | 9.6 | 19.6 | +0.00 | 100% | 362 ms |
| Jev + hints | 20/20 | 9.6 | 19.6 | +0.00 | 100% (250/250 moves) | 387 ms |

Extra probe: 24 states, all allowed moves offered, Jev asked for the move closest to solved.
With word labels 24/24 correct; with only numbers ("after this turn the cube is N moves from
solved") also 24/24. So Jev 1.14 compares the distances reliably; the 15% in the post above was a
different, smaller model (Laya 421M).

What this shows:

- The search solves the cube. Every chooser, including a random one, gets the same 100% and the
  same move counts, so on this task Jev adds no solving ability on top of the planner.
- Jev is a reliable, fast follower of explicit hints: given 12-15 options it never picked a
  non-certified move, at about 0.37 s per move.
- Without the planner (main benchmark) Jev solves 0%. A System-1 model is useful here only as the
  fast decision layer on top of a planner, not as the planner.

These lanes are not part of the fair benchmark: they are kept out of the main dashboard table and
the five answers, and shown in their own "Planner ablation" table.

## Results

_To be filled in from the Dashboard after the benchmark runs._

## Project layout

```
shared/   cube.js (engine), models.js, stats.js
server/   src/index.js (API + SSE), runner.js (trial loop and policy), solver.js, suite.js,
          prompt.js, adapters/ (jev, plannerLanes, clef, opus, luna), scripts/ (suite, smoke, ablation), test/
          planner.js + plannerWorker.js + solverPool.js/solverWorker.js (planner ablation lanes)
          data/suites/main.json, data/runs/*.json (every live run)
client/   src/pages (Race, Dashboard, Slide), src/components (Cube3D, ModelCard, ...), src/lib
```
