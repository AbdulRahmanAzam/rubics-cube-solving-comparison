// Transport problems (network, HTTP 429/5xx, timeouts, CLI crashes) are retried by the runner.
// Malformed answers are not transport errors: they are logged and counted as such.
export class TransportError extends Error {
  constructor(message, { retryable = true, status } = {}) {
    super(message);
    this.name = 'TransportError';
    this.retryable = retryable;
    this.status = status;
  }
}

// Every adapter returns { move, raw, latencyMs, wallMs, confidence?, probabilities?, usage?, modelVersion? }.
// `move` is the model's answer as given; the runner validates it against the 18 legal moves.
