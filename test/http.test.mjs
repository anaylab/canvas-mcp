import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createFakeCanvas, DEMO_TOKEN } from '../dist/demo/fake-canvas.js';

const AUTH = 'a-long-random-test-token-123456';
let canvas, child, url;

const startServer = (env) => {
  const c = spawn(process.execPath, ['dist/http.js'], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const ready = new Promise((resolve, reject) => {
    c.stdout.on('data', (d) => /listening/.test(String(d)) && resolve());
    c.on('exit', (code) => reject(new Error(`exited ${code}`)));
  });
  ready.catch(() => {}); // callers that expect an early exit don't await this
  return { c, ready };
};

before(async () => {
  canvas = createFakeCanvas();
  await new Promise((r) => canvas.listen(0, '127.0.0.1', r));
  const port = 38000 + Math.floor(Math.random() * 1000);
  url = `http://127.0.0.1:${port}`;
  const s = startServer({ PORT: String(port), MCP_AUTH_TOKEN: AUTH, CANVAS_API_TOKEN: DEMO_TOKEN, CANVAS_BASE_URL: `http://127.0.0.1:${canvas.address().port}` });
  child = s.c;
  await s.ready;
});
after(() => { child.kill(); canvas.close(); });

const post = (headers = {}) => fetch(`${url}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: '{}' });

test('health and root are public; GET /mcp is 405', async () => {
  assert.equal((await fetch(`${url}/health`)).status, 200);
  assert.match(await (await fetch(`${url}/`)).text(), /canvas-mcp is running/);
  assert.equal((await fetch(`${url}/mcp`)).status, 405);
});

test('full MCP session over HTTP with a valid token', async () => {
  const client = new Client({ name: 'http', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${AUTH}` } } }));
  try {
    const { tools } = await client.listTools();
    assert.ok(tools.length >= 31);
    const r = await client.callTool({ name: 'get_grades', arguments: {} });
    assert.ok(!r.isError, r.content[0].text);
    assert.match(r.content[0].text, /Algorithms/);
  } finally { await client.close(); }
});

test('missing or wrong token is 401, then repeated failures are throttled with 429', async () => {
  assert.equal((await post()).status, 401);
  assert.equal((await post({ authorization: 'Bearer nope' })).status, 401);
  let last;
  for (let i = 0; i < 12; i++) last = await post({ authorization: 'Bearer wrong' });
  assert.equal(last.status, 429);
  // Even the correct token is refused while the IP is blocked, which is the point of the limiter.
  assert.equal((await post({ authorization: `Bearer ${AUTH}` })).status, 429);
});

test('refuses to start with a weak auth token, or an http:// non-local Canvas URL', async () => {
  const run = async (env) => {
    const { c } = startServer({ PORT: '0', CANVAS_API_TOKEN: 'x', ...env });
    let err = '';
    c.stderr.on('data', (d) => (err += d));
    const [code] = await once(c, 'exit').catch(() => [null]);
    return { code, err };
  };
  const weak = await run({ MCP_AUTH_TOKEN: 'short', CANVAS_BASE_URL: 'https://school.test' });
  assert.equal(weak.code, 1); assert.match(weak.err, /at least 16/);
  const insecure = await run({ MCP_AUTH_TOKEN: AUTH, CANVAS_BASE_URL: 'http://school.example.com' });
  assert.equal(insecure.code, 1); assert.match(insecure.err, /https/);
});

test('HTTP mode works when the runtime has no global crypto (Node 18)', async () => {
  const port = 39000 + Math.floor(Math.random() * 500);
  const s = startServer({
    PORT: String(port), MCP_AUTH_TOKEN: AUTH, CANVAS_API_TOKEN: DEMO_TOKEN,
    CANVAS_BASE_URL: `http://127.0.0.1:${canvas.address().port}`,
    NODE_OPTIONS: `--import=${new URL('./helpers/no-global-crypto.mjs', import.meta.url).pathname}`,
  });
  try {
    await s.ready;
    const client = new Client({ name: 'n18', version: '0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${AUTH}` } } }));
    assert.ok((await client.listTools()).tools.length >= 31);
    await client.close();
  } finally { s.c.kill(); }
});
