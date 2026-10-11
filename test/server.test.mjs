import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('stdio server lists tools with correct read/write annotations', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/index.js'],
    env: { ...process.env, CANVAS_API_TOKEN: 'x', CANVAS_BASE_URL: 'https://school.test' },
  });
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    for (const name of ['list_courses', 'get_grades', 'get_todo', 'read_file', 'submit_assignment'])
      assert.ok(byName[name], `missing tool ${name}`);
    assert.equal(byName.list_courses.annotations.readOnlyHint, true);
    assert.equal(byName.get_grades.annotations.readOnlyHint, true);
    for (const w of ['submit_assignment', 'upload_file', 'post_discussion_entry', 'reply_to_discussion'])
      assert.equal(byName[w].annotations.readOnlyHint, false, `${w} should not be read-only`);
  } finally {
    await client.close();
  }
});

test('prompts are exposed and render', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/index.js'],
    env: { ...process.env, CANVAS_API_TOKEN: 'x', CANVAS_BASE_URL: 'https://school.test' },
  });
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(transport);
  try {
    const { prompts } = await client.listPrompts();
    assert.deepEqual(prompts.map((p) => p.name).sort(), ['assignment_brief', 'catch_up', 'grade_check', 'weekly_plan', 'whats_due']);
    const r = await client.getPrompt({ name: 'weekly_plan', arguments: { days: '3' } });
    assert.match(r.messages[0].content.text, /next 3 days/);
  } finally {
    await client.close();
  }
});
