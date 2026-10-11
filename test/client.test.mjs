import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { CanvasClient, parseLinkNext, describeApiError, backoffMs } from '../dist/canvas-client.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const json = (body, init = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

test('parseLinkNext picks rel="next"', () => {
  const h = '<https://x/a?page=2>; rel="next", <https://x/a?page=9>; rel="last"';
  assert.equal(parseLinkNext(h), 'https://x/a?page=2');
  assert.equal(parseLinkNext('<https://x/a?page=9>; rel="last"'), null);
  assert.equal(parseLinkNext(null), null);
});

test('describeApiError extracts Canvas messages and adds hints', () => {
  const msg = describeApiError(401, 'Unauthorized', JSON.stringify({ errors: [{ message: 'Invalid access token.' }] }));
  assert.match(msg, /Invalid access token/);
  assert.match(msg, /expired/);
  assert.match(describeApiError(404, 'Not Found', '<html>nope</html>'), /Not found/);
});

test('backoffMs honours Retry-After and caps it', () => {
  assert.equal(backoffMs(0, '2'), 2000);
  assert.equal(backoffMs(0, '999'), 30000);
  assert.ok(backoffMs(2, null) >= 2000);
});

test('listAssignments follows pagination (was truncated at one page)', async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return String(url).includes('page=2')
      ? json([{ id: 3 }])
      : json([{ id: 1 }, { id: 2 }], { headers: { link: '<https://school.test/api/v1/courses/1/assignments?page=2>; rel="next"' } });
  };
  const c = new CanvasClient({ baseUrl: 'https://school.test/', apiToken: 't' });
  const out = await c.listAssignments(1);
  assert.deepEqual(out.map((a) => a.id), [1, 2, 3]);
  assert.equal(urls.length, 2);
});

test('does not follow pagination links to another host', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return json([{ id: 1 }], { headers: { link: '<https://evil.test/steal>; rel="next"' } });
  };
  const c = new CanvasClient({ baseUrl: 'https://school.test', apiToken: 't' });
  await c.listAssignments(1);
  assert.equal(calls, 1);
});

test('retries 429 then succeeds', async () => {
  let calls = 0;
  globalThis.fetch = async () =>
    ++calls < 2 ? new Response('slow down', { status: 429, headers: { 'retry-after': '0' } }) : json({ id: 5, name: 'x' });
  const c = new CanvasClient({ baseUrl: 'https://school.test', apiToken: 't' });
  assert.equal((await c.getCourse(5)).id, 5);
  assert.equal(calls, 2);
});

test('never retries a POST on 5xx (avoids double-submitting)', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('boom', { status: 503 }); };
  const c = new CanvasClient({ baseUrl: 'https://school.test', apiToken: 't' });
  await assert.rejects(c.postDiscussionEntry(1, 2, 'hi'), /503/);
  assert.equal(calls, 1);
});
