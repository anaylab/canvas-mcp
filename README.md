# Canvas MCP Connector (Students)

Connect your Canvas LMS account to AI agents (Claude, ChatGPT, or any MCP client).

## What this gives you

- List your courses
- Find assignment details and rubrics
- See upcoming and overdue work
- Search modules and course content
- Check submission status and submit work

## 1) Create a Canvas API token

1. Log in to Canvas
2. Open **Account → Settings**
3. Scroll to **Approved Integrations**
4. Click **+ New Access Token**
5. Copy the token

## 2) Configure environment variables

```bash
cp .env.example .env
```

Set:

- `CANVAS_API_TOKEN`
- `CANVAS_BASE_URL` (example: `https://yourschool.instructure.com`)

If you want to use a hosted HTTP connector, also set:

- `MCP_AUTH_TOKEN` (any long random secret string)

## 3) Install and build

```bash
npm install
npm run build
```

## Option A: Local connector (Claude Desktop / local MCP clients)

Run:

```bash
npm start
```

This starts the MCP server over stdio.

## Option B: Hosted HTTP connector (ChatGPT / remote agents)

Run:

```bash
npm run start:http
```

This exposes:

- `POST/GET/DELETE /mcp` (MCP transport endpoint)
- `GET /health` (health check)

Every `/mcp` request must include:

```http
Authorization: ******
```

## Available student tools

- `list_courses`
- `get_course`
- `list_assignments`
- `get_assignment`
- `get_submission`
- `submit_text_assignment`
- `submit_url_assignment`
- `get_upcoming_assignments`
- `get_overdue_assignments`
- `get_all_upcoming_work`
- `search_course_content`

