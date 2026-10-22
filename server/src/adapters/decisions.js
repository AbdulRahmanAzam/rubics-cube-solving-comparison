// Shared Decisions-style call: TypeSafe (Jev) and Cloudflare Workers AI (Clef) take the same
// { model, state, questions } body and return answers keyed by question name.
import { INSTRUCTIONS, criteriaFor } from '../prompt.js';
import { TransportError } from './errors.js';

export function decisionBody(model, state, question) {
  return {
    model,
    state,
    questions: {
      next_move: question ?? { type: 'choice', instructions: INSTRUCTIONS, criteria: criteriaFor(state.allowed_moves) },
    },
  };
}

export async function postDecision({ url, token, model, state, question, timeoutMs, unwrap = (j) => j }) {
  const started = performance.now();
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(decisionBody(model, state, question)),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new TransportError(err.name === 'TimeoutError' ? `timeout after ${timeoutMs} ms` : err.message);
  }
  const text = await res.text();
  const latencyMs = performance.now() - started;

  if (!res.ok) {
    const retryable = res.status === 429 || res.status >= 500;
    throw new TransportError(`HTTP ${res.status}: ${text.slice(0, 300)}`, { retryable, status: res.status });
  }

  let json;
  try {
    json = unwrap(JSON.parse(text));
  } catch {
    return { move: null, raw: text.slice(0, 500), latencyMs, wallMs: latencyMs };
  }
  const answer = json?.answers?.next_move;
  return {
    move: answer?.choice ?? null,
    raw: answer ? undefined : text.slice(0, 500),
    confidence: answer?.confidence ?? null,
    probabilities: answer?.probabilities ?? null,
    usage: json?.usage ?? null,
    modelVersion: json?.model ?? model,
    latencyMs,
    wallMs: latencyMs,
  };
}
