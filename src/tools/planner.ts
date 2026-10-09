import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCanvasClient } from '../canvas-client.js';

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(action: string, error: unknown) {
  return {
    content: [{
      type: 'text' as const,
      text: `Error ${action}: ${error instanceof Error ? error.message : String(error)}`,
    }],
    isError: true,
  };
}

export function registerPlannerTools(server: McpServer) {
  const client = getCanvasClient();

  server.tool(
    'get_todo',
    {},
    async () => {
      try {
        const items = await client.getTodo();
        return ok(items.map(i => ({
          type: i.type,
          course_id: i.course_id,
          context_name: i.context_name,
          assignment_id: i.assignment?.id,
          name: i.assignment?.name,
          due_at: i.assignment?.due_at,
          points_possible: i.assignment?.points_possible,
          needs_grading_count: i.needs_grading_count,
          html_url: i.html_url,
        })));
      } catch (error) {
        return fail('getting todo items', error);
      }
    }
  );

  server.tool(
    'get_missing_submissions',
    {},
    async () => {
      try {
        const items = await client.getMissingSubmissions();
        return ok(items.map(a => ({
          id: a.id,
          name: a.name,
          course_id: a.course_id,
          course_name: a.course?.name,
          due_at: a.due_at,
          points_possible: a.points_possible,
          html_url: a.html_url,
        })));
      } catch (error) {
        return fail('getting missing submissions', error);
      }
    }
  );

  server.tool(
    'get_grades',
    {},
    async () => {
      try {
        const courses = await client.getCourseGrades();
        return ok(courses.map(c => {
          const e = c.enrollments?.find(x => x.type === 'student') ?? c.enrollments?.[0];
          return {
            course_id: c.id,
            name: c.name,
            course_code: c.course_code,
            current_score: e?.computed_current_score ?? null,
            current_grade: e?.computed_current_grade ?? null,
          };
        }));
      } catch (error) {
        return fail('getting grades', error);
      }
    }
  );

  server.tool(
    'list_calendar_events',
    {
      start_date: z.string().describe('Start date (ISO 8601, e.g. 2026-10-01)'),
      end_date: z.string().describe('End date (ISO 8601, e.g. 2026-10-31)'),
      type: z.enum(['event', 'assignment']).optional()
        .describe('Filter by event type'),
    },
    async ({ start_date, end_date, type }) => {
      try {
        const events = await client.listCalendarEvents({ start_date, end_date, type });
        return ok(events.map(e => ({
          id: e.id,
          title: e.title,
          type: e.type,
          start_at: e.start_at,
          end_at: e.end_at,
          all_day: e.all_day,
          context_code: e.context_code,
          context_name: e.context_name,
          location_name: e.location_name,
          html_url: e.html_url,
        })));
      } catch (error) {
        return fail('listing calendar events', error);
      }
    }
  );

  server.tool(
    'list_pages',
    {
      course_id: z.number().describe('The Canvas course ID'),
    },
    async ({ course_id }) => {
      try {
        const pages = await client.listPages(course_id);
        return ok(pages.map(p => ({
          page_id: p.page_id,
          url: p.url,
          title: p.title,
          updated_at: p.updated_at,
          published: p.published,
          front_page: p.front_page,
        })));
      } catch (error) {
        return fail('listing pages', error);
      }
    }
  );

  server.tool(
    'get_page',
    {
      course_id: z.number().describe('The Canvas course ID'),
      page_url: z.string().describe('The page url slug (from list_pages)'),
    },
    async ({ course_id, page_url }) => {
      try {
        const p = await client.getPage(course_id, page_url);
        return ok({
          page_id: p.page_id,
          url: p.url,
          title: p.title,
          updated_at: p.updated_at,
          body: p.body,
        });
      } catch (error) {
        return fail('getting page', error);
      }
    }
  );

  server.tool(
    'list_files',
    {
      course_id: z.number().describe('The Canvas course ID'),
    },
    async ({ course_id }) => {
      try {
        const files = await client.listFiles(course_id);
        return ok(files.map(f => ({
          id: f.id,
          display_name: f.display_name,
          size: f.size,
          content_type: f['content-type'],
          url: f.url,
          updated_at: f.updated_at,
        })));
      } catch (error) {
        return fail('listing files', error);
      }
    }
  );
}
