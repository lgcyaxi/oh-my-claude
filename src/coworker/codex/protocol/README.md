# Codex Protocol Coverage

This directory contains the generated Codex app-server protocol model restored from the previous repository layout.

## Currently used by the runtime

- `InitializeParams`
- `InitializeResponse`
- `GetAuthStatusResponse`
- `v2.ThreadStartParams`
- `v2.ThreadStartResponse`
- `v2.TurnStartParams`
- `v2.TurnStartResponse`
- `v2.ReviewStartParams`
- `v2.ReviewStartResponse`
- `v2.ThreadForkParams`
- `v2.ThreadForkResponse`
- `v2.ThreadRollbackParams`
- `v2.ThreadRollbackResponse`
- `v2.ThreadArchiveParams`
- `v2.ThreadArchiveResponse`
- `v2.ThreadUnarchiveParams`
- `v2.ThreadUnarchiveResponse`
- `GitDiffToRemoteResponse`
- `v2.AgentMessageDeltaNotification`
- `v2.PlanDeltaNotification`
- `v2.ReasoningTextDeltaNotification`
- `v2.CommandExecutionStatusNotification`
- `v2.CommandExecutionOutputDeltaNotification`
- `v2.FileChangeStatusNotification`
- `v2.FileChangeOutputDeltaNotification`
- `v2.McpToolCallProgressNotification`
- `v2.ItemCompletedNotification`
- `v2.TurnCompletedNotification`
- `v2.ErrorNotification`
- command/file/user-input approval request payloads
- approval response payloads

The active runtime paths that use this subset are:

- `src/coworker/codex/app-server.ts`
- `src/coworker/codex/conversation.ts`
- `src/coworker/codex/app-server-ops.ts`
- `src/coworker/codex/runtime/actions.ts`

## Not yet wired into runtime behavior

- thread list/read/resume management APIs
- config read/write and model/profile management
- realtime APIs
- MCP startup / tool lifecycle event families
- collaboration event families
- most of the broader v2 protocol surface outside coworker execution paths

These files are kept so the runtime can grow into the native protocol without re-deriving field shapes from scratch.
