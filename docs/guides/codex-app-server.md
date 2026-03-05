# Codex App-Server Guide

How to use `CodexAppServerDaemon` — the headless JSON-RPC bridge to OpenAI Codex CLI — from Claude Code via oh-my-claude.

## Overview

`CodexAppServerDaemon` drives the `codex app-server` process over JSON-RPC 2.0 via stdin/stdout. Unlike the legacy `CodexDaemon` (which injects text into a tmux/WezTerm pane), this daemon is fully headless:

- No terminal pane required
- No tmux/WezTerm dependency
- Starts in ~2–5 seconds and signals readiness automatically
- Supports any environment (local, remote, CI)

## Prerequisites

1. Install Codex CLI: `npm install -g @openai/codex`
2. Authenticate: `codex login` (or `omc auth openai`)
3. Verify: `codex --version` and `codex app-server --version`

## Wire Protocol

The daemon communicates with `codex app-server` using JSON-RPC 2.0 over newline-delimited stdin/stdout.

### Initialization Sequence

```
→ initialize      { protocolVersion, capabilities, clientInfo }
← result          { serverInfo, ... }

→ getAuthStatus   {}
← result          { authMethod: "chatgpt" | "api_key" | null, ... }

→ newConversation { cwd, approvalPolicy: "never", ... }
← result          { conversationId, model }

→ addConversationListener  { conversationId }
← result          { subscriptionId }
```

### Per-Turn Flow

```
→ sendUserTurn    { conversationId, items: [{ type: "text", data: { text } }],
                    approvalPolicy: "never", sandboxPolicy: { type: "danger-full-access" },
                    model, cwd }
← (no direct response — results arrive as notifications below)

← notification:  codex/event/agent_message_delta  { msg: { delta } }  (streaming chunk)
← notification:  codex/event/agent_message        { msg: { message } } (full final message)
← notification:  codex/event/task_complete        { msg: { last_agent_message } }
```

### Error Notification

```
← notification:  codex/event/error  { msg: { message } }
```

## Daemon Lifecycle

```typescript
import { CodexAppServerDaemon } from "oh-my-claude/workers/daemon/ais";

const daemon = new CodexAppServerDaemon({
  config: { name: "codex", cliCommand: "codex", cliArgs: ["app-server"] },
  projectPath: process.cwd(),
});

await daemon.start();           // spawn + initialize + auth + newConversation

await daemon.send("Refactor src/utils.ts to use async/await");

// Poll until response
let response: string | null = null;
while (!response) {
  await new Promise(r => setTimeout(r, 200));
  response = await daemon.checkResponse();
}
console.log(response);

await daemon.stop();
```

## Observability

The daemon writes two signal files automatically:

### Activity Log

Path: `~/.claude/oh-my-claude/logs/codex-activity.jsonl`

Each line is a JSON entry:
```json
{ "ts": "2026-03-04T12:00:00.000Z", "type": "user_turn", "content": "Refactor ...", "model": "gpt-5.3-codex" }
```

Entry types: `session_start`, `user_turn`, `agent_message`, `task_complete`, `error`

View with: `omc m codex log --print`
Follow live: `omc m codex log` (default)
Clear: `omc m codex log --clear`

### Status Signal

Path: `~/.claude/oh-my-claude/run/codex-status.json`

Written atomically (tmp + rename) on every state change:
```json
{ "state": "thinking", "model": "gpt-5.3-codex", "updatedAt": 1709553600000 }
```

States: `idle`, `thinking`, `complete`, `error`

Read by the statusline codex segment to display live status on row 2.

## Bridge Integration

When `oh-my-claude bridge up codex` is called, `CodexAppServerDaemon` is used automatically (no terminal pane). You can then delegate tasks via `bridge_send`:

```
bridge_send("codex", "Add error handling to all API calls in src/")
```

The `bridge_send` MCP tool automatically:
1. Spawns `CodexAppServerDaemon` if not running
2. Delegates the request via the orchestrator
3. Polls for completion (up to 120s by default)
4. Returns the response text

## Using from Claude Code

### Via bridge_send

```typescript
// In Claude Code (with bridge running):
await bridge_send({ ai_name: "codex", message: "Implement feature X" });
```

### Via /omc-codex skill

Invoke `/omc-codex` to send a task directly to the codex bridge worker.

### Statusline

Enable the codex segment in your statusline configuration:
```bash
omc m statusline toggle codex on
```

The segment shows on row 2 alongside bridge workers:
- `⟳ Codex` (yellow) — thinking
- `✓ Codex` (green) — turn complete (fades after 5s)
- `✗ Codex` (red) — error (fades after 30s)

### Manage

```bash
omc m codex log          # tail live activity
omc m codex log --print  # print last 50 entries
omc m codex log --clear  # truncate log
```

## Configuration

The daemon picks up `cliCommand` and `cliArgs` from `AIConfig`:

```typescript
{
  name: "codex",
  cliCommand: "codex",
  cliArgs: ["app-server"],   // required — launches headless mode
  idleTimeoutMs: 60000,
  requestTimeoutMs: 300000,
}
```

The `projectPath` determines the working directory for the `codex app-server` process. Codex scans files relative to this path.

## Troubleshooting

**Auth error on start**: Run `codex login` or `omc auth openai`. The daemon checks `~/.codex/auth.json`.

**`codex: not found`**: Ensure `npm install -g @openai/codex` and that `$(npm root -g)/../bin` is in PATH.

**No response within timeout**: Check `omc m codex log` for error entries. Common causes: network issues, model rate limits, task too complex.

**Statusline not showing**: Enable with `omc m statusline toggle codex on`. The segment is hidden when the signal file is absent or idle.
