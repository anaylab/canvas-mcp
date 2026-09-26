# canvas-mcp

An MCP (Model Context Protocol) server that connects Claude to Canvas LMS — manage coursework through natural conversation.

Supports both stdio and HTTP transports, so it can run as a local MCP server or be deployed as a hosted HTTP service.

## Features

Built with the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol), Express, and Zod for schema validation, this server lets Claude interact with a Canvas LMS instance — courses, assignments, and related coursework — on the user's behalf.

## Setup

1. Copy `.env.example` to `.env`
2. Generate a Canvas API token: **Account → Settings → Approved Integrations → + New Access Token**
3. Set `CANVAS_API_TOKEN` and `CANVAS_BASE_URL` in `.env`

```bash
npm install
npm run build
npm start        # stdio transport
npm run start:http  # HTTP transport
```

## Tech stack

- TypeScript
- `@modelcontextprotocol/sdk`
- Express
- Zod

## License

MIT
