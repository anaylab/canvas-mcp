import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createFakeCanvas, DEMO_TOKEN } from '../dist/demo/fake-canvas.js';

// Every tool, run against the built-in demo data. Guards both the tools and the demo.
let fake, client;
before(async () => {
  fake = createFakeCanvas();
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${fake.address().port}`;
  client = new Client({ name: 'demo', version: '0' });
  await client.connect(new StdioClientTransport({
    command: process.execPath, args: ['dist/index.js'],
    env: { ...process.env, CANVAS_API_TOKEN: DEMO_TOKEN, CANVAS_BASE_URL: base },
  }));
});
after(async () => { await client.close(); fake.close(); });

const run = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  assert.ok(!r.isError, `${name} failed: ${r.content[0].text}`);
  const t = r.content[0].text;
  try { return JSON.parse(t); } catch { return t; }
};

const read = [
  ['list_courses', {}], ['get_course', { course_id: 101 }],
  ['list_assignments', { course_id: 101 }], ['get_assignment', { course_id: 101, assignment_id: 1001 }],
  ['get_rubric', { course_id: 101, assignment_id: 1001 }], ['get_submission', { course_id: 101, assignment_id: 1003 }],
  ['list_modules', { course_id: 101, include_items: true }], ['list_announcements', { course_ids: [101, 102] }],
  ['list_discussions', { course_id: 101 }], ['get_discussion_entries', { course_id: 101, topic_id: 701 }],
  ['find_assignments_by_due_date', { course_id: 101, start_date: '2000-01-01', end_date: '2100-01-01' }],
  ['get_upcoming_assignments', { course_id: 101, days_ahead: 14 }], ['get_overdue_assignments', { course_id: 101 }],
  ['search_course_content', { course_id: 101, search_term: 'graph' }], ['get_all_upcoming_work', { days_ahead: 14 }],
  ['get_grades', {}], ['get_todo', {}], ['list_calendar_events', { start_date: '2000-01-01', end_date: '2100-01-01' }],
  ['list_pages', { course_id: 101 }], ['get_page', { course_id: 101, page_url: 'late-policy' }],
  ['list_files', { course_id: 101 }], ['read_file', { file_id: 9001 }], ['list_quizzes', { course_id: 101 }],
  ['get_quiz', { course_id: 101, quiz_id: 601 }],
  ['get_planner_items', { start_date: '2000-01-01', end_date: '2100-01-01' }],
  ['list_inbox', {}], ['get_conversation', { conversation_id: 301 }],
];
for (const [name, args] of read) test(`demo: ${name}`, async () => { assert.ok(await run(name, args)); });

test('demo data makes sense', async () => {
  const overdue = await run('get_overdue_assignments', { course_id: 101 });
  assert.match(JSON.stringify(overdue), /Dynamic Programming/);
  const all = await run('get_all_upcoming_work', { days_ahead: 14 });
  assert.match(JSON.stringify(all), /Graph Algorithms/);
  assert.match((await run('read_file', { file_id: 9001 })).content, /BFS/);
});

test('demo: write tools succeed without storing anything', async () => {
  const r = await run('post_discussion_entry', { course_id: 101, topic_id: 701, message: 'hello' });
  assert.ok(r);
});

const nodeMajor = Number(process.versions.node.split('.')[0]);
test('read_file extracts text from a PDF (Node 22+) or degrades gracefully', async () => {
  const r = await run('read_file', { file_id: 9002 });
  if (nodeMajor >= 22) {
    assert.match(r.content, /Dijkstra/);
    assert.match(r.content, /priority queue/);
  } else {
    assert.match(r.note, /Node 22/);
    assert.ok(r.download_url);
  }
});

test('quiz and planner details look right', async () => {
  assert.match((await run('get_quiz', { course_id: 101, quiz_id: 601 })).instructions, /cycle detection/);
  const planner = await run('get_planner_items', { start_date: '2000-01-01', end_date: '2100-01-01' });
  assert.ok(planner.some((i) => /Problem Set 4/.test(i.title) && i.submitted === false));
});
