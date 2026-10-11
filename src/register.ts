import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCourseTools } from './tools/courses.js';
import { registerAssignmentTools } from './tools/assignments.js';
import { registerSubmissionTools } from './tools/submissions.js';
import { registerModuleTools } from './tools/modules.js';
import { registerDiscussionTools } from './tools/discussions.js';
import { registerSearchTools } from './tools/search.js';
import { registerExtraTools } from './tools/extras.js';

/** Tools that change data in Canvas as the user. Everything else is read-only. */
export const WRITE_TOOLS = new Set([
  'post_discussion_entry',
  'reply_to_discussion',
  'submit_assignment',
  'upload_file',
]);

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * Tag each tool with MCP annotations so clients can auto-approve reads and
 * always prompt on writes, without touching every registration site.
 */
function withAnnotations(server: McpServer): McpServer {
  const original = server.tool.bind(server) as (...args: unknown[]) => unknown;
  (server as unknown as { tool: (...args: unknown[]) => unknown }).tool = (...args: unknown[]) => {
    const name = args[0] as string;
    const annotations = WRITE_TOOLS.has(name)
      ? { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
      : { readOnlyHint: true, openWorldHint: true };
    // (name, [description], [schema], annotations, cb)
    return original(...args.slice(0, -1), annotations, args[args.length - 1]);
  };
  return server;
}

export function buildServer(): McpServer {
  const server = withAnnotations(new McpServer({ name: 'canvas-lms', version: pkg.version }));
  registerCourseTools(server);
  registerAssignmentTools(server);
  registerSubmissionTools(server);
  registerModuleTools(server);
  registerDiscussionTools(server);
  registerSearchTools(server);
  registerExtraTools(server);
  return server;
}
