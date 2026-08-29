export const createModelMixState = () => ({
  sessionId: null,
  runId: null,
  lastSeq: 0,
  overall: 'idle',
  message: 'Ready',
  worker_a: { text: '', status: 'idle', error: null },
  moderator: {
    text: '',
    status: 'waiting',
    error: null,
    started: false,
    finishReason: null,
  },
  worker_b: { text: '', status: 'idle', error: null },
});

const terminalOverall = new Set(['completed', 'partial', 'failed', 'cancelled', 'replay_gap', 'expired']);

export const isTerminalOverall = (status) => terminalOverall.has(status);

export function controlState(status) {
  const running = ['connecting', 'running', 'reconnecting', 'cancelling'].includes(status);
  return { sendDisabled: running, stopDisabled: status === 'connecting' || !running };
}

export function modelSelectorsDisabled(status) {
  return controlState(status).sendDisabled;
}

export function applyReplayError(state, status, message = '') {
  if (status === 409) {
    return {
      ...state,
      overall: 'replay_gap',
      message: `Replay gap: ${message}. Start a new run to recover.`,
    };
  }
  if (status === 404) {
    return { ...state, overall: 'expired', message: 'Run expired or was not found. Start a new run.' };
  }
  return { ...state, overall: 'failed', message: message || 'Connection failed' };
}

export function applyModelMixEvent(state, event) {
  if (state.runId && event?.run_id && event.run_id !== state.runId) return state;
  if (!event || !Number.isInteger(event.seq) || event.seq <= state.lastSeq) return state;
  const next = { ...state, lastSeq: event.seq, runId: event.run_id || state.runId };
  const seatId = event.seat_id;

  if (seatId === 'worker_a' || seatId === 'worker_b') {
    const seat = { ...state[seatId] };
    if (event.type === 'seat_started') seat.status = 'running';
    if (event.type === 'seat_delta') seat.text += String(event.delta || '');
    if (event.type === 'seat_completed') seat.status = 'completed';
    if (event.type === 'seat_failed') {
      seat.status = 'failed';
      seat.error = event.error || 'Worker failed';
    }
    if (event.type === 'seat_cancelled') seat.status = 'cancelled';
    next[seatId] = seat;
  }

  if (event.type?.startsWith('moderator_')) {
    const moderator = { ...state.moderator };
    if (event.type === 'moderator_started') {
      moderator.started = true;
      moderator.status = 'running';
      moderator.error = null;
    } else if (event.type === 'moderator_delta') {
      moderator.text += String(event.delta || '');
    } else if (event.type === 'moderator_completed') {
      moderator.started = true;
      moderator.status = 'completed';
      moderator.finishReason = event.finish_reason || null;
    } else if (event.type === 'moderator_failed') {
      moderator.status = 'failed';
      moderator.error = event.error || 'Moderator failed';
    }
    next.moderator = moderator;
  }

  if (event.type === 'run_started') {
    next.overall = 'running';
    next.message = 'Both workers are running';
  } else if (event.type === 'run_cancel_requested') {
    next.overall = 'cancelling';
    next.message = 'Cancellation requested';
  } else if (event.type === 'run_cancelled') {
    next.overall = 'cancelled';
    next.message = 'Run cancelled';
    for (const id of ['worker_a', 'worker_b']) {
      if (next[id].status === 'running') next[id] = { ...next[id], status: 'cancelled' };
    }
    if (next.moderator.status === 'waiting' || next.moderator.status === 'running') {
      next.moderator = { ...next.moderator, status: 'cancelled' };
    }
  } else if (event.type === 'run_failed') {
    next.overall = 'failed';
    next.message = event.error || 'Run failed';
  } else if (event.type === 'run_completed') {
    next.overall = event.status === 'partial' ? 'partial' : 'completed';
    next.message = event.status === 'partial' ? 'Run completed with a worker failure' : 'Run completed';
    if (event.status === 'partial' && next.moderator.status === 'completed') {
      next.moderator = { ...next.moderator, status: 'partial' };
    }
  }
  return next;
}

export function hydrateModelMixState(document) {
  if (document?.schema_version !== 1 || !document.session || !Array.isArray(document.session.runs)) {
    throw new Error('Unsupported or malformed ModelMix session');
  }
  const run = document.session.runs.at(-1);
  if (!run) return createModelMixState();
  const state = {
    ...createModelMixState(),
    runId: run.run_id,
    sessionId: document.session.session_id,
    lastSeq: run.latest_seq,
    overall: run.status,
    message: `Restored ${run.status} run`,
    models: run.models,
    prompt: run.prompt,
  };
  for (const message of document.session.messages || []) {
    if (message.run_id !== run.run_id || !['worker_a', 'worker_b', 'moderator'].includes(message.seat)) continue;
    state[message.seat] = {
      ...state[message.seat],
      text: String(message.content || ''),
      status: message.status || state[message.seat].status,
      error: message.error || null,
    };
    if (message.seat === 'moderator') state.moderator.started = message.status !== 'waiting';
  }
  if (run.status === 'partial' && state.moderator.status === 'completed') state.moderator.status = 'partial';
  return state;
}
