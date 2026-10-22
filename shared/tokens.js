// Token counts as reported by each provider, in one shape: { input, output, reasoning }.
//
// - Jev / Clef (Decisions APIs): { input_tokens, output_tokens }
// - Opus (Claude Code CLI):      { input_tokens (cache reads/writes included), output_tokens, thinking_tokens }
// - Luna (Codex CLI):            { input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens }
//
// Reasoning/thinking tokens are part of output for both CLIs, so `reasoning` is a subset of
// `output`, never added on top. Missing usage stays null (unknown), never 0.
export function tokensOf(usage) {
  if (!usage) return null;
  const input = usage.input_tokens ?? null;
  const output = usage.output_tokens ?? null;
  if (input == null && output == null) return null;
  return {
    input: input ?? 0,
    output: output ?? 0,
    reasoning: usage.reasoning_output_tokens ?? usage.thinking_tokens ?? null,
  };
}

// Sum of several { input, output, reasoning } (nulls skipped); null when none are known.
export function sumTokens(list) {
  const known = list.filter(Boolean);
  if (!known.length) return null;
  const reasoning = known.filter((t) => t.reasoning != null);
  return {
    input: known.reduce((a, t) => a + t.input, 0),
    output: known.reduce((a, t) => a + t.output, 0),
    reasoning: reasoning.length ? reasoning.reduce((a, t) => a + t.reasoning, 0) : null,
  };
}

// 1234 -> "1.2k", 19586 -> "19.6k", null -> "—"
export function compactTokens(n) {
  if (n == null) return '—';
  if (n < 1000) return String(Math.round(n));
  if (n < 1e6) return `${(n / 1000).toFixed(n < 1e5 ? 1 : 0)}k`;
  return `${(n / 1e6).toFixed(1)}M`;
}
