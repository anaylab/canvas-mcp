#!/usr/bin/env node
/**
 * `npm run demo` - start a fake Canvas with sample data and print the config
 * needed to point any MCP client at it. No Canvas account or token required.
 */
import { createFakeCanvas, DEMO_TOKEN } from './fake-canvas.js';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.DEMO_PORT) || 8787;
const base = `http://127.0.0.1:${port}`;
const entry = fileURLToPath(new URL('../index.js', import.meta.url));

createFakeCanvas().listen(port, '127.0.0.1', () => {
  console.log(`
canvas-mcp demo - fake Canvas running at ${base}
Sample data: 3 courses, 9 assignments (some due soon, one overdue), grades, announcements, discussions, files and more.
Writes (submit/post) are accepted but nothing is stored.

Add this to Claude Desktop (Settings > Developer > Edit Config), then restart it:

${JSON.stringify({ mcpServers: { 'canvas-demo': { command: 'node', args: [entry], env: { CANVAS_API_TOKEN: DEMO_TOKEN, CANVAS_BASE_URL: base } } } }, null, 2)}

Then try: "What's due this week?" or "How am I doing in my classes?"
Press Ctrl+C to stop.
`);
});
