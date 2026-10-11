import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCanvasClient } from '../canvas-client.js';
import { ok, fail, htmlToText, pdfToText } from './util.js';

const TEXT_TYPES = /^(text\/|application\/(json|xml|x-yaml|javascript))/;
const MAX_FILE_BYTES = 200_000;
const MAX_PDF_BYTES = 15_000_000;
const MAX_PDF_CHARS = 100_000;

export function registerExtraTools(server: McpServer) {
  const client = getCanvasClient();

  server.tool(
    'get_grades',
    'Current grade and score for every active course you are enrolled in as a student.',
    {},
    async () => {
      try {
        const [enrollments, courses] = await Promise.all([
          client.listMyEnrollments(),
          client.listCourses({ enrollment_state: 'active' }),
        ]);
        const names = new Map(courses.map((c) => [c.id, c.name]));
        return ok(
          enrollments.map((e) => ({
            course_id: e.course_id,
            course: names.get(e.course_id) ?? null,
            current_score: e.grades?.current_score ?? null,
            current_grade: e.grades?.current_grade ?? null,
            final_score: e.grades?.final_score ?? null,
            final_grade: e.grades?.final_grade ?? null,
          }))
        );
      } catch (error) {
        return fail('getting grades', error);
      }
    }
  );

  server.tool(
    'get_todo',
    'Your Canvas to-do list: things that need submitting or grading, across all courses.',
    {},
    async () => {
      try {
        const items = await client.listTodo();
        return ok(
          items.map((t) => ({
            type: t.type,
            course_id: t.course_id,
            name: t.assignment?.name ?? t.quiz?.title,
            due_at: t.assignment?.due_at ?? t.quiz?.due_at ?? null,
            points_possible: t.assignment?.points_possible,
            html_url: t.html_url,
          }))
        );
      } catch (error) {
        return fail('getting to-do list', error);
      }
    }
  );

  server.tool(
    'list_calendar_events',
    'Calendar events and assignment due dates in a date range, across all courses or limited to some.',
    {
      start_date: z.string().describe('Start date, YYYY-MM-DD'),
      end_date: z.string().describe('End date, YYYY-MM-DD'),
      type: z.enum(['event', 'assignment']).optional().default('event')
        .describe("'event' for calendar events, 'assignment' for assignment due dates"),
      course_ids: z.array(z.number()).optional().describe('Limit to these courses (default: all)'),
    },
    async ({ start_date, end_date, type, course_ids }) => {
      try {
        const events = await client.listCalendarEvents({
          type,
          start_date,
          end_date,
          context_codes: course_ids?.map((id) => `course_${id}`),
        });
        return ok(
          events.map((e) => ({
            id: e.id,
            title: e.title,
            start_at: e.start_at,
            end_at: e.end_at,
            context: e.context_name,
            location: e.location_name || undefined,
            html_url: e.html_url,
          }))
        );
      } catch (error) {
        return fail('listing calendar events', error);
      }
    }
  );

  server.tool(
    'list_pages',
    'List wiki pages in a course (lecture notes, policies, guides). Optionally search by title.',
    {
      course_id: z.number().describe('The Canvas course ID'),
      search_term: z.string().optional().describe('Match against page titles'),
    },
    async ({ course_id, search_term }) => {
      try {
        const pages = await client.listPages(course_id, search_term);
        return ok(
          pages.map((p) => ({ title: p.title, url: p.url, updated_at: p.updated_at, published: p.published }))
        );
      } catch (error) {
        return fail('listing pages', error);
      }
    }
  );

  server.tool(
    'get_page',
    'Read the full text of a course page. Use the `url` slug from list_pages.',
    {
      course_id: z.number().describe('The Canvas course ID'),
      page_url: z.string().describe('The page url slug from list_pages'),
    },
    async ({ course_id, page_url }) => {
      try {
        const page = await client.getPage(course_id, page_url);
        return ok({ title: page.title, updated_at: page.updated_at, body: htmlToText(page.body) });
      } catch (error) {
        return fail('getting page', error);
      }
    }
  );

  server.tool(
    'list_files',
    'List files in a course (slides, readings, handouts). Optionally search by name.',
    {
      course_id: z.number().describe('The Canvas course ID'),
      search_term: z.string().optional().describe('Match against file names'),
    },
    async ({ course_id, search_term }) => {
      try {
        const files = await client.listFiles(course_id, search_term);
        return ok(
          files.map((f) => ({
            id: f.id,
            name: f.display_name,
            content_type: f['content-type'],
            size_bytes: f.size,
            updated_at: f.updated_at,
          }))
        );
      } catch (error) {
        return fail('listing files', error);
      }
    }
  );

  server.tool(
    'read_file',
    `Read a course file by id: text files (txt, md, csv, json, html) and PDFs (text extraction, needs Node 22+). Other binary files return metadata and a download link. Output is capped at ${MAX_FILE_BYTES / 1000} KB of text (${MAX_PDF_CHARS / 1000}K characters for PDFs).`,
    { file_id: z.number().describe('File id from list_files') },
    async ({ file_id }) => {
      try {
        const file = await client.getFile(file_id);
        const contentType: string = file['content-type'] ?? '';
        const meta = { name: file.display_name, content_type: contentType, size_bytes: file.size };
        if (contentType === 'application/pdf') {
          if (file.size > MAX_PDF_BYTES) {
            return ok({ ...meta, note: 'PDF is too large to read here; open the download_url.', download_url: file.url });
          }
          const { bytes } = await client.downloadFile(file.url, MAX_PDF_BYTES);
          const text = await pdfToText(bytes);
          if (text === null) {
            return ok({ ...meta, note: 'PDF text extraction needs Node 22+ (optional dependency unpdf). Open the download_url instead.', download_url: file.url });
          }
          if (!text) {
            return ok({ ...meta, note: 'No selectable text found (likely a scanned PDF).', download_url: file.url });
          }
          return ok({ ...meta, truncated: text.length > MAX_PDF_CHARS, content: text.slice(0, MAX_PDF_CHARS) });
        }
        if (!TEXT_TYPES.test(contentType)) {
          return ok({ ...meta, note: 'Not a text file; open the download_url in a browser.', download_url: file.url });
        }
        const { bytes, truncated } = await client.downloadFile(file.url, MAX_FILE_BYTES);
        let text = new TextDecoder().decode(bytes);
        if (contentType === 'text/html') text = htmlToText(text);
        return ok({ ...meta, truncated, content: text });
      } catch (error) {
        return fail('reading file', error);
      }
    }
  );

  server.tool(
    'list_quizzes',
    'List quizzes in a course with due dates, points and attempt limits.',
    { course_id: z.number().describe('The Canvas course ID') },
    async ({ course_id }) => {
      try {
        const quizzes = await client.listQuizzes(course_id);
        return ok(
          quizzes.map((q) => ({
            id: q.id,
            title: q.title,
            due_at: q.due_at,
            points_possible: q.points_possible,
            question_count: q.question_count,
            time_limit_minutes: q.time_limit,
            allowed_attempts: q.allowed_attempts,
            locked_for_user: q.locked_for_user,
            html_url: q.html_url,
          }))
        );
      } catch (error) {
        return fail('listing quizzes', error);
      }
    }
  );

  server.tool(
    'get_quiz',
    'Details for one quiz (instructions, time limit, attempts, due date). Does not start or take the quiz.',
    {
      course_id: z.number().describe('The Canvas course ID'),
      quiz_id: z.number().describe('Quiz id from list_quizzes'),
    },
    async ({ course_id, quiz_id }) => {
      try {
        const q = await client.getQuiz(course_id, quiz_id);
        return ok({
          id: q.id,
          title: q.title,
          instructions: htmlToText(q.description),
          quiz_type: q.quiz_type,
          due_at: q.due_at,
          unlock_at: q.unlock_at,
          lock_at: q.lock_at,
          points_possible: q.points_possible,
          question_count: q.question_count,
          time_limit_minutes: q.time_limit,
          allowed_attempts: q.allowed_attempts,
          scoring_policy: q.scoring_policy,
          html_url: q.html_url,
        });
      } catch (error) {
        return fail('getting quiz', error);
      }
    }
  );

  server.tool(
    'get_planner_items',
    'Your Canvas planner for a date range: assignments, quizzes, discussions and your own planner notes, with whether each is complete.',
    {
      start_date: z.string().describe('Start date, YYYY-MM-DD'),
      end_date: z.string().describe('End date, YYYY-MM-DD'),
    },
    async ({ start_date, end_date }) => {
      try {
        const items = await client.listPlannerItems(start_date, end_date);
        return ok(
          items.map((i) => ({
            type: i.plannable_type,
            title: i.plannable?.title ?? i.plannable?.name,
            course: i.context_name,
            date: i.plannable_date,
            points_possible: i.plannable?.points_possible,
            submitted: i.submissions?.submitted,
            marked_complete: i.planner_override?.marked_complete ?? false,
            html_url: i.html_url,
          }))
        );
      } catch (error) {
        return fail('getting planner items', error);
      }
    }
  );

  server.tool(
    'list_inbox',
    'Recent Canvas inbox conversations (messages from instructors and classmates).',
    { scope: z.enum(['unread', 'starred', 'sent', 'archived']).optional().describe('Default: inbox') },
    async ({ scope }) => {
      try {
        const convos = await client.listConversations(scope);
        return ok(
          convos.map((c) => ({
            id: c.id,
            subject: c.subject,
            last_message: c.last_message,
            last_message_at: c.last_message_at,
            participants: c.participants?.map((p: { name: string }) => p.name),
            unread: c.workflow_state === 'unread',
          }))
        );
      } catch (error) {
        return fail('listing inbox', error);
      }
    }
  );

  server.tool(
    'get_conversation',
    'Read a full inbox conversation thread by id (from list_inbox).',
    { conversation_id: z.number().describe('Conversation id') },
    async ({ conversation_id }) => {
      try {
        const c = await client.getConversation(conversation_id);
        return ok({
          subject: c.subject,
          participants: c.participants?.map((p: { name: string }) => p.name),
          messages: (c.messages ?? []).map((m: { author_id: number; created_at: string; body: string }) => ({
            author_id: m.author_id,
            created_at: m.created_at,
            body: m.body,
          })),
        });
      } catch (error) {
        return fail('getting conversation', error);
      }
    }
  );
}
