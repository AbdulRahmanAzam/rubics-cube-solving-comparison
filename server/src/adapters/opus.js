// Claude Opus 5.5 through the Claude Code CLI in headless mode, stripped down so the model
// sees only our system prompt and the state: no tools, no MCP servers, no skills or slash
// commands, no settings or CLAUDE.md, no saved session.
import { CONFIG } from '../config.js';
import { CHAT_SYSTEM_PROMPT, MOVE_SCHEMA, chatUserMessage } from '../prompt.js';
import { runCli } from './cli.js';
import { TransportError } from './errors.js';

const args = () => [
  '-p',
  '--model', CONFIG.opus.model,
  '--effort', CONFIG.opus.effort,
  '--output-format', 'json',
  '--json-schema', JSON.stringify(MOVE_SCHEMA),
  '--system-prompt', CHAT_SYSTEM_PROMPT,
  '--tools', '',
  '--strict-mcp-config',
  '--setting-sources', '',
  '--disable-slash-commands',
  '--no-session-persistence',
];

function parseMove(result) {
  if (result.structured_output?.move) return result.structured_output.move;
  const text = String(result.result ?? '');
  const m = text.match(/\{[^{}]*"move"\s*:\s*"([^"]*)"[^{}]*\}/);
  return m ? m[1] : null;
}

export const opus = {
  id: 'opus',
  configured: () => true,
  describe: () => ({ route: 'Claude Code CLI, headless', model: CONFIG.opus.model, effort: CONFIG.opus.effort }),

  async decide({ state, timeoutMs }) {
    const { code, stdout, stderr, wallMs } = await runCli({
      cmd: CONFIG.opus.bin,
      args: args(),
      input: chatUserMessage(state),
      timeoutMs,
    });

    let result;
    try {
      result = JSON.parse(stdout);
    } catch {
      throw new TransportError(`claude exited ${code}: ${(stderr || stdout).slice(0, 300)}`);
    }
    if (result.is_error) {
      const msg = String(result.result ?? result.subtype ?? 'error');
      const retryable = !/usage limit|credit|unauthor|login/i.test(msg);
      throw new TransportError(`claude error: ${msg.slice(0, 300)}`, { retryable });
    }

    const move = parseMove(result);
    return {
      move,
      raw: move ? undefined : String(result.result ?? '').slice(0, 500),
      // Model time as reported by the CLI (API calls only, excludes process start-up).
      latencyMs: result.duration_api_ms ?? wallMs,
      wallMs,
      usage: result.usage
        ? {
            input_tokens:
              (result.usage.input_tokens ?? 0) +
              (result.usage.cache_creation_input_tokens ?? 0) +
              (result.usage.cache_read_input_tokens ?? 0),
            output_tokens: result.usage.output_tokens ?? 0,
            thinking_tokens: result.usage.output_tokens_details?.thinking_tokens ?? null,
            cost: result.total_cost_usd ?? null,
          }
        : null,
      modelVersion: Object.keys(result.modelUsage ?? {})[0] ?? CONFIG.opus.model,
    };
  },
};
