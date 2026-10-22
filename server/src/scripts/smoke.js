// One real call per model on a warm-up puzzle: checks credentials, parsing and latency.
// Usage: node src/scripts/smoke.js [modelId ...]
import { ADAPTERS } from '../adapters/index.js';
import { buildState } from '../prompt.js';
import { CONFIG } from '../config.js';
import { loadSuite, generateSuite } from '../suite.js';
import { isValidMove } from '../../../shared/cube.js';

const suite = loadSuite() ?? (await generateSuite());
const puzzle = suite.puzzles.find((p) => p.tier === 'warmup');
const state = buildState({ facelets: puzzle.facelets, history: [], moveLimit: CONFIG.moveLimit });
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['jev', 'clef', 'opus', 'luna'];

for (const id of ids) {
  const a = ADAPTERS[id];
  try {
    const r = await a.decide({ state, timeoutMs: CONFIG.callTimeoutMs });
    console.log(
      `${id.padEnd(10)} move=${r.move} valid=${isValidMove(r.move)} model=${Math.round(r.latencyMs)}ms wall=${Math.round(r.wallMs)}ms` +
        ` conf=${r.confidence ?? '-'} version=${r.modelVersion} tokens=${JSON.stringify(r.usage)}${r.raw ? ` raw=${r.raw}` : ''}`,
    );
  } catch (err) {
    console.log(`${id.padEnd(10)} ERROR ${err.message}`);
  }
}
