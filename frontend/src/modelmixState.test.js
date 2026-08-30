import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  cancelModelMixRun,
  consumeModelMixSSE,
  replayModelMixRun,
  startModelMixRun,
} from './modelmixApi.js';
import {
  applyModelMixEvent,
  applyReplayError,
  controlState,
  createModelMixState,
  hydrateModelMixState,
  modelSelectorsDisabled,
} from './modelmixState.js';

globalThis.window = { location: { hostname: 'localhost' } };

test('model selectors freeze for every active lifecycle state only', () => {
  for (const status of ['connecting', 'running', 'reconnecting', 'cancelling']) {
    assert.equal(modelSelectorsDisabled(status), true, status);
  }
  for (const status of ['idle', 'completed', 'partial', 'failed', 'cancelled', 'replay_gap', 'expired']) {
    assert.equal(modelSelectorsDisabled(status), false, status);
  }
});

test('durable hydration places canonical content by seat and replay remains deduplicated', () => {
  const document = {
    schema_version: 1,
    session: {
      session_id: 'session-1',
      runs: [{
        run_id: 'run-1', latest_seq: 8, status: 'partial',
        prompt: 'Persisted question',
        models: { worker_a: 'p:a', moderator: 'p:m', worker_b: 'p:b' },
      }],
      messages: [
        { run_id: 'run-1', seat: 'worker_a', content: 'A', status: 'completed' },
        { run_id: 'run-1', seat: 'moderator', content: 'M', status: 'completed' },
        { run_id: 'run-1', seat: 'worker_b', content: 'B partial', status: 'failed', error: 'stopped' },
      ],
    },
  };
  let state = hydrateModelMixState(document);
  assert.equal(state.worker_a.text, 'A');
  assert.equal(state.moderator.text, 'M');
  assert.equal(state.worker_b.text, 'B partial');
  assert.equal(state.moderator.status, 'partial');
  assert.equal(state.lastSeq, 8);
  assert.equal(state.prompt, 'Persisted question');
  state = applyModelMixEvent(state, {
    run_id: 'run-1', seq: 8, type: 'seat_delta', seat_id: 'worker_b', delta: ' duplicate',
  });
  assert.equal(state.worker_b.text, 'B partial');
});

test('seat deltas route independently and duplicate or replayed seq is ignored', () => {
  let state = createModelMixState();
  state = applyModelMixEvent(state, { run_id: 'run', seq: 1, type: 'seat_delta', seat_id: 'worker_a', delta: 'A' });
  state = applyModelMixEvent(state, { run_id: 'run', seq: 2, type: 'seat_delta', seat_id: 'worker_b', delta: 'B' });
  state = applyModelMixEvent(state, { run_id: 'run', seq: 2, type: 'seat_delta', seat_id: 'worker_b', delta: 'B' });
  state = applyModelMixEvent(state, { run_id: 'run', seq: 3, type: 'seat_delta', seat_id: 'worker_a', delta: '2' });
  assert.equal(state.worker_a.text, 'A2');
  assert.equal(state.worker_b.text, 'B');
  assert.equal(state.moderator.text, '');
  assert.equal(state.lastSeq, 3);
});

test('late events from another run cannot contaminate hydrated state', () => {
  const state = {
    ...createModelMixState(),
    runId: 'current-run',
    lastSeq: 4,
    worker_a: { text: 'kept', status: 'completed', error: null },
  };
  const unchanged = applyModelMixEvent(state, {
    run_id: 'old-run', seq: 99, type: 'seat_delta', seat_id: 'worker_a', delta: ' leaked',
  });
  assert.equal(unchanged, state);
  assert.equal(unchanged.worker_a.text, 'kept');
});

test('Moderator waits, starts, streams once, and completes with finish reason', () => {
  let state = createModelMixState();
  assert.equal(state.moderator.status, 'waiting');
  assert.equal(state.moderator.started, false);

  state = applyModelMixEvent(state, { run_id: 'run', seq: 1, type: 'moderator_started' });
  assert.equal(state.moderator.status, 'running');
  assert.equal(state.moderator.started, true);
  state = applyModelMixEvent(state, { run_id: 'run', seq: 2, type: 'moderator_delta', delta: 'final ' });
  state = applyModelMixEvent(state, { run_id: 'run', seq: 2, type: 'moderator_delta', delta: 'duplicate' });
  state = applyModelMixEvent(state, { run_id: 'run', seq: 3, type: 'moderator_delta', delta: 'answer' });
  state = applyModelMixEvent(state, {
    run_id: 'run', seq: 4, type: 'moderator_completed', finish_reason: 'stop',
  });
  assert.equal(state.moderator.text, 'final answer');
  assert.equal(state.moderator.status, 'completed');
  assert.equal(state.moderator.finishReason, 'stop');
  assert.equal(state.worker_a.text, '');
  assert.equal(state.worker_b.text, '');
});

test('Worker events never contaminate Moderator or peer panels', () => {
  let state = createModelMixState();
  state = applyModelMixEvent(state, {
    run_id: 'run', seq: 1, type: 'seat_delta', seat_id: 'worker_a', delta: 'only A',
  });
  assert.equal(state.worker_a.text, 'only A');
  assert.equal(state.worker_b.text, '');
  assert.equal(state.moderator.text, '');
  state = applyModelMixEvent(state, {
    run_id: 'run', seq: 2, type: 'seat_delta', seat_id: 'worker_b', delta: 'only B',
  });
  assert.equal(state.worker_a.text, 'only A');
  assert.equal(state.worker_b.text, 'only B');
  assert.equal(state.moderator.text, '');
});

test('Moderator failure preserves both worker transcripts', () => {
  let state = createModelMixState();
  state = applyModelMixEvent(state, {
    run_id: 'run', seq: 1, type: 'seat_delta', seat_id: 'worker_a', delta: 'A evidence',
  });
  state = applyModelMixEvent(state, {
    run_id: 'run', seq: 2, type: 'seat_delta', seat_id: 'worker_b', delta: 'B evidence',
  });
  state = applyModelMixEvent(state, {
    run_id: 'run', seq: 3, type: 'moderator_failed', error: 'synthesis failed',
  });
  assert.equal(state.moderator.status, 'failed');
  assert.equal(state.moderator.error, 'synthesis failed');
  assert.equal(state.moderator.started, false);
  assert.equal(state.worker_a.text, 'A evidence');
  assert.equal(state.worker_b.text, 'B evidence');
});

test('Worker failure plus Moderator completion remains honestly partial', () => {
  let state = createModelMixState();
  state = applyModelMixEvent(state, {
    run_id: 'run', seq: 1, type: 'seat_failed', seat_id: 'worker_a', error: 'A failed',
  });
  state = applyModelMixEvent(state, {
    run_id: 'run', seq: 2, type: 'seat_delta', seat_id: 'worker_b', delta: 'B evidence',
  });
  state = applyModelMixEvent(state, { run_id: 'run', seq: 3, type: 'moderator_started' });
  state = applyModelMixEvent(state, {
    run_id: 'run', seq: 4, type: 'moderator_delta', delta: 'degraded answer',
  });
  state = applyModelMixEvent(state, { run_id: 'run', seq: 5, type: 'moderator_completed' });
  state = applyModelMixEvent(state, {
    run_id: 'run', seq: 6, type: 'run_completed', status: 'partial',
  });
  assert.equal(state.overall, 'partial');
  assert.equal(state.worker_a.status, 'failed');
  assert.equal(state.worker_b.text, 'B evidence');
  assert.equal(state.moderator.text, 'degraded answer');
  assert.equal(state.moderator.status, 'partial');
});

test('Cancellation during Moderator is terminal and resets controls', () => {
  let state = createModelMixState();
  state = applyModelMixEvent(state, { run_id: 'run', seq: 1, type: 'moderator_started' });
  state = applyModelMixEvent(state, { run_id: 'run', seq: 2, type: 'run_cancel_requested' });
  assert.deepEqual(controlState(state.overall), { sendDisabled: true, stopDisabled: false });
  state = applyModelMixEvent(state, { run_id: 'run', seq: 3, type: 'run_cancelled' });
  assert.equal(state.moderator.status, 'cancelled');
  assert.deepEqual(controlState(state.overall), { sendDisabled: false, stopDisabled: true });
});

test('Starting a new run intentionally resets all three transcripts', () => {
  let state = createModelMixState();
  state = applyModelMixEvent(state, {
    run_id: 'old', seq: 1, type: 'seat_delta', seat_id: 'worker_a', delta: 'old A',
  });
  state = applyModelMixEvent(state, {
    run_id: 'old', seq: 2, type: 'moderator_delta', delta: 'old M',
  });
  state = applyModelMixEvent(state, {
    run_id: 'old', seq: 3, type: 'seat_delta', seat_id: 'worker_b', delta: 'old B',
  });
  state = createModelMixState();
  assert.equal(state.worker_a.text, '');
  assert.equal(state.moderator.text, '');
  assert.equal(state.worker_b.text, '');
  assert.equal(state.lastSeq, 0);
});

test('Moderator-phase reconnect uses the last global sequence', async () => {
  let state = createModelMixState();
  state = applyModelMixEvent(state, { run_id: 'moderated-run', seq: 41, type: 'moderator_started' });
  state = applyModelMixEvent(state, {
    run_id: 'moderated-run', seq: 42, type: 'moderator_delta', delta: 'partial',
  });
  let requestedUrl = '';
  globalThis.fetch = async (url) => {
    requestedUrl = url;
    return new Response('', { status: 200 });
  };
  await replayModelMixRun(state.runId, state.lastSeq);
  assert.equal(
    requestedUrl,
    'http://localhost:8001/api/modelmix/runs/moderated-run/events?after_seq=42',
  );
});

test('failed seat preserves successful peer output', () => {
  let state = createModelMixState();
  state = applyModelMixEvent(state, { run_id: 'run', seq: 1, type: 'seat_delta', seat_id: 'worker_b', delta: 'kept' });
  state = applyModelMixEvent(state, { run_id: 'run', seq: 2, type: 'seat_failed', seat_id: 'worker_a', error: 'broken' });
  assert.equal(state.worker_a.status, 'failed');
  assert.equal(state.worker_a.error, 'broken');
  assert.equal(state.worker_b.text, 'kept');
});

test('Send and Stop enablement follows lifecycle state', () => {
  assert.deepEqual(controlState('idle'), { sendDisabled: false, stopDisabled: true });
  assert.deepEqual(controlState('connecting'), { sendDisabled: true, stopDisabled: true });
  assert.deepEqual(controlState('running'), { sendDisabled: true, stopDisabled: false });
  assert.deepEqual(controlState('reconnecting'), { sendDisabled: true, stopDisabled: false });
  assert.deepEqual(controlState('completed'), { sendDisabled: false, stopDisabled: true });
  assert.deepEqual(controlState('cancelled'), { sendDisabled: false, stopDisabled: true });
});

test('replay request uses the run ID and last processed sequence', async () => {
  let requestedUrl = '';
  globalThis.fetch = async (url) => {
    requestedUrl = url;
    return new Response('', { status: 200 });
  };
  await replayModelMixRun('run/id', 17);
  assert.equal(requestedUrl, 'http://localhost:8001/api/modelmix/runs/run%2Fid/events?after_seq=17');
});

test('run creation sends the explicit Moderator model unchanged', async () => {
  let requestBody = null;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response('', { status: 200 });
  };
  await startModelMixRun({
    prompt: 'question',
    worker_a_model: 'provider:a',
    moderator_model: 'custom:moderator',
    worker_b_model: 'provider:b',
  });
  assert.equal(requestBody.moderator_model, 'custom:moderator');
});

test('Stop uses the explicit cancel endpoint', async () => {
  let request = null;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ status: 'active' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  await cancelModelMixRun('run-1');
  assert.equal(request.url, 'http://localhost:8001/api/modelmix/runs/run-1/cancel');
  assert.equal(request.options.method, 'POST');
});

test('stream ending alone never calls the cancellation endpoint', async () => {
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls += 1; };
  const response = new Response('data: {"run_id":"r","seq":1,"type":"run_started"}\n\n');
  const events = [];
  await consumeModelMixSSE(response, (event) => events.push(event));
  assert.equal(events.length, 1);
  assert.equal(fetchCalls, 0);
});

test('409 and 404 replay errors have clear recovery states', () => {
  const state = createModelMixState();
  const gap = applyReplayError(state, 409, 'events through seq 4 are no longer retained');
  const expired = applyReplayError(state, 404, 'not found');
  assert.equal(gap.overall, 'replay_gap');
  assert.match(gap.message, /Start a new run/);
  assert.equal(expired.overall, 'expired');
  assert.match(expired.message, /expired or was not found/i);
});
