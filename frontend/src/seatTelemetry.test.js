import assert from 'node:assert/strict';
import { test } from 'vitest';

import { buildSeatTelemetry, formatElapsed, formatTimestamp } from './seatTelemetry.js';

const pad = (value) => String(value).padStart(2, '0');
const localClock = (ts) => {
  const date = new Date(ts * 1000);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

test('formatTimestamp returns local HH:MM:SS for a finite timestamp', () => {
  assert.equal(formatTimestamp(0), localClock(0));
  assert.equal(formatTimestamp(1750000000), localClock(1750000000));
});

test('formatTimestamp returns null for missing or non-finite input', () => {
  assert.equal(formatTimestamp(null), null);
  assert.equal(formatTimestamp(undefined), null);
  assert.equal(formatTimestamp('x'), null);
  assert.equal(formatTimestamp(Number.NaN), null);
  assert.equal(formatTimestamp(Number.POSITIVE_INFINITY), null);
});

test('formatElapsed renders seconds, minutes, and hours', () => {
  assert.equal(formatElapsed(100, 112.4), '12.4s');
  assert.equal(formatElapsed(100, 160), '1m 0s');
  assert.equal(formatElapsed(100, 3760), '1h 1m');
});

test('formatElapsed returns null for missing, inverted, or zero duration', () => {
  assert.equal(formatElapsed(null, 112.4), null);
  assert.equal(formatElapsed(100, null), null);
  assert.equal(formatElapsed(100, 99), null);
  assert.equal(formatElapsed(100, 100), null);
});

test('idle seats produce no telemetry items', () => {
  const idleWorker = { text: '', status: 'idle', error: null, usage: null, startedAt: null, completedAt: null };
  const waitingModerator = {
    text: '',
    status: 'waiting',
    error: null,
    started: false,
    finishReason: null,
    usage: null,
    startedAt: null,
    completedAt: null,
  };
  assert.deepEqual(buildSeatTelemetry(idleWorker, 'worker_a'), []);
  assert.deepEqual(buildSeatTelemetry(waitingModerator, 'moderator'), []);
});

test('a completed seat with usage shows authoritative provider-reported usage', () => {
  const seat = {
    text: 'answer',
    status: 'completed',
    error: null,
    usage: { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 },
    startedAt: 100,
    completedAt: 112.4,
  };
  const items = buildSeatTelemetry(seat, 'worker_a');
  assert.equal(items.length, 2);
  const usage = items.find((item) => item.key === 'usage');
  assert.equal(usage.label, 'Usage');
  assert.equal(usage.value, 'authoritative (provider-reported)');
  assert.equal(usage.detail, '46 tokens');
});

test('a usage object without total_tokens falls back to totalTokenCount', () => {
  const seat = {
    text: 'answer',
    status: 'completed',
    error: null,
    usage: { prompt_tokens: 5, totalTokenCount: 77 },
    startedAt: 100,
    completedAt: 112.4,
  };
  const usage = buildSeatTelemetry(seat, 'worker_a').find((item) => item.key === 'usage');
  assert.equal(usage.value, 'authoritative (provider-reported)');
  assert.equal(usage.detail, '77 tokens');
});

test('a completed seat without usage shows honest unavailable', () => {
  const seat = {
    text: 'answer',
    status: 'completed',
    error: null,
    usage: null,
    startedAt: 100,
    completedAt: 112.4,
  };
  const items = buildSeatTelemetry(seat, 'worker_a');
  const usage = items.find((item) => item.key === 'usage');
  assert.equal(usage.value, 'unavailable');
  assert.equal(usage.detail, null);
});

test('elapsed timing is labeled calculated with a time range detail', () => {
  const seat = {
    text: 'answer',
    status: 'completed',
    error: null,
    usage: null,
    startedAt: 100,
    completedAt: 112.4,
  };
  const timing = buildSeatTelemetry(seat, 'worker_a').find((item) => item.key === 'timing');
  assert.equal(timing.label, 'Elapsed');
  assert.equal(timing.value, '12.4s (calculated)');
  assert.equal(timing.detail, `${localClock(100)} → ${localClock(112.4)}`);
});

test('a started but not completed seat shows a Started item without fabricating duration', () => {
  const seat = {
    text: 'partial',
    status: 'running',
    error: null,
    usage: null,
    startedAt: 100,
    completedAt: null,
  };
  const items = buildSeatTelemetry(seat, 'worker_a');
  assert.equal(items.length, 2);
  const timing = items.find((item) => item.key === 'timing');
  assert.equal(timing.label, 'Started');
  assert.equal(timing.value, localClock(100));
});

test('a completed seat with only completedAt shows a Completed item', () => {
  const seat = {
    text: 'answer',
    status: 'partial',
    error: null,
    usage: null,
    startedAt: null,
    completedAt: 112.4,
  };
  const timing = buildSeatTelemetry(seat, 'worker_a').find((item) => item.key === 'timing');
  assert.equal(timing.label, 'Completed');
  assert.equal(timing.value, localClock(112.4));
});

test('moderator finish reason is rendered only for the moderator seat', () => {
  const moderator = {
    text: 'synthesis',
    status: 'completed',
    error: null,
    started: true,
    finishReason: 'stop',
    usage: { total_tokens: 5 },
    startedAt: 100,
    completedAt: 112.4,
  };
  const modItems = buildSeatTelemetry(moderator, 'moderator');
  const modFinish = modItems.find((item) => item.key === 'finish');
  assert.equal(modFinish.value, 'stop');

  const workerWithSameShape = { ...moderator };
  const workerItems = buildSeatTelemetry(workerWithSameShape, 'worker_a');
  assert.equal(workerItems.some((item) => item.key === 'finish'), false);
});

test('moderator without a reported finish reason stays known-unknown', () => {
  const moderator = {
    text: 'synthesis',
    status: 'partial',
    error: null,
    started: true,
    finishReason: null,
    usage: null,
    startedAt: 100,
    completedAt: 112.4,
  };
  const finish = buildSeatTelemetry(moderator, 'moderator').find((item) => item.key === 'finish');
  assert.equal(finish.value, 'not reported');
});

test('an oversized usage object is summarized by field count, never merged', () => {
  const usage = {};
  for (let index = 0; index < 10; index += 1) usage[`field_${index}`] = index;
  const seat = {
    text: 'answer',
    status: 'completed',
    error: null,
    usage,
    startedAt: 100,
    completedAt: 112.4,
  };
  const usageItem = buildSeatTelemetry(seat, 'worker_a').find((item) => item.key === 'usage');
  assert.equal(usageItem.value, 'authoritative (provider-reported)');
  assert.equal(usageItem.detail, '10 fields');
});