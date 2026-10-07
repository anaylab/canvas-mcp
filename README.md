# canvas-mcp

An [MCP](https://modelcontextprotocol.io) server that connects AI assistants such as Claude to your Canvas LMS account, so you can ask about courses, assignments, deadlines and discussions in plain language.

> **Unofficial.** This project is not affiliated with or endorsed by Instructure or Anthropic.

## Quick start (local, recommended)

Local stdio mode runs entirely on your machine. There is no server to host and no network exposure.

**Requirements:** Node.js 18+ and a Canvas account.

### 1. Create a Canvas API token

1. Log in to Canvas.
2. Go to **Account → Settings**.
3. Under **Approved Integrations**, click **+ New Access Token**.
4. Give it a purpose (for example "Claude MCP") and **set an expiry date**.
5. Copy the token. You can't view it again.

Some schools disable student tokens. If you don't see the option, ask your school.

### 2. Install and build

```bash
git clone https://github.com/anaylab/canvas-mcp.git
cd canvas-mcp
npm install
npm run build
```

### 3. Add it to Claude Desktop

Open **Settings → Developer → Edit Config** and add:

```json
{
  "mcpServers": {
    "canvas": {
      "command": "node",
      "args": ["/absolute/path/to/canvas-mcp/dist/index.js"],
      "env": {
        "CANVAS_API_TOKEN": "your_token",
        "CANVAS_BASE_URL": "https://yourschool.instructure.com"
      }
    }
  }
}
```

Restart Claude Desktop. Passing the token through `env` is more reliable than a `.env` file, because Claude Desktop starts the server from a different working directory.

Any other MCP client that supports stdio works the same way. You can also run `npm start` with a `.env` file (copy `.env.example`).

## Tools

| Area | Tools |
| --- | --- |
| Courses | `list_courses`, `get_course` |
| Assignments | `list_assignments`, `get_assignment`, `get_rubric` |
| Deadlines and search | `find_assignments_by_due_date`, `get_upcoming_assignments`, `get_overdue_assignments`, `get_all_upcoming_work`, `search_course_content` |
| Modules | `list_modules`, `list_announcements` |
| Discussions | `list_discussions`, `get_discussion_entries`, `post_discussion_entry`, `reply_to_discussion` |
| Submissions | `get_submission`, `submit_assignment`, `upload_file` |

**Note:** `post_discussion_entry`, `reply_to_discussion`, `submit_assignment` and `upload_file` change data in Canvas as you. Review what your assistant is about to do before approving those calls, and follow your school's academic integrity policy.

## HTTP mode (experimental)

`npm run start:http` serves the MCP endpoint at `/mcp` and a health check at `/health`, for remote clients. Requests need an `Authorization: Bearer <MCP_AUTH_TOKEN>` header.

This mode is experimental. If you host it, you are exposing a service that holds your Canvas token and can act on your account:

- Serve it over HTTPS only.
- Use a long random `MCP_AUTH_TOKEN`.
- Don't share the URL or token.
- Many hosted connector UIs expect OAuth rather than a static bearer token, so compatibility isn't guaranteed.

`render.yaml` is provided as a starting point for deploying to Render.

## Security

- Your Canvas token gives access to your account. Keep it out of git (`.env` is in `.gitignore`), give it an expiry, and revoke it from Canvas settings if it leaks.
- Treat your MCP client config file as a secret, since it contains the token.
- Found a vulnerability? Please open a private security advisory on GitHub instead of a public issue.

## Development

```bash
npm run dev     # TypeScript watch mode
npm run build   # compile to dist/
```

## License

[MIT](LICENSE)
