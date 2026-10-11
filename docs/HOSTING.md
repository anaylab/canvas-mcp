# Hosting canvas-mcp in the cloud (free)

Most people should use the [local setup](../README.md#use-it-with-your-real-canvas): nothing to host, and your token never leaves your computer. Host it only if you want to reach Canvas from a client that can't run a local process (phone, a web-based MCP client, a second machine).

## The model: your own copy, for your own account

**One deployment holds one person's Canvas token.** Everyone who wants this deploys their own copy, which takes a few minutes and costs nothing on a free tier. Nobody has to trust anyone else with their Canvas credentials.

A single shared public instance that many people sign in to is deliberately **not** offered. It would mean one server holding everyone's Canvas tokens, and doing that safely needs a real OAuth flow, which this project doesn't have yet (see the [roadmap](../README.md#roadmap)). Please don't point friends at your instance or post its URL or token anywhere.

## Free options

Free tiers change, so check each provider's current pricing before relying on them.

| Option | What you get | Catch |
| --- | --- | --- |
| **[Render](https://render.com)** (easiest) | A free web service from this repo's `render.yaml` | Sleeps after ~15 min idle; the first request after that takes about a minute to wake it. About 750 free instance-hours per month |
| **[Google Cloud Run](https://cloud.google.com/run)** | Scales to zero with a monthly free allowance (2M requests at the time of writing) | Needs a billing account on file. Deploy straight from the `Dockerfile` |
| **Your own machine** | `docker run` anywhere, free | You expose it yourself (for example with a tunnel). Only do this if you know how to do it safely |

### Render, step by step

1. Click the button, or in Render choose **New → Blueprint** and select your fork of this repo:

   [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/anaylab/canvas-mcp)

2. When prompted, set:
   - `CANVAS_BASE_URL`: your school's Canvas URL, such as `https://yourschool.instructure.com`
   - `CANVAS_API_TOKEN`: a Canvas access token ([how to create one](../README.md#1-create-a-canvas-api-token)), with an expiry date
3. `MCP_AUTH_TOKEN` is generated for you. After deploy, open the service's **Environment** tab and copy it.
4. Your endpoint is `https://<your-service>.onrender.com/mcp`. Check it is up:

   ```bash
   curl https://<your-service>.onrender.com/health
   ```

### Cloud Run, in short

```bash
gcloud run deploy canvas-mcp --source . --region us-central1 --allow-unauthenticated \
  --set-env-vars CANVAS_BASE_URL=https://yourschool.instructure.com \
  --set-env-vars CANVAS_API_TOKEN=... --set-env-vars MCP_AUTH_TOKEN=$(openssl rand -hex 32)
```

`--allow-unauthenticated` only means Google's own login is off; the server still requires your `MCP_AUTH_TOKEN` on every request. For better secret handling, use Secret Manager instead of `--set-env-vars`.

## Connecting a client

The server speaks MCP over HTTP at `/mcp` and expects `Authorization: Bearer <MCP_AUTH_TOKEN>`.

**Claude Code:**

```bash
claude mcp add --transport http canvas https://<your-service>.onrender.com/mcp \
  --header "Authorization: Bearer <MCP_AUTH_TOKEN>"
```

**Other clients that accept a URL plus headers** (Cursor and similar) take the same two values:

```json
{
  "mcpServers": {
    "canvas": {
      "url": "https://<your-service>.onrender.com/mcp",
      "headers": { "Authorization": "Bearer <MCP_AUTH_TOKEN>" }
    }
  }
}
```

**Claude Desktop and claude.ai connectors:** these expect OAuth rather than a static bearer token, so they can't connect to HTTP mode today. Use the local setup there.

## What the server does to protect you

- Requires a 16+ character `MCP_AUTH_TOKEN` and refuses to start without one.
- Refuses to start if `CANVAS_BASE_URL` isn't `https://` (localhost excepted), so your Canvas token is never sent in clear text.
- Compares the token in constant time, and blocks an IP for a minute after 10 failed attempts.
- Never logs tokens, and only ever sends your Canvas token to the one Canvas host you configured.

## Your checklist

- Give the Canvas token an expiry date, and revoke it in Canvas if anything looks wrong.
- To rotate `MCP_AUTH_TOKEN`, change it in the provider's dashboard and update your client.
- Don't commit tokens, and don't share the URL.
- Expect the first request after idle time to be slow on Render's free tier. That's the cold start, not a bug.

## What has been tested

The HTTP server is covered by automated tests (auth, throttling, startup checks, a full MCP session), and the Docker build steps were reproduced by hand, including running with production dependencies only. It has **not** yet been deployed on Render or Cloud Run by the maintainers, so if a step here doesn't match what you see, please open an issue.
