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
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import dotenv from 'dotenv';

dotenv.config();

import { registerCourseTools } from './tools/courses.js';
import { registerAssignmentTools } from './tools/assignments.js';
import { registerSubmissionTools } from './tools/submissions.js';
import { registerModuleTools } from './tools/modules.js';
import { registerDiscussionTools } from './tools/discussions.js';
import { registerSearchTools } from './tools/search.js';

function validateEnvironment(): void {
  const requiredVars = ['CANVAS_API_TOKEN', 'CANVAS_BASE_URL', 'MCP_AUTH_TOKEN'];
  const missing = requiredVars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

function buildServer(): McpServer {
  const server = new McpServer({ name: 'canvas-lms', version: '1.0.0' });
  registerCourseTools(server);
  registerAssignmentTools(server);
  registerSubmissionTools(server);
  registerModuleTools(server);
  registerDiscussionTools(server);
  registerSearchTools(server);
  return server;
}

async function main(): Promise<void> {
  validateEnvironment();

  const app = express();
  app.use(express.json());

  const authToken = process.env.MCP_AUTH_TOKEN as string;

  app.post('/mcp', async (req, res) => {
    const auth = req.header('authorization') || '';
    const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (provided !== authToken) {
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

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

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
