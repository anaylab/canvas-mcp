import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
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
  registerPrompts(server);
  return server;
}

const userMessage = (text: string) => ({
  messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }],
});

/** Ready-made workflows; clients surface these as one-click starting points. */
function registerPrompts(server: McpServer) {
  server.prompt(
    'weekly_plan',
    'Build a day-by-day study plan for the coming week from real deadlines',
    { days: z.string().optional().describe('How many days ahead to plan (default 7)') },
    ({ days }) =>
      userMessage(
        `Plan my next ${days || '7'} days. Use get_all_upcoming_work, get_overdue_assignments for each course, and list_calendar_events. ` +
          'Give me a day-by-day plan: what to work on, rough time estimates based on points and type, and flag anything overdue or clashing with an exam first. Keep it concise.'
      )
  );

  server.prompt(
    'whats_due',
    'What is due soon, most urgent first, across all courses',
    { days: z.string().optional().describe('Look-ahead window in days (default 7)') },
    ({ days }) =>
      userMessage(
        `What is due in the next ${days || '7'} days? Use get_all_upcoming_work and also check get_todo. Sort by due date, show the course, points, and whether I have started or submitted. Mention anything overdue.`
      )
  );

  server.prompt(
    'grade_check',
    'Summarise grades per course and what would move them most',
    {},
    () =>
      userMessage(
        'How am I doing? Use get_grades for the overview, then for any course below an A- look at list_assignments to find what is graded, missing, or still ahead and where the points are. Be honest and specific.'
      )
  );

  server.prompt(
    'catch_up',
    'Catch up on a course after missing a few days',
    { course_id: z.string().describe('Canvas course ID (use list_courses to find it)') },
    ({ course_id }) =>
      userMessage(
        `I have been away from course ${course_id}. Catch me up: recent list_announcements, new list_modules content, list_discussions with unread activity, and assignments due soon. Summarise what I missed and what I need to do first.`
      )
  );

  server.prompt(
    'assignment_brief',
    'Break down one assignment: requirements, rubric, and a plan to finish it',
    {
      course_id: z.string().describe('Canvas course ID'),
      assignment_id: z.string().describe('Assignment ID'),
    },
    ({ course_id, assignment_id }) =>
      userMessage(
        `Brief me on assignment ${assignment_id} in course ${course_id}. Use get_assignment and get_rubric. Summarise what is being asked, how it will be graded, and propose a step-by-step plan. ` +
          'Do not write the work for me or submit anything; I will do the work myself and follow my school\'s academic integrity policy.'
      )
  );
}
