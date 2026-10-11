import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Minimal fake Canvas so every tool handler runs against realistic payloads.
let server, base, client, requests = [];
const routes = {
  'GET /api/v1/courses': () => [{ id: 7, name: 'Algorithms', course_code: 'CS301', term: { name: 'Fall' } }],
  'GET /api/v1/users/self/enrollments': () => [{ course_id: 7, grades: { current_score: 91.5, current_grade: 'A-' } }],
  'GET /api/v1/users/self/todo': () => [{ type: 'submitting', course_id: 7, html_url: 'u', assignment: { name: 'PS1', due_at: '2026-10-20T00:00:00Z', points_possible: 10 } }],
  'GET /api/v1/calendar_events': () => [{ id: 1, title: 'Midterm', start_at: '2026-10-25T14:00:00Z', context_name: 'Algorithms' }],
  'GET /api/v1/courses/7/pages': () => [{ title: 'Syllabus', url: 'syllabus', updated_at: 'x', published: true }],
  'GET /api/v1/courses/7/pages/syllabus': () => ({ title: 'Syllabus', body: '<h1>Hi</h1><p>Week&nbsp;1 &amp; 2</p><script>x()</script>' }),
  'GET /api/v1/courses/7/files': () => [{ id: 9, display_name: 'notes.txt', 'content-type': 'text/plain', size: 5 }],
  'GET /api/v1/files/9': () => ({ display_name: 'notes.txt', 'content-type': 'text/plain', size: 5, url: `${base}/dl/9` }),
  'GET /api/v1/files/10': () => ({ display_name: 'a.png', 'content-type': 'image/png', size: 5, url: `${base}/dl/10` }),
  'GET /dl/9': () => 'hello',
  'GET /api/v1/courses/7/quizzes': () => [{ id: 3, title: 'Quiz 1', question_count: 5 }],
  'GET /api/v1/conversations': () => [{ id: 4, subject: 'Hi', participants: [{ name: 'Prof' }], workflow_state: 'unread' }],
  'GET /api/v1/courses/7/assignments': () => [{ id: 1, name: 'PS1', submission_types: [], submission: { workflow_state: 'unsubmitted' } }],
  'GET /api/v1/courses/404': () => null,
};

before(async () => {
  server = http.createServer((req, res) => {
    const path = req.url.split('?')[0];
    requests.push({ key: `${req.method} ${path}`, auth: req.headers.authorization, query: req.url.split('?')[1] ?? '' });
    const h = routes[`${req.method} ${path}`];
    const out = h?.();
    if (out === undefined || out === null) {
      res.writeHead(404, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ errors: [{ message: 'The specified resource does not exist.' }] }));
    }
    res.writeHead(200, { 'content-type': typeof out === 'string' ? 'text/plain' : 'application/json' });
    res.end(typeof out === 'string' ? out : JSON.stringify(out));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  client = new Client({ name: 'e2e', version: '0' });
  await client.connect(new StdioClientTransport({
    command: process.execPath, args: ['dist/index.js'],
    env: { ...process.env, CANVAS_API_TOKEN: 'tok', CANVAS_BASE_URL: base },
  }));
});
after(async () => { await client.close(); server.close(); });

const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  return { isError: r.isError, text: r.content[0].text };
};

test('get_grades joins enrollments with course names', async () => {
  const r = await call('get_grades');
  assert.ok(!r.isError, r.text);
  const [g] = JSON.parse(r.text);
  assert.equal(g.course, 'Algorithms');
  assert.equal(g.current_grade, 'A-');
});

test('get_todo, calendar, quizzes, inbox, files, pages', async () => {
  assert.equal(JSON.parse((await call('get_todo')).text)[0].name, 'PS1');
  assert.equal(JSON.parse((await call('list_calendar_events', { start_date: '2026-10-01', end_date: '2026-10-31' })).text)[0].title, 'Midterm');
  assert.equal(JSON.parse((await call('list_quizzes', { course_id: 7 })).text)[0].question_count, 5);
  assert.equal(JSON.parse((await call('list_inbox')).text)[0].unread, true);
  assert.equal(JSON.parse((await call('list_files', { course_id: 7 })).text)[0].name, 'notes.txt');
  assert.equal(JSON.parse((await call('list_pages', { course_id: 7 })).text)[0].url, 'syllabus');
});

test('get_page strips HTML and scripts', async () => {
  const body = JSON.parse((await call('get_page', { course_id: 7, page_url: 'syllabus' })).text).body;
  assert.match(body, /Hi/);
  assert.match(body, /Week 1 & 2/);
  assert.doesNotMatch(body, /<|x\(\)/);
});

test('read_file returns text content, and metadata only for binaries', async () => {
  assert.equal(JSON.parse((await call('read_file', { file_id: 9 })).text).content, 'hello');
  assert.match((await call('read_file', { file_id: 10 })).text, /Not a text file/);
});

test('every request carried the bearer token (file download excluded)', () => {
  for (const r of requests.filter((r) => r.key.includes('/api/v1/'))) assert.equal(r.auth, 'Bearer tok');
  assert.equal(requests.find((r) => r.key === 'GET /dl/9').auth, undefined);
});

test('list_courses for completed enrollments also asks for completed courses', async () => {
  await call('list_courses', { enrollment_state: 'completed' });
  const q = decodeURIComponent(requests.filter((r) => r.key === 'GET /api/v1/courses').at(-1).query);
  assert.match(q, /state\[\]=completed/);
});

test('API errors surface as readable isError results', async () => {
  const r = await call('get_course', { course_id: 404 });
  assert.equal(r.isError, true);
  assert.match(r.text, /does not exist/);
  assert.match(r.text, /Not found/);
});

test('submit_assignment validates online_upload without calling Canvas', async () => {
  const before = requests.length;
  const r = await call('submit_assignment', { course_id: 7, assignment_id: 1, submission_type: 'online_upload' });
  assert.equal(r.isError, true);
  assert.match(r.text, /file_ids/);
  assert.equal(requests.length, before);
});
