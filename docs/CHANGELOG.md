# Changelog

All notable changes to oh-my-claude are documented here.

## [2.2.6](changelog/v2.2.6.md) - 2026-04-02

### Improvements

- **MiniMax M2.7 Default** — Default model updated from M2.5 to M2.7 across all providers and agents.

### Fixes

- **Thinking Signature Error Recovery** — Proxy passthrough auto-retries with thinking blocks stripped when Anthropic rejects invalid signatures.

## [2.2.5](changelog/v2.2.5.md) - 2026-04-01

### Fixes

- **Dashboard Revert to Claude** — Fixed revert not working from dashboard by forwarding session ID to proxy instances (menubar was unaffected).
- **Session-Centric Switch View** — Refactored dashboard switch page from port/instance-centric to per-session view with visible session IDs.

## [2.2.4](changelog/v2.2.4.md) - 2026-04-01

### Fixes

- **Dashboard OMC Mem Duplicate Entries** — Fixed duplicate project memory entries caused by multiple Claude project folders resolving to the same cwd. Three-layer dedup fix restores correct per-project memory lists and reliable click behavior.
- **Stale Update Banner** — Fixed update notification persisting after `omc update --beta`. Cache now cleared on update and re-validated on display.
- **Memory Operations Timeout** — Increased from 60s to 180s, fixing "signal is aborted" errors during daily consolidation.
- **Memory Operations Global Scope** — Added "Global only" option to scope dropdown for targeting global memories independently.
- **Session Bulk AI Rename** — "Rename N unnamed" button on Sessions page for batch AI-renaming.
- **Old Session Cleanup** — "Clean N old" button to delete sessions older than 15 days.

## [2.2.3](changelog/v2.2.3.md) - 2026-03-31

### Highlights

- **Official Codex Plugin** — Replaced ~500+ files of custom Codex ACP with the official `openai/codex-plugin-cc` plugin. Auto-installed during `omc install` with review gate enabled by default.
- **Dashboard Provider Usage** — Real-time balance/quota display for all configured providers (DeepSeek, ZhiPu, MiniMax, Kimi, Aliyun) with color-coded status cards.
- **Statusline Auth Visibility** — Provider usage segments now show `!auth` when credentials are expired instead of silently hiding. Loads `~/.zshrc.api` for env var inheritance.
- **MiniMax M2.7 & GLM-5.1** — New model support across all providers.
- **Sisyphus Codex Audit** — Mandatory `/codex:rescue` audit before reporting completion when code was changed.
- **11 Bug Fixes** — EMFILE on Windows, dashboard type filters, doctor embeddings, menubar path, Aliyun auth detection, Kimi API-key fallback, CLI version drift, installer semver sort.

## [2.2.2](changelog/v2.2.2.md) - 2026-03-18

### Features

- **MiniMax M2.7 Model Support** — Added MiniMax-M2.7 across all providers (MiniMax, MiniMax CN, Aliyun). Agent defaults updated to use M2.7 for documentation and writing tasks.

### Bug Fixes

- **Menubar Search Path Order** — Fixed `omc menubar` failing with "missing tauri.conf.json". Installed version now checked first before source directories.
- **Dashboard Project Discovery** — Complete rewrite of `cwd` resolution: JSONL search now checks root-level, UUID subdirectories, and `subagents/` folders. Removed broken folder name decoding that failed on dashed project names.
- **Global Memory Delete 404** — Path resolution now checks both `notes/` and `sessions/` subdirectories for global memories
- **Dashboard AI Operations Timeout** — Increased from 60s to 180s to handle large session memories without aborting

## [2.2.1](changelog/v2.2.1.md) - 2026-03-16

### Highlights

- **Web Dashboard** — Full-featured React 19 + Vite + Tailwind SPA at `localhost:18920/web/` with 9 pages: sessions, memory, preferences, models, providers, switch, settings — plus AI-powered tools and light/dark theme
- **OpenRouter Provider** — Free models (Hunter Alpha, Nemotron 3 Super) via native Anthropic-compatible API with sanitization
- **Ollama Native Thinking** — Extended thinking protocol support with proper thinking block handling and dashboard forwarding
- **Auto-Update Check** — Non-blocking CLI update notifications with 24-hour cache
- **Code Splitting** — Modularized proxy control modules (sessions → 6 modules, memory → 8 modules)
- **12 Bug Fixes** — Dashboard project discovery, MCP discovery on Linux, tmux detection, AI rename, dashboard favicon, menubar build, YAML parsing, statusline 1M context, OpenRouter stability, WezTerm Git Bash

## [2.2.0](changelog/v2.2.0.md) - 2026-03-12

### Highlights

- **Native Coworker Runtime** — Full native execution support for Codex and OpenCode with unified `coworker_task()` API (9 actions: send, review, diff, fork, approve, revert, cancel, status, recent_activity)
- **Cross-Platform Viewer** — Unified tmux/WezTerm/Terminal.app viewer with automatic terminal detection, task cancellation, TUI toasts, and auto-close
- **Scoped Code Review** — Focused git diff reviews with `paths` parameter and dynamic timeout estimation
- **OpenCode Plugin Agents** — Fuzzy matching against live `/agent` list including plugin agents exposed by the server
- **Codex Approval Policies** — Native support for `never`, `on-request`, `on-failure`, `untrusted`, `strict`, `manual`, `full-auto` policies
- **Windows WezTerm Support** — Complete Windows integration with coordinator script pattern, Git Bash wrapping, and shell-aware command resolution
- **Deep Modularization** — 4 waves of coworker refactoring extracting focused modules (~3,500 lines reorganized)
- **Proxy Passthrough Simplification** — Streamlined routing logic (~150 lines removed)

## [2.1.3-beta.75](changelog/v2.1.3-beta.md) - 2026-03-12

### Highlights

- **Windows WezTerm Coworker Viewer Fix** — Fixed Codex viewer exit code 1 and OpenCode TUI blank session. Uses native Git Bash (`resolveNativeBash()`) for proper terminal handling and exit codes
- **Codex Viewer Log Rendering Fix** — Fixed `tool_activity` entries showing raw code lines; now collapses to `TOOL: command output ×N`

## [2.1.3-beta.74](changelog/v2.1.x.md) - 2026-03-11

### Highlights

- **Inside-WezTerm Debug Pane Fix** — Fixed `omc cc -debug` when running inside an existing WezTerm session

## [2.1.3-beta.73](changelog/v2.1.3-beta.md) - 2026-03-11

### Highlights

- **Windows Debug Mode WezTerm Fix** — Fixed `omc cc -debug` WezTerm launch on Windows with a coordinator script approach. The coordinator runs inside WezTerm to handle [CC 65% | Proxy 35%] pane splitting with guaranteed mux access. Removed complex external mux polling that failed due to `--always-new-process` isolation (~120 lines removed)

## [2.1.3-beta.72](changelog/v2.1.3-beta.md) - 2026-03-11

### Highlights

- **Bun Path Resolution Refactoring** — Extracted duplicated Bun path resolution logic into shared `src/cli/utils/bun.ts` utility (~90 lines removed across 4 files). Centralized Windows path handling, Chocolatey shim filtering, and Unix-to-Windows path conversion
- **Windows CC Session Test Coverage** — New comprehensive test suite for Windows session launch (`cc-session-win.test.ts`, `cc-terminals-win.test.ts`, `terminal-detect.test.ts`) covering debug proxy scenarios, WezTerm pane management, and bundled window fallback

## [2.1.3-beta.71](changelog/v2.1.3-beta.md) - 2026-03-11

### Highlights

- **OpenCode Plugin Agent Support** — Agent selection now resolves from the live `/agent` list, supporting both native agents (`build`, `general`, `explore`) and plugin agents exposed by the server. Includes fuzzy matching with ambiguity detection
- **Enhanced Execution Metadata** — New `requestedAgent` and `agentNative` fields track original agent requests and whether resolved agents are native or plugin
- **Viewer Command Resolution Fix** — Shell-aware token replacement for `oh-my-claude`/`omc` commands now properly handles quoted strings and shell boundaries

## [2.1.3-beta.70](changelog/v2.1.3-beta.md) - 2026-03-11

### Highlights

- **Code Style Standardization** — 48 coworker and MCP modules converted to consistent tab-based indentation and single quotes for string literals. No functional changes

## [2.1.3-beta.69](changelog/v2.1.3-beta.md) - 2026-03-11

### Highlights

- **Execution Metadata Standardization** — All Codex and OpenCode action results now include `meta.operation` field for consistent observability: `send`, `review`, `diff`, `fork`, `approve`, `rollback`, `revert`, `unrevert`
- **Protocol Coverage Documentation** — New `coworker-protocol-coverage.md` guide documents native execution-path coverage matrix for Codex and OpenCode runtimes
- **OpenCode Viewer Simplification** — Removed session-specific attach logic in favor of simpler `opencode attach` or `opencode` fallback

## [2.1.3-beta.68](changelog/v2.1.3-beta.md) - 2026-03-11

### Highlights

- **App-Server Modularization** — Fourth wave refactoring extracting Codex app-server internals and OpenCode task actions: `app-server/` directory with lifecycle, transport, and server request modules; `task-actions/` directory with stream, review, and events modules. ~596 lines removed from monolithic files, ~640 lines added in focused modules

## [2.1.3-beta.67](changelog/v2.1.3-beta.md) - 2026-03-11

### Highlights

- **Final Coworker Modularization** — Third wave refactoring completing the coworker codebase reorganization: Codex runtime actions (`codex/runtime/` with actions, status, types), daemon base internals (`base/` with lifecycle, queue, types), MCP task handlers (`task/` with handlers and session-handlers), and scoped review modules (`scoped-review/` with git and uncommitted). ~1,286 lines removed from monolithic files, ~1,460 lines added in focused modules

## [2.1.3-beta.66](changelog/v2.1.3-beta.md) - 2026-03-10

### Highlights

- **Proxy Passthrough Simplification** — Removed all request body modification from passthrough handler (~35 lines). Requests now forward transparently to Anthropic API without thinking block stripping. Eliminates potential "Invalid signature in thinking block" errors; Claude Code handles thinking format natively

## [2.1.3-beta.65](changelog/v2.1.3-beta.md) - 2026-03-10

### Highlights

- **Deep Coworker Modularization** — Second wave refactoring extracting remaining monolithic code: Codex app-server operations (`app-server-ops.ts`), conversation event handling (`conversation/` directory with `types.ts`, `approvals.ts`, `notifications.ts`, `task-events.ts`, `tool-events.ts`), OpenCode runtime actions (`runtime/` directory with `types.ts`, `actions.ts`, `session-actions.ts`, `task-actions.ts`), and scoped review diff handling (`review-scoped-diff.ts`). ~1,900 lines removed from monolithic files, ~1,600 lines added in focused modules

## [2.1.3-beta.64](changelog/v2.1.3-beta.md) - 2026-03-10

### Highlights

- **Coworker Codebase Modularization** — Major refactoring extracting focused modules from monolithic files: Codex approval handling (`approval-policy.ts`, `approval-response.ts`, `pending-approvals.ts`), OpenCode runtime (`types.ts`, `events.ts`, `execution.ts`, `permissions.ts`), and MCP coworker tools (`actions.ts`, `review-helpers.ts`, `tool-utils.ts`). ~2,700 lines removed from monolithic files, ~2,300 lines added in focused modules
- **Documentation Clarifications** — Approval policy documentation updated to explain that `on-request` is protocol-native behavior (Codex decides when approval is needed), not an always-ask mode. Removed references to deprecated compatibility aliases

## [2.1.3-beta.63](changelog/v2.1.3-beta.md) - 2026-03-10

### Highlights

- **Codex Approval Policy Configuration** — New `approval_policy` parameter on `coworker_task(action="send"|"review", ...)` supports `never` (default), `on-request`, `on-failure`, `untrusted`, `strict`, `manual`, `full-auto`. Also configurable via `OMC_CODEX_APPROVAL_POLICY` environment variable
- **Runtime Policy Switching** — Changing approval policy auto-restarts the Codex daemon with the new policy; policy aliases normalize consistently (`strict`/`manual`/`prompt` → `on-request`)
- **Approval Policy Observability** — `coworker_task(action="status")` now returns `approvalPolicy` field showing the active policy
- **Documentation Updates** — README, zh-CN docs, command docs, and architecture guides updated with approval policy usage and troubleshooting guidance

## [2.1.3-beta.62](changelog/v2.1.3-beta.md) - 2026-03-10

### Highlights

- **Approval Decision Validation** — Codex and OpenCode now validate approval decisions against allowed options before submitting, preventing invalid payloads with clear error messages
- **Richer Approval Metadata** — Approval responses now include `summary`, `kind`, `status`, and `lastEventType` fields for better observability
- **Documentation Consistency** — All command docs now consistently reference the unified `coworker_task(action=...)` API
- **Test Coverage** — Added tests for approval validation and scoped review timeout recommendations

## [2.1.3-beta.61](changelog/v2.1.3-beta.md) - 2026-03-10

### Highlights

- **Scoped Review Timeout Heuristics** — New prompt-size-aware timeout estimation based on files, diff lines, binary sections, and character count. Minimum timeout increased to 240s, maximum to 720s for scoped reviews
- **Timeout Error Metadata** — Review timeout errors now include `recommended_timeout_ms` and `review_mode` fields to guide retry decisions
- **Expanded Test Cleanup** — Installer now cleans up additional test session prefixes (`ses_env_`, `ses_approve_`, `ses_perm_`)
- **Session Recovery Docs** — Added guidance for recovering from long-running timeouts by opening fresh Claude Code sessions

## [2.1.3-beta.60](changelog/v2.1.3-beta.md) - 2026-03-10

### Highlights

- **Initial Commit Diff Fixes** — Staged and unstaged changes now preserved as separate sections, binary file detection with proper markers, symbolic link support (mode 120000), executable mode preservation (100755)
- **Test Artifact Cleanup** — Installer now removes stale test sessions from logs and status files
- **Approval Payload Validation** — Exec-policy and network-policy amendment decisions now validate required fields
- **Documentation Consistency** — All docs now use unified `coworker_task(action="send", ...)` syntax

## [2.1.3-beta.59](changelog/v2.1.x.md) - 2026-03-10

### Highlights

- **Initial Commit Diff Fixes** — Scoped reviews on initial commit repos now properly handle empty files, preserve executable mode (100755), and support symbolic links (120000)
- **Staged-then-Deleted Handling** — Files staged then deleted are now correctly omitted from scoped review diffs
- **OpenCode Review Events** — Review progress and completion events are now properly mapped to `tool_activity` and `plan_update` event types
- **Approval Metadata** — Added `decision` field showing the original user choice alongside `resolvedDecision`

## [2.1.3-beta.58](changelog/v2.1.x.md) - 2026-03-10

### Highlights

- **Scoped Uncommitted Diff** — Codex scoped reviews now support `review_target: "uncommittedChanges"` with `paths` array, combining tracked diffs against HEAD with untracked file diffs
- **Richer Approval Metadata** — Added `resolvedDecision` field showing the actual payload sent; explicit decline now wins over amendment payloads; OpenCode permissions auto-clear on resolution events
- **Documentation Consistency** — All docs now prefer `coworker_task(action="send", ...)` with individual tools documented as convenience aliases
- **Bug Fixes** — Fixed scoped reviews on initial commit (no HEAD) repos; added `OMC_COWORKER_STATE_DIR` env var for configurable state directory

## [2.1.3-beta.57](changelog/v2.1.x.md) - 2026-03-10

### Highlights

- **Scoped Codex Reviews** — `coworker_review` now supports scoped-diff reviews when `paths` is provided, building a focused git diff prompt instead of reviewing the full working tree (which often times out)
- **Timeout Recommendations** — New `recommendCodexReviewTimeout()` calculates timeout based on diff size (base 60s + 10s per 100 lines, clamped to 30-300s), returned as `meta.recommended_timeout_ms`
- **Unified `coworker_task` MCP Tool** — Single-entrypoint tool that routes by `action` parameter (send|review|diff|fork|approve|revert|status|recent_activity), replacing individual tools with a unified Zod schema
- **Rich Approval Metadata** — Pending approvals now include `decisionOptions` (available decisions), `questions` (structured Q&A), and `details` (command, cwd, reason, permissions). Includes sessionId/taskId on each entry
- **Approval Payload Builders** — Refactored approval response construction with `buildCodexCommandApprovalPayload()`, `buildCodexLegacyApprovalPayload()`, and decline detection helpers
- **Viewer Exit Improvements** — Dual-threshold exit detection (90s staleness OR 25s in idle/complete/error), 1s polling for faster post-completion exit, proper cleanup of watchers
- **Settings Merger Fix** — `cleanupLegacyMcpName()` now recursively visits nested objects to handle project-scoped settings with nested `mcpServers`
- **Installer Hint** — Shows "Restart Claude Code to reload MCP server changes" after MCP install/update

## [2.1.3-beta.56](changelog/v2.1.x.md) - 2026-03-10

### Highlights

- **Coworker Feature Extensions** — 5 new MCP tools: `coworker_review` (code reviews), `coworker_diff` (session diffs), `coworker_fork` (fork sessions/threads), `coworker_approve` (respond to permission requests), `coworker_revert` (revert state)
- **Codex Approval System** — Full approval handling with `CodexPendingApproval` type, `handleServerRequest()` for approval prompts, decision mapping for commands/files/legacy
- **Codex Thread Operations** — `forkThread()`, `rollbackThread()`, `getDiff()`, `runReview()` for native code reviews
- **OpenCode Extensions** — Review prompts, session diff, session forking with message_id, permission approval/rejection, revert/unrevert, TUI toasts, agent/provider/model override
- **Type System Expansion** — New request/result interfaces, `CoworkerStatus` extended with pending approvals, `CoworkerRuntime` interface expanded with optional operations

## [2.1.3-beta.55](changelog/v2.1.x.md) - 2026-03-10

### Highlights

- **Codex Task Cancellation** — Real `turn/interrupt` JSON-RPC call on task cancel, timeout handler now interrupts timed-out tasks on the Codex side, `settled` guard prevents double-resolution races
- **Viewer Auto-Close** — Viewers auto-close after 20s idle, `ensureViewer()` respawns detached viewers, `CODEX_KEEP_VIEWER=1` / `OPENCODE_KEEP_VIEWER=1` env vars to disable
- **OpenCode TUI Control** — Full TUI integration: session selection, toast notifications (start/complete/error/interrupt), prompt commands, interrupt on cancel
- **OpenCode Timeout Handling** — Separate timeout controller with normalized error messages, `isAbortLikeError()` utility for clean abort handling
- **OpenCode Viewer Session** — Viewer now attaches to specific session ID, not just server

## [2.1.3-beta.54](changelog/v2.1.x.md) - 2026-03-10

### Highlights

- **Unified Coworker Viewer** — Shared viewer spawning across Codex and OpenCode with cross-platform terminal support (tmux, WezTerm, macOS Terminal, xterm). `ViewerHandle` now tracks `attached` state
- **Activity Log Improvements** — Entry merging for adjacent events with same session/task/model, live tail debouncing at 450ms
- **Statusline DRY Refactor** — Single source of truth for segment IDs eliminates ~30 lines of duplicate code

## [2.1.3-beta.53](changelog/v2.1.3-beta.md) - 2026-03-09

### Highlights

- **Coworker Observability** — Unified JSONL activity logging and status signal files for Codex and OpenCode runtimes. New `coworker_recent_activity` MCP tool for reading activity logs
- **Streaming Task Execution** — `CoworkerRuntime` interface expanded with `streamTask()`, `startSession()`, `cancelTask()`. Both Codex and OpenCode support streaming with event callbacks
- **OpenCode Runtime Upgrade** — Full reimplementation with SSE event subscription, task lifecycle logging, and cancel support
- **OpenCode Statusline** — Dedicated segment replacing generic `coworker`, showing OpenCode state (thinking/streaming/complete/error)

## [2.1.3-beta.52](changelog/v2.1.3-beta.md) - 2026-03-09

### Highlights

- **Provider Agents** — 6 new generic agents (`@kimi`, `@mm-cn`, `@deepseek`, `@deepseek-r`, `@qwen`, `@zhipu`) for direct provider access without role specialization. New `agentType` field distinguishes role vs provider agents
- **Sisyphus Delegation Overhaul** — Coworker-first principle with 4-tier priority (coworker → subagent → switch_model → direct). Token-saving routing map for all subagents
- **Coworker Statusline** — New segment showing Codex daemon status in wrapped mode with state icons
- **Dynamic Brand Prefix** — Statusline shows `omc⇄` in proxy mode, distinguishing wrapped from direct sessions

## [2.1.3-beta.51](changelog/v2.1.3-beta.md) - 2026-03-09

### Highlights

- **Proxy Sanitizer Simplification** — Removed adaptive thinking injection from passthrough sanitizer (~52 lines). Claude Code handles thinking format natively

## [2.1.3-beta.50](changelog/v2.1.3-beta.md) - 2026-03-09

### Highlights

- **Bridge Removal Completion** — Deleted entire `src/shared/config/bridge.ts` (~125 lines), removed bridge config from schema and loader, added bridge.json cleanup in installer
- **Hook Cleanup** — Removed ~190 lines of legacy bridge bus polling code from `context-memory.ts` and `memory-awareness.ts`
- **Statusline Cleanup** — Removed bridge worker-specific proxy display logic (~18 lines), updated all "bridge" comments to neutral terms
- **Coworker Hardening** — Renamed doctor types (BridgeDoctorStatus → CoworkerRouteStatus), added OpenCode agent discovery with `/agent` endpoint caching

## [2.1.3-beta.49](changelog/v2.1.3-beta.md) - 2026-03-09

### Highlights

- **Native Coworker Architecture** — Complete replacement of the legacy bridge system (~18,000 lines removed). New `src/coworker/` module with `CodexCoworkerRuntime` and `OpenCodeCoworkerRuntime` for direct proc-based task execution
- **New MCP Tools** — `coworker_send` and `coworker_status` replace all 7 bridge MCP tools (`bridge_send`, `bridge_status`, `bridge_dispatch`, `bridge_event`, `bridge_wait`, `bridge_up`, `bridge_down`)
- **Codex Protocol v2** — Thread-based API with streaming notifications, replacing v1 conversation model
- **OpenCode Native Coworker** — `opencode serve` runtime for headless OpenCode task delegation

## [2.1.3-beta.48](changelog/v2.1.3-beta.md) - 2026-03-09

### Highlights

- **CC Session Platform Split** — Refactored monolithic CC session modules into platform-specific `*-unix.ts` / `*-win.ts` files with thin dispatchers, improving maintainability and enabling independent platform evolution

## [2.1.3-beta.47](changelog/v2.1.3-beta.md) - 2026-03-09

### Highlights

- **CC Debug Mode** — Native Terminal.app proxy fallback on macOS + tmux debug window auto-cleanup
- **Proxy Sanitizer Fix** — Thinking injection only triggers when blocks were actually stripped

## [2.1.3-beta.46](changelog/v2.1.3-beta.md) - 2026-03-08

### Highlights

- **CC Session Proxy Fallback** — Graceful fallback to hidden proxy when visible pane spawn fails
- **Proxy Log Directory** — Logs now organized in `~/.claude/oh-my-claude/logs/` subdirectory
- **Code Cleanup** — Removed debug logging, formatting standardization across session modules

## [2.1.3-beta.45](changelog/v2.1.3-beta.md) - 2026-03-08

### Highlights

- **CC Session UX** — Fixed tmux exit message escaping and debug mode detection when already inside tmux
- **Menubar Memory Model** — Per-session memory model picker in tray menu
- **Auto-Routing Enhancements** — Expanded session commands and model-driven routing

## [2.1.3-beta.43](changelog/v2.1.3-beta.md) - 2026-03-05

### Highlights

- **Route Directive Auto-Routing** — Agent generator embeds `[omc-route:provider/model]` in agent prompt text. Proxy Priority 1 extracts directive from system prompt and routes to correct provider. Solves the problem of Claude Code not passing YAML `model` field to API body
- **Agent Architecture Overhaul** — All bridge agents converted to native with route directives: analyst→aliyun/qwen3.5-plus, librarian→zhipu/glm-5, document-writer→minimax/MiniMax-M2.5, navigator/hephaestus→kimi/kimi-for-coding, oracle→anthropic passthrough. `bridgeAgents` deprecated; all 11 agents unified in `taskAgents`/`nativeAgents`
- **5-Priority Proxy Routing** — directive(1) → model-driven(2) → session(3) → global(4) → passthrough(5)
- **Proxy Domain Restructure** — `src/proxy/` reorganized into `handlers/`, `routing/`, `state/`, `streaming/` subdirectories
- **MCP Register Pattern** — Tool definitions use inline `register()` calls instead of centralized schemas
- **Memory Categories** — Structured category system with menubar picker

## [2.1.3-beta.39](changelog/v2.1.3-beta.md) - 2026-03-04

### Highlights

- **Bridge Stability** — Fixed pane visibility (right-split in current window), provider pre-switch flag ordering, anti-recursion guards, and statusline segment hiding inside bridge workers
- **Installer Cleanup** — Legacy MCP name "oh-my-claude-background" → "oh-my-claude" in both ~/.claude/settings.json and ~/.claude.json
- **Build Fix** — MCP server build output renamed index.js → server.js to match installed path
- **Proxy Pre-Switch** — `-p` flag now writes session state so menubar shows correct model
- **Config Correction** — `cc:kimi` switchProvider corrected from "openrouter" to "kimi"
- **Command Refactor** — Slash commands updated to reference mcp__oh-my-claude__ (not background)

## [2.1.3-beta.21](changelog/v2.1.3-beta.21.md) - 2026-03-04

### Highlights

- **Bridge Statusline Visual Upgrade** - Mode labels now render without brackets and use icons (`⚡ ULW`, `◈ BRIDGE`, `⚡◈ ULW+BRIDGE`), with role-aware bridge worker indicators and thinking prefixes
- **Bridge Reliability + Readiness** - Fixed bridge state path to `~/.claude/oh-my-claude/bridge-state.json`, added PID stale-pruning, and introduced `bridge_ready` signaling for CC worker startup synchronization
- **Codex Flow + Observability Improvements** - Completed codex idle/thinking/complete animation cycle, upgraded codex-log formatting, rewired `/omc-codex` to `bridge_send` auto-start flow, and added structured `task_spec`/`bridge_status` MCP support

## [2.1.3-beta.4](changelog/v2.1.x.md) - 2026-03-03

### Highlights

- **Pre-configured Switch for Bridge Workers** — `oh-my-claude bridge up cc --switch mm-cn` spawns workers pre-switched to target provider, avoiding rate limits from post-spawn API calls
- **WezTerm Ctrl+W Fix** — Now closes current pane (not window/tab)
- **Windows Bridge Compatibility** — Path sanitization for `:` in directory names, cmd.exe for bridge workers, Node v12 compatibility

## [2.1.3-beta.3](changelog/v2.1.x.md) - 2026-03-03

### Highlights

- **Bridge State Race Condition Fix** — Async mutex locking prevents concurrent `bridge_up` calls from corrupting bridge state
- **Command Delegation Cascade** — `omcx-commit` and `omcx-docs` now use 3-tier cascade: bridge_send → execute_with_model → self. Workers read files autonomously
- **Sisyphus Tool Selection Rules** — New decision table: bridge_send (single+bridge), execute_with_model (single, no bridge), switch_model (sustained 3+ turns only)
- **Stronger Bridge Constraints** — memory-awareness.ts uses system-override tags, FORBIDDEN/ALLOWED tool lists, cost rationale for deterministic enforcement
- **MCP Tool Descriptions** — switch_model warns "prefer execute_with_model", execute_with_model marked as PREFERRED

## [2.1.3-beta.1](changelog/v2.1.x.md) - 2026-03-03

### Highlights

- **Proxy Response Capture (Phase 1)** — SSE streaming responses captured with text, usage tokens. `GET /response?session=ID` returns clean API output without TUI chrome pollution. Bridge workers use proxy capture first, pane polling as fallback
- **Real-Time Streaming (Phase 3)** — `GET /stream?session=ID` SSE endpoint for live text delta forwarding. Event listener registry for real-time notifications
- **Dynamic Bridge Workers (Phase 2)** — `bridge_up` / `bridge_down` MCP tools for mid-session worker management without restarting Claude Code
- **Bridge State Path Migration** — Moved from temp directory to `~/.claude/oh-my-claude/bridge-state.json`. Persistent, easy to inspect
- **Bridge Mode Token Optimization** — Full constraint block on first prompt (~150 tokens), then short reminder (~15 tokens). Saves ~135 tokens/turn
- **Bun TransformStream Bug Fix** — Manual reader-based piping avoids chained `pipeThrough()` bug in Bun 1.x

## [2.1.2-beta.8](changelog/v2.1.x.md) - 2026-03-02

### Highlights

- **Bridge Mode (`cc -bridge`)** — Auto-spawn CC workers (Kimi/MiniMax/GLM) alongside main session with task delegation enforced. Workers auto-detected from configured providers
- **Mode Statusline Segment** — Shows `[ULW]`, `[BRIDGE]`, or `[ULW+BRIDGE]` in statusline
- **ULW Mode Rewrite** — 4-phase workflow with permission gate, info gathering, execution, completion
- **Bridge Cleanup Fixes** — Workers reliably torn down on session close across all tmux/wezterm paths
- **Bridge Workers Skip Permissions** — No more permission prompts during auto-switch

## [2.1.2-beta.7](changelog/v2.1.x.md) - 2026-03-02

### Highlights

- **Kimi Sanitizer Restored** - Fixed 400 errors when switching to Kimi mid-session via `/omc-switch`. Strips thinking blocks and unsupported content types
- **Model ID Cleanup** - `GLM-5` → `glm-5` (lowercase), added `glm-4.7`, removed discontinued `glm-4v-flash`

## [2.1.2-beta.4](changelog/v2.1.x.md) - 2026-02-28

### Highlights

- **System Prompt Identity Rewriting** - External models no longer claim to be Claude. Dedicated `identity.ts` rewrites 5 identity patterns + prepends explicit identity directive
- **Per-Provider Sanitizer Architecture** - Refactored into `sanitizers/` folder. Default = no sanitization. Only DeepSeek has a registered sanitizer
- **Direct Provider Connection** - `oh-my-claude cc -p` now supports all providers: `ds`, `zp`, `zai`, `mm`, `mm-cn`, `km`, `ay`
- **Preferences Scope Breakdown** - Statusline shows `[pref:2g/1p]` with global/project counts
- **DeepSeek Quota Precision** - Balance shows 2 decimal places for amounts under ¥1000
- **Menubar No Dedup** - All configured providers shown as-is, no family dedup

## [2.1.1](changelog/v2.1.x.md) - 2026-02-25

### Highlights

- **Ollama Local Provider** - Native Anthropic-compatible Ollama support with auto-model-discovery, non-LLM filtering, no API key needed for localhost
- **Menubar Available-Only Filtering** - ModelPicker shows only configured providers via proxy `/providers` endpoint; empty states for unconfigured setups
- **ZhiPu/MiniMax CN + Global** - Both providers now have CN and global endpoint variants: `zhipu` / `zhipu-global` (Z.ai), `minimax` (global) / `minimax-cn`. Separate API keys per endpoint
- **Models Registry SSoT** - Single `models-registry.json` drives config schema, menubar, and cross-provider routing. No more duplicated agent/model definitions
- **Cross-Provider Hub Routing** - Aliyun serves GLM-5, MiniMax-M2.5, K2.5 from other providers. Agents auto-route through Aliyun when primary provider is unconfigured
- **`/model` for External Providers** - Claude Code's native `/model` command works when switched to Aliyun (or any provider). Mid-session model switching across all 8 Aliyun models
- **Runtime Menubar Models** - Menubar reads provider list from JSON at runtime instead of hardcoded Rust. No rebuild needed for model changes
- **Pre-Built Binaries** - Menubar (macOS arm64 + Windows x64) and patched WezTerm (Windows) bundled. No Rust/Tauri toolchain or WezTerm install needed
- **Hidden Proxy on Windows** - Proxy no longer flashes a console window; reliably auto-terminates when Claude Code exits (taskkill on Windows)
- **CC Inline in WezTerm** - Running `cc` inside WezTerm stays inline in your shell (bash/zsh) instead of spawning a cmd.exe tab
- **Installer Stability** - Fixed hang inside Claude Code sessions, fixed EACCES on Windows, tmux cc fix

## [2.1.0](changelog/v2.1.x.md) - 2026-02-18

### Highlights

- **Terminal Configuration** - `wezterm-config` and `tmux-config` CLI commands for optimized AI coding terminal setups. Zsh auto-detection, cross-platform clipboard, shell integration
- **WezTerm Split-Pane Bridge** - Bridge AIs use `wezterm cli split-pane` for side-by-side layout within the same tab
- **CC-to-CC Bridge** - Spawn Claude Code as bridge workers with isolated proxy sessions. Event-driven notifications, auto-close, `wait_for_tasks`
- **npm Package Optimization** - Removed Tauri source, scripts, stale chunks. Package size reduced from 15.8 MB → 6.0 MB (133 → 46 files). `prepare` → `prepack` fix

## [2.0.x](changelog/v2.0.x.md) - Beta

### Highlights

- **CC Terminal Launch** - `oh-my-claude cc` auto-detects WezTerm/tmux and launches Claude Code in a new terminal window. Current terminal returns immediately. `cc list` / `cc stop` for session management. Inline tmux wrapping on Git Bash/Unix
- **Bridge Send** - `bridge send <ai> "<message>"` sends tasks to running CLI tools (Codex, OpenCode, Gemini) via WezTerm CLI. `bridge_send` MCP tool enables Claude to delegate tasks to other AI assistants. Response polling via storage adapters for true multi-AI collaboration
- **WezTerm Backend Rewrite** - Full rewrite using `wezterm cli` APIs (spawn, send-text, kill-pane, get-text, list). Real pane IDs, text injection, output reading. TUI-aware submit (text + raw CR two-step)
- **Proxy-Aware Agent Delegation** - Agent commands (`/omc-hephaestus`, `/omc-oracle`, `/omc-librarian`, `/omc-navigator`) auto-detect proxy and use `switch_model` + Task tool for full tool access (Edit, Write, Bash). MCP fallback when proxy unavailable. Silent model switching — no user confirmation needed
- **Sisyphus Proxy-Aware Routing** - Orchestrator checks proxy availability, prefers switch+Task over MCP for all 7 agent types. `requests=-1` with auto-revert
- **Navigator Agent (`/omc-navigator`)** - Kimi K2.5 multimodal specialist with dedicated slash command. Visual-to-code, document processing, multi-step workflows. All 7 MCP agents now have slash commands
- **Sisyphus Enhanced Delegation** - Explicit worker delegation guidelines (prefer MCP agents over self-work) + smart transparent model switching (Codex for code gen, Gemini Pro for visual, etc.)
- **Conversation Context Passing** - MCP agents receive `conversation_context` from orchestrators for better task understanding
- **Gemini Pro Default** - Frontend-UI-UX upgraded from gemini-3-flash to gemini-3-pro for better quality
- **MCP Proxy Routing** - Background agents route through proxy with 4-step fallback (proxy → direct API → Claude passthrough → `[omc-fallback]`). All 7 agents work through proxy including OAuth providers (OpenAI, Gemini, Codex)
- **Session-Aware CLI** - `proxy switch`, `proxy revert`, `proxy sessions` — manage per-session switching from any terminal. Statusline shows session ID for easy identification
- **OAuth Authentication** - Full OAuth PKCE flow for Google Gemini (multi-account quota rotation), OpenAI Codex (browser + headless), and GitHub Copilot (device code). `oh-my-claude auth login <provider>` to authenticate, then use models through the proxy without API keys
- **Proxy Format Converters** - Three format converters for OAuth providers: Antigravity (Google Gemini native via Cloud Code endpoints), Responses API (OpenAI Codex), and Chat Completions (Copilot/OpenRouter). Each with bidirectional request + SSE stream conversion
- **Universal Agent Fallback** - When primary provider is not configured, agents automatically try fallback → any configured provider. No more hard failures when a single API key is missing
- **Hephaestus Agent** - Code forge specialist (Kimi/K2.5) for multi-file features, deep refactoring, and code synthesis. `/omc-hephaestus` slash command
- **New Switch Shortcuts** - `/omc-switch gm` (Gemini Flash), `gm-p` (Gemini Pro), `gpt` (GPT-5.2), `cx` (Codex), `cp` (Copilot)
- **Provider Usage Statusline** - Second-row statusline showing provider balance/quota: DeepSeek CNY balance, ZhiPu token usage %, Google Antigravity-style account status (available/total with exhaustion tracking), plus local request counts for proxy-routed providers. Unconfigured providers are hidden entirely

---

## [1.5.x](changelog/v1.5.x.md)

**Latest: v1.5.0-beta.12** (2026-02-13)

### Highlights

- **Provider Usage Statusline** - Second-row statusline showing provider balance/quota: DeepSeek CNY balance, ZhiPu token usage %, Kimi/MiniMax local request counts. Per-provider color coding with 60s cache
- **Sisyphus Orchestration Routing** - Decision framework that routes tasks to `/omc-team`, `/omc-plan`, `/omc-ulw`, `/omc-switch` based on trigger patterns instead of handling everything directly
- **Per-Session Proxy Isolation** - Each `oh-my-claude cc` instance gets a unique session, enabling independent model switching across multiple Claude Code instances
- **Route Directives for Teams** - `[omc-route:provider/model]` in agent system prompts auto-routes to providers without `switch_model` — zero state side effects
- **4-Priority Routing** - Proxy now routes: directive → session → global → passthrough (was 2-priority)
- **Proxy SSE Timeout Fix** - `idleTimeout: 255` prevents Bun.serve premature disconnects during long streaming responses
- **Proxy 3-Phase Thinking Sanitization** - Full-compat providers (ZhiPu, MiniMax, Kimi) now preserve `thinking` config for GLM-5/M2.5 thinking support
- **Proxy Log Noise Reduction** - `/v1/messages/count_tokens` suppressed unless `OMC_PROXY_DEBUG=1`
- **Memory FTS5 OR Fix** - Multi-token queries now use OR instead of implicit AND, fixing 0-result searches
- **Memory Tag Augmentation** - Tags now included in FTS5/hybrid queries (were previously ignored)
- **`cc` Argument Passthrough** - `oh-my-claude cc -- --resume` now works correctly
- **Team Template Installation** - Installer copies team templates to `~/.claude/oh-my-claude/teams/`
- **`cc` Command** - One-step launch: `oh-my-claude cc` auto-starts proxy + launches Claude Code. `cc -p ds` for direct provider connection (DeepSeek, ZhiPu, MiniMax, Kimi, OpenRouter)
- **CLI Modular Refactor** - 3230-line monolithic CLI split into 12 per-command modules with shared utilities
- **Memory Timeline (Auto-Context)** - Auto-maintained `TIMELINE.md` injected into agent context every prompt for cross-session awareness without manual `recall()`
- **Kimi Provider** - Built-in proxy support for Kimi (api.kimi.com/coding) with `/omc-switch km` shortcut
- **Proxy Thinking Block Signature Fix** - Fixed "Invalid signature in thinking block" 400 error after proxy restart by always stripping thinking blocks from passthrough requests
- **Summary Auto-Delete + Keyword Tags** - `summarize_memories` now deletes originals by default and extracts all useful keywords as tags for retrieval
- **Command Namespace Reorganization** - Memory commands grouped under `/omc-mem-*` (`compact`, `clear`, `summary`), Ultrawork mode renamed to `/omc-ulw`
- **`/omc-ulw` Auto-Accept** - Ultrawork mode prompts user to enable auto-accept permissions for uninterrupted execution
- **Installer Deprecated Command Cleanup** - `install`/`update` removes old renamed commands to prevent duplicates
- **`/omc-mem-clear` Command** - AI-powered selective memory cleanup: analyzes memories and suggests outdated/redundant ones for deletion with confidence levels
- **`/omc-mem-summary` Command** - Date-range memory consolidation: collects memories over N days and produces a timeline summary, with optional archival of originals
- **`doctor --fix-mem`** - Automated memory system repair: copies WASM runtime, rebuilds SQLite index, tests embedding connectivity
- **WASM Deployment Fix** - Root cause of embeddings not working: `sql-wasm.wasm` was silently skipped during Bun builds. Now fails explicitly and deploys correctly
- **Doctor Memory Health Check** - `oh-my-claude doctor` now shows memory system health: file count, WASM status, index status, embedding provider connectivity, active search tier
- **Semantic Memory Search** - Three-tier architecture: Hybrid (FTS5 + vector) → FTS5-only → Legacy, with automatic degradation
- **SQLite Index Engine** - Pure WASM SQLite (sql.js-fts5) with FTS5 BM25 search, heading-aware chunking, SHA-256 change detection
- **Embedding Provider** - Explicit selection: custom (Ollama/vLLM/LM Studio), ZhiPu, OpenRouter, or none. Dimension auto-detection for custom endpoints
- **Deduplication** - Exact hash skip + semantic near-duplicate detection via vector cosine similarity
- **Snippet-Only Recall** - ~200 tokens for 5 results (was ~15k), with `get_memory(id)` drill-down
- **Project Isolation Fix** - Multi-instance contamination fixed across MCP server, hooks, and session logs
- **Hook Consolidation** - `auto-memory.ts` removed, unified into `context-memory.ts`
- **Selective Git Tracking** - `notes/` tracked, `sessions/` + `index.db` gitignored

---

## [1.4.x](changelog/v1.4.x.md) - Stable

**Latest: v1.4.2-beta.1** (2026-02-05)

### Highlights

- **npm Package Fix** - `dist/` now included in published package via `"files"` field (MCP server was deploying as placeholder)
- **Windows Compatibility** - Fixed `which`→`where`, root traversal, path separators, and hook command quoting
- **Project-Scoped Memory** - Per-project memories stored in `.claude/mem/` with auto-detection
- **Memory Compaction (`/omc-compact`)** - AI-assisted grouping and merging via ZhiPu/MiniMax/DeepSeek
- **Context Auto-Save** - PostToolUse hook auto-saves session memory at configurable context threshold
- **Scope-Aware MCP Tools** - All memory tools (`remember`, `recall`, `forget`, `list_memories`) support `project`/`global`/`all` scope
- **Live Model Switching** - HTTP proxy for in-conversation model switching to external providers
- **`/omc-switch` Command** - Switch models via slash command with shortcut aliases (`ds`, `ds-r`, `zp`, `mm`)
- **OAuth Support** - Proxy works with Claude Code OAuth sessions (no API key needed)
- **Proxy MCP Tools** - `switch_model`, `switch_status`, `switch_revert` for seamless switching
- **Agent Capability Awareness** - All agents now know about memory tools and hot-switch
- **Auto-Revert Safety** - Request counter + timeout ensure automatic return to native Claude

---

## [1.3.x](changelog/v1.3.x.md)

**Latest: v1.3.0-beta.3** (2026-01-29)

### Highlights

- **Output Style Manager** - CLI commands to list, set, show, reset, and create output styles
- **5 Built-in Style Presets** - engineer-professional, agent, concise-coder, teaching, review
- **Custom Style Support** - Create and manage custom output styles in `~/.claude/output-styles/`
- **Memory System** - Markdown-first persistent memory with MCP tools and CLI
- **`execute_with_model` MCP Tool** - Direct model routing for token-efficient calls
- **Memory StatusLine Segment** - Shows memory count in statusline `[mem:N]`
- **Companion Tools** - UI UX Pro Max skill via `setup-tools`

---

## [1.2.x](changelog/v1.2.x.md) - Stable

**Latest: v1.2.2** (2026-01-29)

### Highlights

- **Segment-based statusline** with configurable widgets (Model, Git, Directory, Context, Session, Output Style, MCP)
- **Statusline CLI commands** - `preset` and `toggle` commands for runtime configuration
- **API quota display** - Shows 5-hour and 7-day utilization from Claude OAuth API
- **Token usage tracking** - Context segment parses transcript for real-time token usage
- **Rich context system** - Automatic context gathering for MCP background agents
- **Concurrent execution** - Semaphore-based concurrency with global and per-provider limits
- **Windows fixes** - Cross-platform git commands, proper timeout handling

### Breaking Changes (v1.2.0)

- Removed automatic fallback to Claude models - MCP agents now require API keys

---

## [1.1.x](changelog/v1.1.x.md)

**Latest: v1.1.4** (2026-01-16)

### Highlights

- **Real-time statusline** with animated spinners and color coding
- **Task tool tracking** - Monitor Claude-Reviewer, Claude-Scout, etc.
- **`setup-tools` command** - Install companion tools like CCometixLine
- **`execute_agent` MCP tool** - Blocking agent execution without polling
- **Beta channel** - Install from GitHub dev branch with `update --beta`
- **Bug reporting** - `/omcx-issue` command to report issues to GitHub

---

## [1.0.x](changelog/v1.0.x.md)

**Latest: v1.0.1** (2025-01-15)

### Highlights

- **Initial release** of oh-my-claude
- **Multi-provider MCP server** - DeepSeek, ZhiPu GLM, MiniMax
- **Specialized agents** - Sisyphus, Oracle, Librarian, Claude-Reviewer, Claude-Scout, etc.
- **Slash commands** - `/omc-*` agent commands, `/omcx-*` quick actions
- **CLI tools** - install, uninstall, status, doctor, setup-mcp
- **Self-update** - `npx @lgcyaxi/oh-my-claude update`

---

## Version History

| Version | Date | Type | Summary |
|---------|------|------|---------|
| v2.2.0 | 2026-03-12 | Major | Native coworker runtime (Codex + OpenCode), unified coworker_task() API, cross-platform viewer, scoped code review, 4-wave modularization, Windows WezTerm support |
| v2.1.3-beta.75 | 2026-03-12 | Beta | Windows WezTerm coworker viewer fix — Git Bash wrapping, Codex viewer log rendering fix |
| v2.1.3-beta.74 | 2026-03-11 | Beta | Inside-WezTerm debug pane fix — proxy-first spawn approach with wezterm cli split-pane for CC pane (left 65%); routing fix for debug mode inside existing WezTerm session |
| v2.1.3-beta.73 | 2026-03-11 | Beta | Windows debug mode WezTerm fix — coordinator script approach for reliable pane splitting |
| v2.1.3-beta.72 | 2026-03-11 | Beta | Bun path resolution refactoring + Windows CC session test coverage |
| v2.1.3-beta.71 | 2026-03-11 | Beta | OpenCode plugin agent support — live /agent list resolution, fuzzy matching, enhanced metadata |
| v2.1.3-beta.70 | 2026-03-11 | Beta | Code style standardization — 48 files converted to tabs + single quotes for consistent formatting |
| v2.1.3-beta.69 | 2026-03-11 | Beta | Execution metadata standardization — operation field in all action results; protocol coverage documentation; OpenCode viewer simplification |
| v2.1.3-beta.68 | 2026-03-11 | Beta | App-server modularization — Codex lifecycle/transport/requests, OpenCode task-actions split; ~596 lines removed, ~640 lines added |
| v2.1.3-beta.67 | 2026-03-11 | Beta | Final coworker modularization — runtime actions, daemon base, MCP task handlers, scoped review modules; ~1,286 lines removed, ~1,460 lines added |
| v2.1.3-beta.66 | 2026-03-10 | Beta | Proxy passthrough simplification — zero body modification, removed thinking block stripping (~35 lines) |
| v2.1.3-beta.65 | 2026-03-10 | Beta | Deep coworker modularization — app-server ops, conversation events, runtime actions, scoped review diff; ~1,900 lines removed, ~1,600 lines added |
| v2.1.3-beta.64 | 2026-03-10 | Beta | Coworker codebase modularization — extracted focused modules from monolithic files; ~2,700 lines removed, ~2,300 lines added in focused modules |
| v2.1.3-beta.63 | 2026-03-10 | Beta | Codex approval policy configuration — configurable via approval_policy parameter or OMC_CODEX_APPROVAL_POLICY env var; runtime policy switching; approvalPolicy in status |
| v2.1.3-beta.62 | 2026-03-10 | Beta | Approval validation — decision validation against allowed options; richer approval metadata; documentation consistency |
| v2.1.3-beta.61 | 2026-03-10 | Beta | Scoped review timeout heuristics — prompt-size-aware estimation; timeout error metadata; expanded test cleanup |
| v2.1.3-beta.60 | 2026-03-10 | Beta | Initial commit diff fixes — staged/unstaged separation, binary files, symlinks; test artifact cleanup; approval validation |
| v2.1.3-beta.59 | 2026-03-10 | Beta | Initial commit diff fixes — executable mode preservation, empty files, symlink support; staged-then-deleted handling; OpenCode review events |
| v2.1.3-beta.58 | 2026-03-10 | Beta | Scoped uncommitted diff for Codex reviews, richer approval metadata with resolvedDecision, documentation prefers coworker_task |
| v2.1.3-beta.57 | 2026-03-10 | Beta | Scoped Codex reviews with paths, unified coworker_task MCP tool, rich approval metadata, timeout recommendations |
| v2.1.3-beta.56 | 2026-03-10 | Beta | Coworker feature extensions — 5 new MCP tools (review, diff, fork, approve, revert), Codex approval system, thread operations, OpenCode extensions |
| v2.1.3-beta.55 | 2026-03-10 | Beta | Codex task cancellation (turn/interrupt), viewer auto-close (20s idle), OpenCode TUI control, timeout handling, viewer session attachment |
| v2.1.3-beta.54 | 2026-03-10 | Beta | Unified coworker viewer (tmux/WezTerm/Terminal), activity log merging, statusline DRY refactor |
| v2.1.3-beta.53 | 2026-03-09 | Beta | Coworker observability (JSONL logs + status signals), streaming task execution, OpenCode runtime upgrade, OpenCode statusline segment |
| v2.1.3-beta.52 | 2026-03-09 | Beta | Provider agents (@kimi, @deepseek, etc.), Sisyphus delegation overhaul, coworker statusline segment |
| v2.1.3-beta.51 | 2026-03-09 | Beta | Proxy sanitizer simplification — removed adaptive thinking injection (~52 lines) |
| v2.1.3-beta.50 | 2026-03-09 | Beta | Bridge removal completion (config/hooks/statusline cleanup ~350 lines), coworker hardening, OpenCode agent discovery |
| v2.1.3-beta.49 | 2026-03-09 | Beta | Native coworker architecture (bridge removal ~18K lines), coworker_send/status MCP tools, Codex protocol v2, OpenCode native coworker |
| v2.1.3-beta.48 | 2026-03-09 | Beta | CC session platform-split refactor (unix/win modules) |
| v2.1.3-beta.47 | 2026-03-09 | Beta | CC debug mode Terminal.app fallback, proxy thinking sanitizer fix |
| v2.1.3-beta.46 | 2026-03-08 | Beta | CC session proxy fallback, proxy log directory cleanup |
| v2.1.3-beta.45 | 2026-03-08 | Beta | CC session UX improvements, tmux exit fix |
| v2.1.3-beta.43 | 2026-03-05 | Beta | Route directive auto-routing, agent architecture overhaul (bridge→native), 5-priority proxy routing, proxy domain restructure |
| v2.1.3-beta.41 | 2026-03-05 | Beta | Bridge bus server, worker auto-switching, pane liveness, statusline fixes, TS fixes |
| v2.1.3-beta.39 | 2026-03-04 | Beta | Bridge stability, installer cleanup, build fixes, proxy pre-switch, config corrections |
| v2.1.0-beta.1 | 2026-02-18 | Beta | Kimi proxy fix - strip unsupported tool_reference content blocks from full-compat providers |
| v2.0.0-beta.13 | 2026-02-17 | Beta | Native TeamCreate integration, bridge-aware Sisyphus, machine-parseable team templates |
| v2.0.0-beta.3 | 2026-02-13 | Beta | Proxy-aware agent delegation: switch+Task over MCP for full tool access |
| v2.0.0-beta.2 | 2026-02-13 | Beta | Fix duplicate export build error, add Kimi/MiniMax to statusline |
| v2.0.0-beta.0 | 2026-02-13 | Beta | OAuth auth, format converter, universal agent fallback, Hephaestus agent, 8 new provider shortcuts |
| v1.5.0-beta.5 | 2026-02-06 | Beta | Command namespace reorganization (omc-mem-*, omc-ulw), auto-accept permissions for Ultrawork |
| v1.5.0-beta.4 | 2026-02-06 | Beta | /omc-mem-clear (selective AI cleanup), /omc-mem-summary (date-range timeline consolidation) |
| v1.4.2-beta.1 | 2026-02-05 | Beta | npm package fix (dist/ included), Windows compatibility fixes |
| v1.4.2-beta.0 | 2026-02-05 | Beta | Project-scoped memory, AI compaction, context auto-save, scope-aware MCP tools |
| v1.4.1 | 2026-02-05 | Patch | README moved to root for npm visibility |
| v1.4.0 | 2026-02-05 | Minor | Live model switching proxy, /omc-switch command, OAuth support, Windows proxy fixes |
| v1.3.0-beta.3 | 2026-01-29 | Beta | execute_with_model tool, memory statusline segment |
| v1.3.0-beta.0 | 2026-01-29 | Beta | Output style manager with 5 built-in presets |
| v1.2.2 | 2026-01-29 | Patch | Segment statusline, CLI commands, rich context, concurrent tasks, Windows fixes |
| v1.2.1 | 2026-01-17 | Patch | Doctor improvements, beta channel |
| v1.2.0 | 2026-01-17 | Minor | Removed fallback, analyst agent |
| v1.1.4 | 2026-01-16 | Patch | setup-tools, config, execute_agent |
| v1.1.3 | 2026-01-16 | Patch | Installer path fix |
| v1.1.2 | 2026-01-16 | Patch | Windows compatibility |
| v1.1.1 | 2026-01-16 | Patch | Real-time statusline |
| v1.1.0 | 2026-01-15 | Minor | Bug reporting command |
| v1.0.1 | 2025-01-15 | Patch | Windows fix, self-update |
| v1.0.0 | 2025-01-15 | Major | Initial release |
