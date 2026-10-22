import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../..');
loadEnv({ path: path.join(ROOT, '.env'), quiet: true });

const env = (k, d) => process.env[k] ?? d;
const num = (k, d) => Number(process.env[k] ?? d);

export const CONFIG = {
  port: num('PORT', 5050),
  // DATA_DIR lets tests write to a scratch folder so they never mix with real results.
  dataDir: env('DATA_DIR', path.join(ROOT, 'server', 'data')),

  moveLimit: num('MOVE_LIMIT', 30),
  callTimeoutMs: num('CALL_TIMEOUT_MS', 180000),
  // 0 = no limit (the assignment only defines the move limit).
  trialTimeLimitMs: num('TRIAL_TIME_LIMIT_MS', 0),
  maxRetries: num('MAX_RETRIES', 2),
  retryBackoffMs: [1000, 3000],

  jev: {
    apiKey: env('TYPESAFE_API_KEY'),
    url: env('TYPESAFE_URL', 'https://api.typesafe.ai/v1/systemone'),
    model: env('JEV_MODEL', 'jev-latest'),
  },
  clef: {
    accountId: env('CF_ACCOUNT_ID'),
    apiToken: env('CF_API_TOKEN'),
    model: env('CLEF_MODEL', 'clef'),
  },
  opus: {
    bin: env('CLAUDE_BIN', 'claude'),
    model: env('OPUS_MODEL', 'claude-opus-5-5'),
    effort: env('OPUS_EFFORT', 'high'),
  },
  luna: {
    // Codex is installed as an npm package; spawning its JS entry avoids the Windows .cmd shim.
    codexJs: env(
      'CODEX_JS',
      path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js'),
    ),
    model: env('LUNA_MODEL', 'gpt-6-luna'),
    effort: env('LUNA_EFFORT', 'low'),
    highEffort: env('LUNA_HIGH_EFFORT', 'high'),
  },
};
