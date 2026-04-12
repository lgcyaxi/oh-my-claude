# Coworker Architecture

## Overview

The active runtime is split into three layers:

1. `coworker/` Native external runtimes (OpenCode)
2. `mcp/` Tool-facing entrypoint led by `coworker_task(action, ...)`
3. `proxy/` Session-wide provider routing for sustained multi-turn work

## Routing Model

Use `coworker_task(action="send", ...)` for:

- self-contained delegated work
- explicit OpenCode assignment
- work that should run outside the main Claude Code turn flow

Use proxy routing for:

- sustained multi-turn work
- session-wide provider switching
- workflows that need native tool use inside the routed Claude Code session

## Runtime Layout

### OpenCode

- Runtime: `src/coworker/opencode/runtime.ts`
- Server bootstrap: `src/coworker/opencode/server.ts`
- Viewer: auto terminal viewer backed by `opencode attach <server-url>` with fallback launch
  behavior and TUI session control

OpenCode executes through `opencode serve` and the official HTTP server API. The viewer is optional
for execution: the runtime continues through `serve + session API` even if viewer attach fails. When
the viewer is available, the runtime now selects the active session and pushes TUI toasts so the
panel tracks the coworker task instead of only passively attaching. The runtime also prefers the
native `build`/`general`/`explore` agents before summary-style primary agents when no explicit agent
is requested. Explicit OpenCode agent requests are resolved only from the live `/agent` list; this
can include plugin agents exposed by the running server. OpenCode now supports both environment
defaults and per-request overrides for `agent`, `provider_id`, and `model_id`, with request-level
values taking precedence over `OMC_OPENCODE_AGENT`, `OMC_OPENCODE_PROVIDER`, and
`OMC_OPENCODE_MODEL`.

## MCP Surface

- `coworker_task(action, ...)`
    - preferred MCP entrypoint for send/review/diff/fork/approve/revert/status/recent_activity
    - native execution-path coverage matrix:
      [Coworker Protocol Coverage](coworker-protocol-coverage.md)
- `coworker_task(action="review", ...)`
    - OpenCode review is prompt-driven over the session message API
- `coworker_task(action="approve", ...)`
    - OpenCode permission responses normalize common aliases such as `accept/allow` and
      `deny/reject`
    - approval responses return structured metadata such as `decision`, `resolvedDecision`,
      `decisionOptions`, and `details`

Current native target:

- `opencode`

The runtime intentionally covers only the native execution-path subset required for coworker work
distribution. It does not try to expose the full OpenCode client/session administration surface.

`coworker_task(action="status")` includes:

- runtime `status`
- `sessionId`
- `activeTaskCount`
- `lastActivityAt`
- `viewerAvailable`
- `viewerAttached`
- `signalState`
- `requestedAgent`, `agent`, `agentNative`, `provider`, and `model`
- `approvalPolicy`
- pending approvals / permissions

## Feedback Model

All coworkers share:

- JSONL activity logs under `~/.claude/oh-my-claude/logs/coworker/`
- status signals under `~/.claude/oh-my-claude/run/`
- statusline infrastructure segments

Current viewer/log behavior:

- `omc m opencode log` renders aggregated output by default
- supports `--raw` for unmerged event inspection
- `omc m opencode viewer` re-attaches the OpenCode panel manually
- timed-out coworker waits now propagate to real backend interruption/abort
- coworker viewers auto-close after an idle period unless `*_KEEP_VIEWER=1`

## Design Rules

- Keep coworker tasks goal-oriented, not step-by-step
- Only assign OpenCode when the task boundary is clear
- Claude Code remains the orchestrator; coworkers do not directly schedule each other
- Keep protocol models near the runtime that uses them
- Use shared segment definitions instead of duplicated allowlists for statusline configuration
