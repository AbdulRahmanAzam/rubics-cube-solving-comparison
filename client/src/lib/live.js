// Backend connection: start live runs (SSE stream), replay saved runs, load results.
async function api(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

export const fetchHealth = () => api('/health');
export const fetchSuite = () => api('/suite');
export const fetchRuns = () => api('/runs');
export const fetchTrials = () => api('/trials');
export const stopRun = (id) => api(`/runs/${id}/stop`, { method: 'POST' });

export function followRun(runId, dispatch) {
  return new Promise((resolve) => {
    const es = new EventSource(`/api/runs/${runId}/stream`);
    es.onmessage = (msg) => {
      const e = JSON.parse(msg.data);
      dispatch(e);
      if (e.type === 'run_end') {
        es.close();
        resolve();
      }
    };
  });
}

export async function startLiveRun(options, dispatch) {
  const { runId } = await api('/runs', { method: 'POST', body: options });
  await followRun(runId, dispatch);
  return runId;
}

// Replays a saved run with its original timing (scaled by speed). Never stored again.
export async function replayRun(runId, dispatch, getSpeed, signal) {
  const run = await api(`/runs/${runId}`);
  let prevT = 0;
  for (const e of run.events) {
    if (signal.aborted) break;
    const wait = (e.t - prevT) / getSpeed();
    prevT = e.t;
    // Skip the pause between puzzles mostly: keep it short so replays stay watchable.
    const capped = e.type === 'puzzle_start' ? Math.min(wait, 4000) : wait;
    if (capped > 0) await new Promise((r) => setTimeout(r, capped));
    dispatch(e.type === 'run_start' ? { ...e, source: 'replay' } : e);
  }
  if (signal.aborted) dispatch({ type: 'run_end' });
}
