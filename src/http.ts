#!/usr/bin/env node
/**
 * HTTP (Streamable HTTP) entrypoint for canvas-mcp, for deployments where the
 * MCP client (e.g. a "custom connector" that only accepts an HTTPS URL)
 * cannot spawn a local stdio process.
 *
 * Required env vars:
 *   CANVAS_API_TOKEN   - your Canvas API token
 *   CANVAS_BASE_URL    - your Canvas instance base URL (e.g. https://school.instructure.com)
 *   MCP_AUTH_TOKEN     - a secret bearer token YOU choose; required on every request
 *                        (Authorization: Bearer <MCP_AUTH_TOKEN>) so random people who
 *                        find the URL can't use your Canvas token through this server.
 *
 * Optional:
 *   PORT               - defaults to 3000
 */

import express from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import dotenv from 'dotenv';

dotenv.config();

import { buildServer } from './register.js';

/** Constant-time compare so the token can't be recovered by timing. */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

function validateEnvironment(): void {
  const requiredVars = ['CANVAS_API_TOKEN', 'CANVAS_BASE_URL', 'MCP_AUTH_TOKEN'];
  const missing = requiredVars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  validateEnvironment();

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10mb' }));

  const authToken = process.env.MCP_AUTH_TOKEN as string;

  app.post('/mcp', async (req, res) => {
    const auth = req.header('authorization') || '';
    const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!safeEqual(provided, authToken)) {
      res.status(401).json({ error: 'unauthorized' });
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

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`canvas-mcp HTTP server listening on port ${port}`);
  });
}

main().catch((err) => {
  console.error('Fatal error starting HTTP server:', err);
  process.exit(1);
});
