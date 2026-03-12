# Coworker Architecture

## Overview

The active runtime is split into three layers:

1. `coworker/`
   Native external runtimes such as Codex and OpenCode
2. `mcp/`
   Tool-facing entrypoint led by `coworker_task(action, ...)`
3. `proxy/`
   Session-wide provider routing for sustained multi-turn work

## Routing Model

Use `coworker_task(action="send", ...)` for:

- self-contained delegated work
- explicit Codex/OpenCode assignment
- work that should run outside the main Claude Code turn flow

Use proxy routing for:

- sustained multi-turn work
- session-wide provider switching
- workflows that need native tool use inside the routed Claude Code session

## Runtime Layout

### Codex

- Runtime: `src/coworker/codex-runtime.ts`
- Transport: `src/coworker/codex/app-server.ts`
- Protocol models: `src/coworker/codex/protocol/`
- Viewer: auto terminal viewer backed by `omc m codex log`

Codex executes headlessly over stdio JSON-RPC against `codex app-server`, then
surfaces aggregated activity through the shared coworker viewer/log path.

### OpenCode

- Runtime: `src/coworker/opencode/runtime.ts`
- Server bootstrap: `src/coworker/opencode/server.ts`
- Viewer: auto terminal viewer backed by `opencode attach <server-url>` with
  fallback launch behavior and TUI session control

OpenCode executes through `opencode serve` and the official HTTP server API.
The viewer is optional for execution: the runtime continues through `serve +
session API` even if viewer attach fails. When the viewer is available, the
runtime now selects the active session and pushes TUI toasts so the panel
tracks the coworker task instead of only passively attaching. The runtime also
prefers the native `build`/`general`/`explore` agents before summary-style
primary agents when no explicit agent is requested. Explicit OpenCode agent
requests are resolved only from the live `/agent` list; this can include plugin
agents exposed by the running server. OpenCode now supports both environment
defaults and per-request overrides for `agent`, `provider_id`, and `model_id`,
with request-level values taking precedence over `OMC_OPENCODE_AGENT`,
`OMC_OPENCODE_PROVIDER`, and `OMC_OPENCODE_MODEL`.

## MCP Surface

- `coworker_task(action, ...)`
  - preferred MCP entrypoint for send/review/diff/fork/approve/revert/status/recent_activity
  - native execution-path coverage matrix: [Coworker Protocol Coverage](/Users/axiba/Downloads/Gits/oh-my-claude/docs/guides/coworker-protocol-coverage.md)
- `coworker_task(action="review", ...)`
  - Codex supports native review targets (`uncommittedChanges`, `baseBranch`,
    `commit`)
  - Codex also supports scoped review via `paths`, which routes through a
    diff-backed review prompt instead of a full-tree review
  - review timeouts now use a diff-size heuristic so large reviews do not
    inherit unrealistically small wait budgets
  - timeout errors still return `meta.review_mode` and
    `meta.recommended_timeout_ms` so callers can tell whether the request ran
    as `native` or `scoped-diff`
  - scoped Codex reviews currently stay inline; `delivery: "detached"` remains
    a native full-tree review feature
- `coworker_task(action="approve", ...)`
  - Codex supports alias decisions plus exec-policy / network-policy amendment payloads
  - OpenCode permission responses normalize common aliases such as `accept/allow` and `deny/reject`
  - approval responses return structured metadata such as `decision`,
    `resolvedDecision`, `decisionOptions`, and `details`
  - Codex can be switched out of the default `never` mode with
    `approval_policy` or `OMC_CODEX_APPROVAL_POLICY`; `on-request` still only
    asks when Codex decides the action needs approval

Current native targets:

- `codex`
- `opencode`

The runtime intentionally covers only the native execution-path subset required
for coworker work distribution. It does not try to expose the full Codex or
OpenCode client/session administration surface.

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

- `omc m codex log` renders aggregated output by default
- `omc m opencode log` renders aggregated output by default
- both support `--raw` for unmerged event inspection
- `omc m opencode viewer` re-attaches the OpenCode panel manually
- timed-out coworker waits now propagate to real backend interruption/abort
- coworker viewers auto-close after an idle period unless `*_KEEP_VIEWER=1`

## Design Rules

- Keep coworker tasks goal-oriented, not step-by-step
- Only assign Codex/OpenCode when the task boundary is clear
- Claude Code remains the orchestrator; coworkers do not directly schedule each
  other
- Keep protocol models near the runtime that uses them
- Use shared segment definitions instead of duplicated allowlists for statusline
  configuration
