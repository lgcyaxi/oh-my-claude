# Codex App-Server Guide

How `CodexAppServerDaemon` powers the native Codex coworker in oh-my-claude.

## Overview

Codex runs headlessly over `codex app-server` using stdio JSON-RPC 2.0, but
oh-my-claude now layers a terminal viewer on top by default.

Current behavior:

- headless execution via `codex app-server`
- automatic terminal viewer unless `CODEX_NO_VIEWER=1`
- shared coworker activity log and status signal files
- live statusline integration through the `codex` segment on infrastructure row 3

Relevant code:

- [codex app-server](/Users/axiba/Downloads/Gits/oh-my-claude/src/coworker/codex/app-server.ts)
- [codex conversation](/Users/axiba/Downloads/Gits/oh-my-claude/src/coworker/codex/conversation.ts)
- [codex runtime](/Users/axiba/Downloads/Gits/oh-my-claude/src/coworker/codex-runtime.ts)
- [coworker protocol coverage](/Users/axiba/Downloads/Gits/oh-my-claude/docs/guides/coworker-protocol-coverage.md)

## Prerequisites

1. Install Codex CLI: `npm install -g @openai/codex`
2. Authenticate: `codex login` or `omc auth openai`
3. Verify: `codex --version`

## Runtime Flow

Per session:

1. `initialize`
2. `getAuthStatus`
3. `thread/start`
4. auto-open viewer if enabled

Per task:

1. `turn/start`
2. stream notifications such as:
   - `item/agentMessage/delta`
   - `item/plan/delta`
   - `item/reasoning/textDelta`
   - `item/commandExecution/outputDelta`
   - `item/fileChange/outputDelta`
   - `item/mcpToolCall/progress`
   - `turn/completed`
3. write activity log + status signal
4. resolve `coworker_task(action="send", ...)`

## Observability

### Activity Log

Path:

`~/.claude/oh-my-claude/logs/coworker/codex.jsonl`

The file stores raw coworker activity events. The CLI viewer renders this log in
aggregated form by default.

Commands:

```bash
omc m codex log          # live aggregated view
omc m codex log --print  # print recent aggregated history
omc m codex log --raw    # raw unmerged events
omc m codex log --clear  # truncate log
```

### Status Signal

Path:

`~/.claude/oh-my-claude/run/codex-status.json`

States:

- `idle`
- `starting`
- `thinking`
- `streaming`
- `complete`
- `error`

The statusline `codex` segment reads this file and displays on infrastructure
row 3.

## Viewer

Codex now opens a terminal viewer automatically when the runtime starts, unless:

- `CODEX_NO_VIEWER=1`
- no supported terminal backend is available

Viewer spawn order:

1. tmux split
2. WezTerm split
3. macOS Terminal fallback
4. Linux `xterm` fallback

The viewer tails `omc m codex log`, so what you see is the aggregated coworker
log view rather than a separate web UI.

## Claude Code Usage

### Via MCP

```typescript
await coworker_task({
  action: "send",
  target: "codex",
  message: "Implement feature X",
  timeout_ms: 120000,
  approval_policy: "on-request",
});
```

### Via command prompt

Use `/omc-codex` with an outcome-oriented task description.

### Status inspection

Use:

- `coworker_task(action="status")`
- `coworker_task(action="recent_activity", target="codex")`

Use `coworker_task(action="status")` and
`coworker_task(action="recent_activity")`. Status includes
`viewerAvailable`, `viewerAttached`, and `approvalPolicy`.

## Current Capability Boundary

Implemented:

- headless daemon bootstrap
- auth check
- thread creation
- single-turn task submission
- native review / diff / fork / rollback execution paths
- native approval request / response mapping
- streaming text, plan, reasoning, tool, diff, and completion event mapping
- automatic viewer spawn
- shared coworker log + status signal integration

Not yet implemented:

- full thread/session management client surface (`read/list/resume/admin`)
- realtime audio APIs

## Troubleshooting

**No Codex response before timeout**

- first check `omc m codex log`
- then check `omc m codex log --raw` for low-level event detail

**Viewer did not open**

- ensure `CODEX_NO_VIEWER` is not set
- ensure tmux / WezTerm / Terminal / xterm fallback is available
- the task can still complete without the viewer

**Statusline not showing**

- enable with `omc m statusline toggle codex on`
- the segment hides when the signal is `idle` or stale

**Why no approvals appear**

- default Codex coworker sessions run with `approvalPolicy: "never"`
- use `approval_policy: "on-request"` on `coworker_task(action="send" | "review", ...)`
  or set `OMC_CODEX_APPROVAL_POLICY=on-request` before starting the task
- confirm the active policy with `coworker_task(action="status")`
- `on-request` is protocol-native behavior, not an always-ask mode
