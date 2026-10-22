// Regenerates data/suites/main.json (seeded, so the same seed gives the same puzzles).
import { generateSuite } from '../suite.js';

const seed = Number(process.argv[2] ?? 20261022);
const suite = await generateSuite({ seed });
for (const p of suite.puzzles) {
  console.log(`${p.id.padEnd(14)} scramble ${String(p.scrambleLength).padStart(2)}  shortest ${p.optimal}${p.optimalIsExact ? '' : ' (upper bound)'}`);
}
