/**
 * A tiny in-memory fake of the Canvas LMS REST API with realistic sample data,
 * so anyone can try canvas-mcp without a Canvas account or token.
 * Dates are relative to "now", so the demo always has upcoming and overdue work.
 */
import http from 'node:http';

const DAY = 86_400_000;
const at = (days: number, hour = 23, minute = 59) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
};

export const DEMO_TOKEN = 'demo-token';

function buildData(base: string) {
  const courses = [
    { id: 101, name: 'Algorithms and Data Structures', course_code: 'CS301', term: { name: 'Fall 2026' }, total_students: 84, start_at: at(-45), end_at: at(75), default_view: 'modules', syllabus_body: '<h2>CS301</h2><p>Weekly problem sets (40%), midterm (25%), final project (35%). Late work loses 10% per day.</p>' },
    { id: 102, name: 'Introduction to Microeconomics', course_code: 'ECON101', term: { name: 'Fall 2026' }, total_students: 210, start_at: at(-45), end_at: at(75), default_view: 'feed', syllabus_body: '<p>Two midterms and a final. Weekly reading responses.</p>' },
    { id: 103, name: 'Academic Writing', course_code: 'ENGL210', term: { name: 'Fall 2026' }, total_students: 22, start_at: at(-45), end_at: at(75), default_view: 'wiki', syllabus_body: '<p>Three essays and a portfolio.</p>' },
  ];

  const sub = (state: string, extra: Record<string, unknown> = {}) => ({ workflow_state: state, ...extra });
  const rubric = [
    { id: 'c1', description: 'Correctness', long_description: 'Algorithms produce correct output on all cases', points: 20, ratings: [{ points: 20, description: 'Full marks' }, { points: 10, description: 'Partial' }, { points: 0, description: 'None' }] },
    { id: 'c2', description: 'Complexity analysis', long_description: 'Runtime and space justified', points: 10, ratings: [{ points: 10, description: 'Rigorous' }, { points: 5, description: 'Hand-wavy' }, { points: 0, description: 'Missing' }] },
  ];

  const assignments = [
    { id: 1001, course_id: 101, name: 'Problem Set 4: Graph Algorithms', due_at: at(2), points_possible: 30, submission_types: ['online_upload'], published: true, rubric, rubric_settings: { points_possible: 30, free_form_criterion_comments: false }, use_rubric_for_grading: true, description: '<p>Implement BFS, DFS and Dijkstra. Analyse the runtime of each.</p>', submission: sub('unsubmitted') },
    { id: 1002, course_id: 101, name: 'Problem Set 3: Dynamic Programming', due_at: at(-3), points_possible: 30, submission_types: ['online_upload'], published: true, description: '<p>Knapsack and LCS.</p>', submission: sub('unsubmitted', { missing: true }) },
    { id: 1003, course_id: 101, name: 'Problem Set 2: Sorting', due_at: at(-17), points_possible: 30, submission_types: ['online_upload'], published: true, description: '<p>Merge sort, quicksort.</p>', submission: sub('graded', { grade: '27', score: 27, submitted_at: at(-18), graded_at: at(-12) }) },
    { id: 1004, course_id: 101, name: 'Midterm Exam', due_at: at(9, 14, 0), points_possible: 100, submission_types: ['on_paper'], published: true, description: '<p>Chapters 1-8. Closed book.</p>', submission: sub('unsubmitted') },
    { id: 2001, course_id: 102, name: 'Reading Response 6: Elasticity', due_at: at(1), points_possible: 10, submission_types: ['online_text_entry'], published: true, description: '<p>500 words on price elasticity of demand.</p>', submission: sub('unsubmitted') },
    { id: 2002, course_id: 102, name: 'Reading Response 5: Supply Shifts', due_at: at(-8), points_possible: 10, submission_types: ['online_text_entry'], published: true, submission: sub('graded', { grade: '9', score: 9, submitted_at: at(-9) }) },
    { id: 2003, course_id: 102, name: 'Midterm 2', due_at: at(14, 15, 0), points_possible: 100, submission_types: ['on_paper'], published: true, submission: sub('unsubmitted') },
    { id: 3001, course_id: 103, name: 'Essay 2: Argument Analysis', due_at: at(5), points_possible: 50, submission_types: ['online_upload', 'online_text_entry'], published: true, description: '<p>Analyse the argument of an op-ed of your choice. 1,500 words.</p>', submission: sub('unsubmitted') },
    { id: 3002, course_id: 103, name: 'Essay 1: Personal Narrative', due_at: at(-20), points_possible: 50, submission_types: ['online_upload'], published: true, submission: sub('graded', { grade: '44', score: 44, submitted_at: at(-21), graded_at: at(-14) }) },
  ];

  const modules = [
    { id: 11, course_id: 101, name: 'Week 6: Graphs', position: 6, state: 'started', items: [
      { id: 111, title: 'Lecture 11: BFS and DFS', type: 'File', content_id: 9001, position: 1 },
      { id: 112, title: 'Problem Set 4: Graph Algorithms', type: 'Assignment', content_id: 1001, position: 2 },
      { id: 113, title: 'Reading: CLRS ch. 22', type: 'ExternalUrl', external_url: 'https://example.com/clrs', position: 3 } ] },
    { id: 12, course_id: 101, name: 'Week 7: Shortest Paths', position: 7, state: 'unlocked', items: [
      { id: 121, title: 'Lecture 13: Dijkstra', type: 'File', content_id: 9002, position: 1 } ] },
  ];

  const announcements = [
    { id: 501, title: 'Midterm logistics', message: '<p>The midterm is in Hall B. Bring a pencil and your student ID.</p>', posted_at: at(-1), context_code: 'course_101', author: { display_name: 'Prof. Rivera' } },
    { id: 502, title: 'Office hours moved', message: '<p>Thursday office hours move to 3pm this week.</p>', posted_at: at(-4), context_code: 'course_101', author: { display_name: 'Prof. Rivera' } },
    { id: 503, title: 'Reading response format', message: '<p>Use 12pt font, single-spaced.</p>', posted_at: at(-6), context_code: 'course_102', author: { display_name: 'Dr. Okafor' } },
  ];

  const topics = [
    { id: 701, course_id: 101, title: 'Week 6 discussion: When is BFS better than DFS?', message: '<p>Share a concrete example.</p>', posted_at: at(-3), discussion_subentry_count: 2, unread_count: 1, published: true, author: { display_name: 'Prof. Rivera' } },
  ];
  const entries = [
    { id: 8001, user_id: 5, user_name: 'Maya Chen', message: '<p>BFS for shortest paths in unweighted graphs.</p>', created_at: at(-2), recent_replies: [] },
    { id: 8002, user_id: 6, user_name: 'Jonah Park', message: '<p>DFS for cycle detection and topological sort.</p>', created_at: at(-1), recent_replies: [] },
  ];

  return {
    courses, assignments, modules, announcements, topics, entries,
    enrollments: [
      { course_id: 101, grades: { current_score: 90.0, current_grade: 'A-', final_score: 36.0, final_grade: null } },
      { course_id: 102, grades: { current_score: 90.0, current_grade: 'A-', final_score: 18.0, final_grade: null } },
      { course_id: 103, grades: { current_score: 88.0, current_grade: 'B+', final_score: 44.0, final_grade: null } },
    ],
    pages: [
      { url: 'late-policy', title: 'Late Policy', updated_at: at(-30), published: true, body: '<h2>Late policy</h2><p>10% per day, up to 3 days. Extensions need approval <b>before</b> the deadline.</p>' },
      { url: 'exam-study-guide', title: 'Midterm Study Guide', updated_at: at(-2), published: true, body: '<h2>Study guide</h2><ul><li>Big-O analysis</li><li>Graph traversals</li><li>Dynamic programming</li></ul>' },
    ],
    files: [
      { id: 9001, display_name: 'lecture-11-bfs-dfs.md', 'content-type': 'text/markdown', size: 420, updated_at: at(-5), url: `${base}/files/9001/download`, body: '# Lecture 11\n\nBFS explores level by level using a queue: O(V+E).\nDFS uses a stack/recursion: O(V+E).\n' },
      { id: 9002, display_name: 'lecture-13-dijkstra.pdf', 'content-type': 'application/pdf', size: 90000, updated_at: at(-1), url: `${base}/files/9002/download`, body: '' },
    ],
    quizzes: [
      { id: 601, title: 'Quiz 3: Graph Traversals', due_at: at(3), points_possible: 15, question_count: 10, time_limit: 20, allowed_attempts: 2, locked_for_user: false, html_url: `${base}/courses/101/quizzes/601` },
    ],
    conversations: [
      { id: 301, subject: 'Re: Extension request', last_message: 'Approved. Submit by Friday.', last_message_at: at(-1), workflow_state: 'unread', participants: [{ name: 'Prof. Rivera' }, { name: 'You' }],
        messages: [{ author_id: 1, created_at: at(-2), body: 'Could I get a 2-day extension on PS3? I was ill.' }, { author_id: 2, created_at: at(-1), body: 'Approved. Submit by Friday.' }] },
    ],
  };
}

export function createFakeCanvas(): http.Server {
  const course = (id: number, d: ReturnType<typeof buildData>) => d.courses.find((c) => c.id === id);

  const bucketFilter = (a: ReturnType<typeof buildData>["assignments"][number], bucket?: string | null) => {
    const due = a.due_at ? Date.parse(a.due_at) : null;
    const state = a.submission.workflow_state;
    switch (bucket) {
      case 'upcoming': return due !== null && due > Date.now();
      case 'overdue': return due !== null && due < Date.now() && state === 'unsubmitted';
      case 'past': return due !== null && due < Date.now();
      case 'unsubmitted': return state === 'unsubmitted';
      case 'ungraded': return state !== 'graded';
      case 'undated': return due === null;
      default: return true;
    }
  };

  return http.createServer((req, res) => {
    // Derive the base from the Host header so download links always point back at this server.
    const base = `http://${req.headers.host}`;
    const d = buildData(base);
    const url = new URL(req.url ?? '/', base);
    const p = url.pathname;
    const send = (body: unknown, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const notFound = () => send({ errors: [{ message: 'The specified resource does not exist.' }] }, 404);

    // Signed-style download URL: no auth header expected, like real Canvas.
    const dl = p.match(/^\/files\/(\d+)\/download$/);
    if (dl) {
      const f = d.files.find((x) => x.id === Number(dl[1]));
      if (!f) return notFound();
      res.writeHead(200, { 'content-type': f['content-type'] });
      return res.end(f.body);
    }

    if (req.headers.authorization !== `Bearer ${DEMO_TOKEN}`) {
      return send({ errors: [{ message: 'Invalid access token.' }] }, 401);
    }
    const m = (re: RegExp) => p.match(re);
    let x: RegExpMatchArray | null;

    if (req.method === 'GET') {
      if (p === '/api/v1/courses') return send(d.courses);
      if ((x = m(/^\/api\/v1\/courses\/(\d+)$/))) { const c = course(+x[1], d); return c ? send(c) : notFound(); }
      if ((x = m(/^\/api\/v1\/courses\/(\d+)\/assignments$/))) {
        const bucket = url.searchParams.get('bucket');
        return send(d.assignments.filter((a) => a.course_id === +x![1] && bucketFilter(a, bucket)));
      }
      if ((x = m(/^\/api\/v1\/courses\/(\d+)\/assignments\/(\d+)$/))) {
        const a = d.assignments.find((a) => a.id === +x![2]); return a ? send(a) : notFound();
      }
      if ((x = m(/^\/api\/v1\/courses\/(\d+)\/assignments\/(\d+)\/submissions\/self$/))) {
        const a = d.assignments.find((a) => a.id === +x![2]);
        return a ? send({ id: a.id * 10, assignment_id: a.id, user_id: 1, ...a.submission, submission_comments: a.id === 1003 ? [{ id: 1, author_name: 'Prof. Rivera', comment: 'Nice work. Tighten the quicksort pivot argument.', created_at: at(-12) }] : [] }) : notFound();
      }
      if ((x = m(/^\/api\/v1\/courses\/(\d+)\/modules$/))) return send(d.modules.filter((mod) => mod.course_id === +x![1]));
      if ((x = m(/^\/api\/v1\/courses\/(\d+)\/modules\/(\d+)\/items$/))) { const mod = d.modules.find((mm) => mm.id === +x![2]); return mod ? send(mod.items) : notFound(); }
      if ((x = m(/^\/api\/v1\/courses\/(\d+)\/modules\/(\d+)$/))) { const mod = d.modules.find((mm) => mm.id === +x![2]); return mod ? send(mod) : notFound(); }
      if (p === '/api/v1/announcements') {
        const codes = url.searchParams.getAll('context_codes[]');
        return send(d.announcements.filter((a) => !codes.length || codes.includes(a.context_code)));
      }
      if ((x = m(/^\/api\/v1\/courses\/(\d+)\/discussion_topics$/))) return send(d.topics.filter((t) => t.course_id === +x![1]));
      if ((x = m(/^\/api\/v1\/courses\/(\d+)\/discussion_topics\/(\d+)$/))) { const t = d.topics.find((t) => t.id === +x![2]); return t ? send(t) : notFound(); }
      if ((x = m(/^\/api\/v1\/courses\/(\d+)\/discussion_topics\/(\d+)\/entries$/))) return send(d.entries);
      if (p === '/api/v1/users/self') return send({ id: 1, name: 'Demo Student' });
      if (p === '/api/v1/users/self/enrollments') return send(d.enrollments);
      if (p === '/api/v1/users/self/todo') {
        return send(d.assignments.filter((a) => a.submission.workflow_state === 'unsubmitted' && a.due_at && Date.parse(a.due_at) > Date.now())
          .map((a) => ({ type: 'submitting', course_id: a.course_id, html_url: `${base}/courses/${a.course_id}/assignments/${a.id}`, assignment: a })));
      }
      if (p === '/api/v1/calendar_events') {
        const type = url.searchParams.get('type');
        const from = Date.parse(url.searchParams.get('start_date') ?? '') || 0;
        const to = Date.parse(url.searchParams.get('end_date') ?? '') + DAY || Infinity;
        const codes = url.searchParams.getAll('context_codes[]');
        const items = type === 'assignment'
          ? d.assignments.map((a) => ({ id: a.id, title: a.name, start_at: a.due_at, end_at: a.due_at, context_name: course(a.course_id, d)?.name, html_url: `${base}/courses/${a.course_id}/assignments/${a.id}`, code: `course_${a.course_id}` }))
          : [{ id: 1, title: 'CS301 Midterm', start_at: at(9, 14, 0), end_at: at(9, 16, 0), context_name: course(101, d)?.name, location_name: 'Hall B', html_url: base, code: 'course_101' },
             { id: 2, title: 'ECON101 Review Session', start_at: at(12, 17, 0), end_at: at(12, 18, 0), context_name: course(102, d)?.name, html_url: base, code: 'course_102' }];
        return send(items.filter((e) => e.start_at && Date.parse(e.start_at) >= from && Date.parse(e.start_at) <= to && (!codes.length || codes.includes(e.code))));
      }
      if ((x = m(/^\/api\/v1\/courses\/(\d+)\/pages$/))) { const q = url.searchParams.get('search_term')?.toLowerCase(); return send(d.pages.filter((pg) => !q || pg.title.toLowerCase().includes(q))); }
      if ((x = m(/^\/api\/v1\/courses\/(\d+)\/pages\/(.+)$/))) { const pg = d.pages.find((pg) => pg.url === decodeURIComponent(x![2])); return pg ? send(pg) : notFound(); }
      if ((x = m(/^\/api\/v1\/courses\/(\d+)\/files$/))) { const q = url.searchParams.get('search_term')?.toLowerCase(); return send(d.files.filter((f) => !q || f.display_name.toLowerCase().includes(q))); }
      if ((x = m(/^\/api\/v1\/files\/(\d+)$/))) { const f = d.files.find((f) => f.id === +x![1]); return f ? send(f) : notFound(); }
      if ((x = m(/^\/api\/v1\/courses\/(\d+)\/quizzes$/))) return send(+x[1] === 101 ? d.quizzes : []);
      if (p === '/api/v1/conversations') return send(d.conversations);
      if ((x = m(/^\/api\/v1\/conversations\/(\d+)$/))) { const c = d.conversations.find((c) => c.id === +x![1]); return c ? send(c) : notFound(); }
      return notFound();
    }

    // Writes are accepted but not persisted: the demo is read-only by design.
    if (req.method === 'POST') {
      res.on('close', () => undefined);
      req.resume();
      req.on('end', () => send({ id: 99999, message: 'Demo mode: nothing was actually posted.', workflow_state: 'submitted', submitted_at: new Date().toISOString(), attempt: 1 }));
      return;
    }
    return send({ errors: [{ message: 'Method not allowed' }] }, 405);
  });
}
