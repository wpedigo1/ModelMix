// @vitest-environment jsdom
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { deleteModelMixSession, listModelMixSessions } from './modelmixApi';

let fetchCalls = [];

beforeEach(() => {
  fetchCalls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(ok, status, body) {
  const response = {
    ok,
    status,
    json: async () => body,
  };
  vi.stubGlobal('fetch', async (url, options) => {
    fetchCalls.push({ url, options });
    return response;
  });
  return response;
}

test('listModelMixSessions GETs the sessions endpoint and returns the parsed summaries', async () => {
  const summaries = [
    { session_id: 's1', created_at: 1, updated_at: 2, message_count: 3 },
  ];
  const response = stubFetch(true, 200, summaries);

  const result = await listModelMixSessions();

  assert.equal(fetchCalls.length, 1);
  assert.ok(fetchCalls[0].url.endsWith('/api/modelmix/sessions'));
  assert.equal(fetchCalls[0].options.method, undefined);
  assert.equal(result, summaries);
  assert.equal(await response.json(), summaries);
});

test('deleteModelMixSession DELETEs the encoded session id and returns the response', async () => {
  const response = stubFetch(true, 204, null);

  const result = await deleteModelMixSession('session abc');

  assert.equal(fetchCalls.length, 1);
  assert.ok(fetchCalls[0].url.endsWith('/api/modelmix/sessions/session%20abc'));
  assert.equal(fetchCalls[0].options.method, 'DELETE');
  assert.equal(result, response);
});

test('deleteModelMixSession surfaces a 409 with the backend detail message', async () => {
  vi.stubGlobal('fetch', async () => ({
    ok: false,
    status: 409,
    json: async () => ({ detail: 'Session has an active run (run-1); cancel it first' }),
  }));

  await assert.rejects(
    deleteModelMixSession('busy-session'),
    (err) => err.status === 409 && err.message === 'Session has an active run (run-1); cancel it first',
  );
});