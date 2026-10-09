import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerCourseTools } from './tools/courses.js';
import { registerAssignmentTools } from './tools/assignments.js';
import { registerSubmissionTools } from './tools/submissions.js';
import { registerModuleTools } from './tools/modules.js';
import { registerDiscussionTools } from './tools/discussions.js';
import { registerSearchTools } from './tools/search.js';
import { registerPlannerTools } from './tools/planner.js';

export const SERVER_NAME = 'canvas-lms';

function readVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    ) as { version?: string };
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const SERVER_VERSION: string = readVersion();

export function registerAllTools(server: McpServer): void {
  registerCourseTools(server);
  registerAssignmentTools(server);
  registerSubmissionTools(server);
  registerModuleTools(server);
  registerDiscussionTools(server);
  registerSearchTools(server);
  registerPlannerTools(server);
}
