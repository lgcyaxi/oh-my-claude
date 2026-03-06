# Changelog

All notable changes to oh-my-claude are documented here.

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
