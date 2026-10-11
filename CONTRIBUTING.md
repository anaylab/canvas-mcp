# Contributing

Thanks for helping out. canvas-mcp is small on purpose, so it's easy to get oriented.

## Setup

```bash
git clone https://github.com/anaylab/canvas-mcp.git
cd canvas-mcp
npm install
npm test
```

You don't need a Canvas account: `npm run demo` starts a fake Canvas with sample data, and the whole test suite runs against it.

## Adding a tool

1. Add the API call to `src/canvas-client.ts` (use `requestAllPages` for list endpoints so pagination works).
2. Register the tool in the right file under `src/tools/` with a clear `description` and `.describe()` on every argument; the model reads these to decide when to call it.
3. If it changes data in Canvas, add its name to `WRITE_TOOLS` in `src/register.ts` so clients prompt before running it.
4. Add the endpoint to `src/demo/fake-canvas.ts` and a case to `test/demo.test.mjs`.
5. Add it to the tool table in the README.

## Principles

- **Local-first and private.** Never send the token anywhere except the configured Canvas host.
- **Read tools are free; write tools are deliberate.** New write tools must be annotated and should never act by surprise.
- **Return what a person needs, not the raw API payload.** Trim fields, convert HTML to text, keep results short enough for a model to use.

## Pull requests

Keep PRs focused, make sure `npm test` passes, and describe what you tested. If you could only test against the demo, say so.
