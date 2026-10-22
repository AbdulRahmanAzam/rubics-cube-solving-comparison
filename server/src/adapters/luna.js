// GPT-6 Luna through the Codex CLI (ChatGPT subscription), headless and stripped: user config,
// rules, plugins, apps, browser/computer tools and hooks are switched off, the session is
// ephemeral, and the answer is forced to the move schema.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../config.js';
import { CHAT_SYSTEM_PROMPT, MOVE_SCHEMA, chatUserMessage } from '../prompt.js';
import { SANDBOX_DIR, runCli } from './cli.js';
import { TransportError } from './errors.js';

const SCHEMA_FILE = path.join(SANDBOX_DIR, 'move-schema.json');
writeFileSync(SCHEMA_FILE, JSON.stringify(MOVE_SCHEMA));

const DISABLED = ['plugins', 'apps', 'browser_use', 'browser_use_external', 'in_app_browser', 'computer_use',
  'image_generation', 'hooks', 'skill_search', 'skill_mcp_dependency_install', 'view_image'];

const args = (effort) => [
  CONFIG.luna.codexJs,
  'exec',
  '-m', CONFIG.luna.model,
  '-c', `model_reasoning_effort=${effort}`,
  '--output-schema', SCHEMA_FILE,
  '--ephemeral',
  '--ignore-user-config',
  '--ignore-rules',
  '--skip-git-repo-check',
  '--sandbox', 'read-only',
  ...DISABLED.flatMap((f) => ['--disable', f]),
  '--json',
  '-',
];

function makeLuna(id, effort) {
  return {
    id,
    configured: () => true,
    describe: () => ({ route: 'Codex CLI, headless', model: CONFIG.luna.model, effort: effort() }),

    async decide({ state, timeoutMs }) {
      const times = {};
      const events = [];
      const { code, stderr, wallMs } = await runCli({
        cmd: process.execPath,
        args: args(effort()),
        input: `${CHAT_SYSTEM_PROMPT}\n\n${chatUserMessage(state)}`,
        timeoutMs,
        onLine: (line, t) => {
          try {
            const e = JSON.parse(line);
            events.push(e);
            if (e.type === 'turn.started') times.start ??= t;
            if (e.type === 'turn.completed' || e.type === 'turn.failed') times.end = t;
          } catch {
            // non-JSON noise
          }
        },
      });

      const failed = events.find((e) => e.type === 'turn.failed' || e.type === 'error');
      if (failed) {
        const msg = failed.error?.message ?? failed.message ?? 'codex error';
        throw new TransportError(`codex: ${msg.slice(0, 300)}`, { retryable: !/usage limit|log in|auth/i.test(msg) });
      }
      const done = events.find((e) => e.type === 'turn.completed');
      if (!done) throw new TransportError(`codex exited ${code}: ${stderr.slice(0, 300)}`);

      const messages = events.filter((e) => e.type === 'item.completed' && e.item?.type === 'agent_message');
      const text = messages.at(-1)?.item?.text ?? '';
      const toolCalls = events.filter((e) => e.type === 'item.completed' && e.item?.type && e.item.type !== 'agent_message' && e.item.type !== 'reasoning').length;

      let move = null;
      try {
        move = JSON.parse(text).move ?? null;
      } catch {
        move = text.match(/"move"\s*:\s*"([^"]*)"/)?.[1] ?? null;
      }
      return {
        move,
        raw: move ? undefined : text.slice(0, 500),
        // Model time = turn.started -> turn.completed, excludes CLI start-up.
        latencyMs: times.start != null && times.end != null ? times.end - times.start : wallMs,
        wallMs,
        usage: done.usage ?? null,
        toolCalls,
        modelVersion: CONFIG.luna.model,
      };
    },
  };
}

export const luna = makeLuna('luna', () => CONFIG.luna.effort);
export const lunaHigh = makeLuna('luna-high', () => CONFIG.luna.highEffort);
