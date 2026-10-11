#!/usr/bin/env node
/**
 * HTTP (Streamable HTTP) entrypoint for canvas-mcp, for deployments where the
 * MCP client (e.g. a "custom connector" that only accepts an HTTPS URL)
 * cannot spawn a local stdio process.
 *
 * Required env vars:
 *   CANVAS_API_TOKEN   - your Canvas API token
 *   CANVAS_BASE_URL    - your Canvas instance base URL (e.g. https://school.instructure.com)
 *   MCP_AUTH_TOKEN     - a secret bearer token (16+ chars; `openssl rand -hex 32`); required on every request
 *                        (Authorization: Bearer <MCP_AUTH_TOKEN>) so random people who
 *                        find the URL can't use your Canvas token through this server.
 *
 * Optional:
 *   PORT               - defaults to 3000
 *   CANVAS_CACHE_TTL_SECONDS - read cache lifetime, 0 disables (default 60)
 */

import express from 'express';
import { createHash, timingSafeEqual, webcrypto } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import dotenv from 'dotenv';

dotenv.config();

// Node 18 has no global `crypto`, which the SDK's HTTP transport uses at request time.
if (!(globalThis as { crypto?: unknown }).crypto) {
  (globalThis as { crypto?: unknown }).crypto = webcrypto;
}

import { buildServer } from './register.js';

/** Constant-time compare so the token can't be recovered by timing. */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

const MIN_AUTH_TOKEN_LENGTH = 16;
const MAX_FAILURES = 10; // failed auth attempts per IP per window
const FAILURE_WINDOW_MS = 60_000;

const isLocalHost = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '[::1]';

function validateEnvironment(): void {
  const requiredVars = ['CANVAS_API_TOKEN', 'CANVAS_BASE_URL', 'MCP_AUTH_TOKEN'];
  const missing = requiredVars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
  if ((process.env.MCP_AUTH_TOKEN as string).length < MIN_AUTH_TOKEN_LENGTH) {
    console.error(`MCP_AUTH_TOKEN must be at least ${MIN_AUTH_TOKEN_LENGTH} characters. Generate one with: openssl rand -hex 32`);
    process.exit(1);
  }
  let base: URL;
  try {
    base = new URL(process.env.CANVAS_BASE_URL as string);
  } catch {
    console.error('CANVAS_BASE_URL is not a valid URL (expected e.g. https://yourschool.instructure.com)');
    process.exit(1);
  }
  if (base.protocol !== 'https:' && !isLocalHost(base.hostname)) {
    console.error('CANVAS_BASE_URL must use https:// so your Canvas token is never sent in clear text.');
    process.exit(1);
  }
}

/** Tiny in-memory limiter for failed auth attempts, so the bearer token can't be brute-forced. */
function createFailureLimiter() {
  const failures = new Map<string, { count: number; resetAt: number }>();
  return {
    blocked(ip: string): boolean {
      const f = failures.get(ip);
      return !!f && f.resetAt > Date.now() && f.count >= MAX_FAILURES;
    },
    record(ip: string): void {
      const now = Date.now();
      const f = failures.get(ip);
      if (!f || f.resetAt <= now) failures.set(ip, { count: 1, resetAt: now + FAILURE_WINDOW_MS });
      else f.count++;
      if (failures.size > 5000) failures.clear(); // bound memory
    },
  };
}

async function main(): Promise<void> {
  validateEnvironment();

  const app = express();
  app.disable('x-powered-by');
  // Render, Cloud Run, Fly etc. terminate TLS in a proxy; trust one hop so req.ip is the real client.
  app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    next();
  });
  app.use(express.json({ limit: '10mb' }));
  const limiter = createFailureLimiter();

  const authToken = process.env.MCP_AUTH_TOKEN as string;

  app.post('/mcp', async (req, res) => {
    const ip = req.ip || 'unknown';
    if (limiter.blocked(ip)) {
      res.status(429).set('Retry-After', '60').json({ error: 'too many failed attempts' });
      return;
    }
    const auth = req.header('authorization') || '';
    const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!safeEqual(provided, authToken)) {
      limiter.record(ip);
      res.status(401).set('WWW-Authenticate', 'Bearer').json({ error: 'unauthorized' });
      return;
    }

    // Stateless: a fresh server + transport per request avoids cross-request
    // session bookkeeping, which is unnecessary for a single-user deployment.
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on('close', () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('MCP request failed:', error);
      if (!res.headersSent) res.status(500).json({ error: 'internal error' });
    }
  });

  // Stateless mode has no SSE stream or session to tear down.
  const methodNotAllowed: express.RequestHandler = (_req, res) => {
    res.status(405).set('Allow', 'POST').json({ error: 'method not allowed' });
  };
  app.get('/mcp', methodNotAllowed);
  app.delete('/mcp', methodNotAllowed);

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/', (_req, res) => {
    res.type('text/plain').send('canvas-mcp is running. MCP endpoint: POST /mcp (Authorization: Bearer <token>). Docs: https://github.com/anaylab/canvas-mcp\n');
  });

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`canvas-mcp HTTP server listening on port ${port} (Canvas: ${process.env.CANVAS_BASE_URL})`);
  });
}

main().catch((err) => {
  console.error('Fatal error starting HTTP server:', err);
  process.exit(1);
});
