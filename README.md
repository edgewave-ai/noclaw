# noclaw

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run src/index.ts
```

This project was created using `bun init` in bun v1.3.6. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

Behavior:

- Trigger bot with `@Andy your question` (name can be changed by `ASSISTANT_NAME`)
- Use `/clear` to reset current chat session context

Optional env vars:

- `CLAUDE_PERMISSION_MODE` default is `default` (`acceptEdits` / `bypassPermissions` / `plan` / `dontAsk`)
- `SYSTEM_PROMPT_FILE` custom prompt file path (default `system-prompt.md`)
- `ROUTER_DATA_DIR` custom runtime state directory (default project `data/`)
