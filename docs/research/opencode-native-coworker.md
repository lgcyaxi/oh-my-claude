# OpenCode Native Coworker Feasibility

## Decision

Decision: `yes`

Recommendation: promote OpenCode to a native coworker runtime using its official server/SDK surface,
then remove the legacy pane/storage adapter.

## Why

Codex previously had a native app-service transport (since removed in favor of `codex-plugin-cc`):

- Headless JSON-RPC over stdio
- Stable session bootstrap
- Structured completion detection
- Built-in observability hooks

OpenCode currently does not offer the same shape in this codebase:

- The old repository path was pane-driven through a now-removed `OpenCodeDaemon` implementation
  under the former `src/workers` tree
- Input is injected through terminal or IPC fallback
- Output is inferred from local storage polling
- Session state is derived from project/storage conventions rather than an explicit RPC protocol

However, the upstream product now exposes an official headless server and SDK. That means the
repository implementation is outdated, not that native coworker support is impossible.

## Comparison

| Dimension             | Codex App Service (historical)               | OpenCode current repo state                 | Result                          |
| --------------------- | -------------------------------------------- | ------------------------------------------- | ------------------------------- |
| Startup mode          | Headless process                             | Terminal pane launch                        | Needs replacement               |
| Session persistence   | Explicit conversation/session RPC            | Derived from storage + persisted project id | Replace with native session API |
| I/O channel           | Structured JSON-RPC                          | Terminal injection + storage polling        | Replace with server/SDK calls   |
| Observability         | Activity log + status signal                 | Indirect via storage updates                | Add native event handling       |
| Sandbox / permissions | Explicit per-turn config                     | Implicit through CLI session                | Normalize in coworker adapter   |
| Failure recovery      | Process + transport errors surfaced directly | Mixed terminal/storage failure modes        | Simplify with native transport  |
| Cross-platform        | Headless path is portable                    | Depends on pane backend behavior            | Improve after migration         |

## Migration Direction

Proceed by replacing the legacy adapter with a native coworker adapter that uses:

- official OpenCode server session APIs
- official SDK client APIs
- event streaming / structured output instead of storage polling

## Implementation Guidance For Now

- Create `src/coworker/opencode/` instead of extending a legacy execution layer
- Remove terminal-pane injection and `OpenCodeStorageAdapter` from the primary runtime path
- Route OpenCode through `coworker_task(action="send", target="opencode", ...)`
- After the native adapter lands, remove legacy OpenCode-specific compatibility code entirely
