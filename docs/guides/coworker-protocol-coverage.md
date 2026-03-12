# Coworker Protocol Coverage

Execution-path native protocol coverage for the current coworker runtime.

Status values:

- `Implemented`
- `Partial`
- `Not implemented`
- `Native but out of scope`

## Codex

| Capability | Native surface | Status | Notes |
| --- | --- | --- | --- |
| Send task | `thread/start`, `turn/start`, `turn/interrupt` | Implemented | Exposed through `coworker_task(action="send")` |
| Review | `review/start` | Implemented | Native review plus scoped-diff wrapper for `paths` |
| Diff | `turn/diff/updated`, `gitDiffToRemote` | Implemented | Uses last turn diff when available, otherwise `gitDiffToRemote` |
| Fork | `thread/fork` | Implemented | Exposed through `coworker_task(action="fork")` |
| Revert / rollback | `thread/rollback` | Implemented | Exposed as `coworker_task(action="revert")` |
| Archive / unarchive | `thread/archive`, `thread/unarchive` | Native but out of scope | Supported internally, not exposed on the coworker task surface this round |
| Approval request | command / file / user-input / legacy approval RPCs | Implemented | Surfaced as structured `pendingApprovals` |
| Approval response | native approval payloads | Implemented | Only native decision set is accepted |
| Runtime status | daemon status + status signal | Implemented | Includes viewer and approval policy |
| Event streaming | text / plan / reasoning / tool / diff / completion / failure | Implemented | Mapped to coworker activity types |
| Thread read/list/resume/admin | broader thread/session management RPCs | Native but out of scope | Not part of the coworker execution subset |

## OpenCode

| Capability | Native surface | Status | Notes |
| --- | --- | --- | --- |
| Send task | `POST /session/:id/message` | Implemented | Primary task path |
| Review | structured review prompt over session message | Partial | Execution path is native, but review remains prompt-driven rather than a dedicated native review RPC |
| Diff | `GET /session/:id/diff` | Implemented | Exposed through `coworker_task(action="diff")` |
| Fork | `POST /session/:id/fork` | Implemented | Exposed through `coworker_task(action="fork")` |
| Revert / unrevert | `POST /session/:id/revert`, `POST /session/:id/unrevert` | Implemented | Exposed through `coworker_task(action="revert")` |
| Abort | `POST /session/:id/abort` | Implemented | Used for timeout/cancel |
| Permission request | global permission events | Implemented | Surfaced as structured `pendingApprovals` when upstream emits native permission events |
| Permission response | `POST /session/:id/permissions/:permissionId` | Implemented | Exposed through `coworker_task(action="approve")` |
| Runtime status | server status + coworker state | Implemented | Includes session, requestedAgent, agent, agentNative, provider, model, and approval policy placeholder |
| Event streaming | `/global/event` + message part mapping | Implemented | Normalized into coworker activity types |
| Session read/list/share/summarize | broader server/SDK surface | Native but out of scope | Not part of the execution subset |

## Scope Boundary

This runtime intentionally covers only the native execution-path subset needed by coworker:

- `send`
- `review`
- `diff`
- `fork`
- `revert`
- `approve`
- `status`
- `recentActivity`

It does **not** try to expose the full Codex or OpenCode client surface.
