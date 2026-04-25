# Changelog

All notable changes to oh-my-claude are documented here. Detailed changelogs are in `docs/changelog/`.

## [2.2.x](changelog/v2.2.x.md) — 2026-03-12 to 2026-04-25

### Latest: v2.2.14-beta.7

- **Critical install fix, continued — prebuilt `dist/` now ships on `dev`** — beta.6's `prepare`-on-install wasn't sufficient in the wild: bun 1.3.13 skipped the `prepare` lifecycle on `bun add -g <gh-tarball>` (no scripts ran; matches bun's default-untrusted policy), and even when it ran, bun's flat global `node_modules` pairs oh-my-claude with `oh-my-opencode@^4.3.0 zod`, so `zod@4.3.6` wins the resolver and our `zod@^3.24.0` is silently dropped — the source fallback would then load zod 4 files and crash at `zod/v3/types.js:1:1`. beta.7 force-adds `dist/cli/cli.js` and the rest of the bundle to the `dev` branch with our locked `zod@3.25.76` inlined, so `bin/` loads the prebuilt bundle immediately and no runtime `'zod'` resolution ever touches the global node_modules
- **Release discipline codified in [CLAUDE.md](../CLAUDE.md)** — dev-channel beta releases now do `bun run build:all` + `git add -f dist/` + commit the bundle alongside the version bump. Stable release still squash-merges `dev` → `main` but must `git rm -r --cached dist/` on the squash so `main` remains source-only (npm publish rebuilds `dist/` via the `prepare` script from beta.6)
- **beta.6 infra (prepare script + hardened bin) retained as belt-and-suspenders** — if `dist/` ever goes missing (linked-checkout dev workflow, user hand-delete), prepare still rebuilds it and the bin still fails fast with the actionable error users saw in the wild

### Previous: v2.2.14-beta.6

- **Added `scripts/prepare.cjs` + `prepare` lifecycle hook** to rebuild `dist/` during `bun add -g` / `npm install` git-tarball installs (replaces the publish-only `prepack`). Skips when `dist/cli/cli.js` is already present and honours `OMC_SKIP_PREPARE=1`
- **Hardened `bin/oh-my-claude.js`** — silent TS fallback is now gated behind `OMC_ALLOW_SOURCE_FALLBACK=1`; normal users see a precise actionable error with the package dir, the one-line `bun run build:all` fix, and bun install links, instead of the cryptic `zod/v3/types.js:1:1` parse crash
- **`installFromGitHub` belt-and-suspenders build** — comment updated to reflect prepare-first flow; stale `dist/cli.js` path check corrected to `dist/cli/cli.js`

### Previous: v2.2.14-beta.5

- **Dashboard ref-counted lifecycle** — first `omc cc` starts the dashboard (idempotent; unchanged), last `omc cc` exit tears it down via the new `maybeStopDashboard()` probe which reads `proxy-sessions.json` + `proxy-instances.json` and only kills when both are empty. `omc proxy dashboard` marks its launch as `origin="manual"` via the new `dashboard.origin` marker; manual dashboards are sticky and are never auto-reaped, even after a later implicit `ensureDashboard()`
- **B1 HIGH — no more `pid:0` sessions** — `omc cc` refuses to register a proxy session when the spawned bun child's PID is `0` (Windows edge case), `cleanupStaleEntries` purges any such legacy entries, and `omc cc stop` refuses to `process.kill(0, …)`. Removes a real footgun where the old code could signal the calling process group
- **B2 HIGH — corrupt `settings.json` no longer silently overwritten** — `loadSettings()` now backs up the bad file to `settings.json.corrupt-<unix-ts>.bak` and throws `SettingsCorruptError` instead of returning `{}`, which previously caused `saveSettings()` to clobber the user's Claude Code config. Install / doctor / hook-merge paths propagate the error
- **B3 MED — `memory-awareness.ts` stops printing bogus "Proxy not detected" warnings** — new detection: `OMC_PROXY_CONTROL_PORT` set → no warning; else loopback `ANTHROPIC_BASE_URL` matches legacy 18910/18920 or a live registry port → no warning. The old hard-coded `9090` compare is gone
- **Medium / low cleanups** — `preference-awareness` cache key now includes `cwd` (no cross-project prompt collisions); `instance-registry` RMW ops run under an `O_EXCL` advisory lock (stale-lock auto-recycle after 5s); `comment-checker` regex patterns dropped the `/g` flag (fixes flaky alternating `.test()` results); `PID_FILE` renamed to `DASHBOARD_PID_FILE` for consistency with the new `DASHBOARD_ORIGIN_FILE`; dead `routeViaProxy` / `routeViaClaude` / `isProxyAvailable` helpers + hard-coded 18910/18911 constants deleted from `mcp/server/manager.ts`

### Previous: v2.2.14-beta.4

- **Vision tag for `qwen3.6-plus`** — the Aliyun Qwen 3.6 Plus entry now carries `"note": "supports vision"` and the dashboard + menubar both surface it as a pill (Switch page uses ` · supports vision` in the `<option>` label plus a below-select pill; menubar shows it next to the model label). Root cause: `/providers` stripped the `note` field — fixed to pass registry entries through with `note` / `realId` intact
- **`proxy.failClosed` default-on** — switched-path failures now return `HTTP 502 {error:{type:"upstream_error", provider, model}}` instead of silently bridging to the native Claude subscription (which masked bad API keys and billed the wrong account). Opt-in legacy behaviour via `proxy.failClosed: false`
- **OpenAI-shape streaming is correct end-to-end** — proxy now requests `stream_options.include_usage` on every streaming Chat Completions call, so the terminal chunk carries real token usage; `finish_reason` → Anthropic `stop_reason` is now an explicit `switch` (covers `stop` / `length` / `tool_calls` / `function_call` / `content_filter`) with a `console.warn` fallback for unknown reasons
- **`forwardToInstance` reports real upstream errors** — stopped treating every non-JSON response as "unreachable"; now returns the real status + first 500 bytes of body when the instance responds with HTML or plain text, and includes the network error message in the catch path
- **Per-agent `max_tokens` + `thinking` now reach the wire** — `resolveProviderForAgent*` carries both through the router and both the OpenAI-compat and Anthropic-compat clients forward them in the outgoing body, so `thinking.enabled=true` declarations actually enable thinking on DeepSeek V4 Pro / Claude Opus
- **Low-severity cleanup** — `sanitize.ts` comment refreshed to point at the real dispatcher; `task-tracker` registered in the `HOOKS` map for registry completeness; passthrough usage-cache failures now log instead of being swallowed

### Previous: v2.2.14-beta.3

- **Memory auto-rotation on SessionStart** — new `auto-rotate` hook prunes zero-byte `active-session-<hash>.jsonl` files and compacts past-date sessions + auto-commit notes into one `YYYY-MM-DD-daily-rollup.md` per day. Primary path uses the same internals as `/omc-mem-summary` (provider order: **minimax-cn → minimax → zhipu → deepseek**, domestic MiniMax preferred); deterministic fallback when the proxy is unreachable. Runs under a 20s wall clock, caps per-run work via `memory.autoRotate.maxDatesPerRun` (default 2), never blocks Claude Code startup, and logs every action to `~/.claude/oh-my-claude/memory/.rotation-log.jsonl`
- **Memory ops audit: 9 bug fixes** — `clearSessionLog` now `unlinkSync`s (stops the zero-byte file graveyard); `summarize_memories` MCP input schema now accepts `narrative` / `dateRange` / `type`; `removeFromIndex` is finally `async` + `await indexer.flush()`; memory IDs use local time (fixes late-evening PDT sessions landing on the next UTC day); `parseAIJsonResult` uses a string-aware brace-walker instead of a greedy regex; `compact_memories` only drops SQLite rows after a successful `deleteMemory`; empty `catch {}` replaced with `console.error` on the memory paths; slash-command docs refreshed (provider priority, typos, removed params)
- **`memory.autoRotate` config** — new Zod block: `enabled` / `graceDays` / `thresholdFiles` / `maxDatesPerRun` / `useLLMWhenAvailable` with safe defaults

### Previous: v2.2.14-beta.2

- **DeepSeek V4 + GLM Claude-tier mapping** — proxy-side `claudeTierMap` rewrites Claude-tier requests: DeepSeek `opus → deepseek-v4-pro (effort=max)` / `sonnet → deepseek-v4-pro (effort=high)` / `haiku → deepseek-v4-flash (fast path)`; ZhiPu + Z.AI `opus → glm-5.1` / `sonnet → glm-5-turbo` / `haiku → glm-4.5-air`
- **DeepSeek V4 Flash + GLM-4.5 Air** — new haiku-tier models added to the DeepSeek and ZhiPu/Z.AI rosters
- **Legacy DeepSeek names removed** — `deepseek-chat` / `deepseek-reasoner` hard-removed from aliases, statusline, `omc cc` picker, and `/omc-switch` ahead of the 2026-07-24 upstream sunset
- **`omc cc` Windows PowerShell fix** — inline and remote-control launches now use `cmd.exe` on native Windows so `claude.cmd`/`claude.exe` resolve via `PATHEXT` instead of failing under `/bin/bash`
- **Statusline context bar respects the switched provider model** — `context` segment now queries the proxy switch state and sizes the context window against the effective upstream model (fixes ~5x over-report on DeepSeek V4 / Qwen 3.6 1M sessions); DeepSeek V4 window corrected from 128K to 1M per official pricing docs
- **Context segment sources model from the transcript** — `parseTranscriptTail()` reads the assistant entry's `message.model` (the exact upstream billing identity, verified directly off a real `.jsonl`), so switched sessions no longer rely on a proxy control-API round-trip and native Claude picks up the dated `claude-opus-4-7-…` slug. Fixed Claude Opus 4.6 / 4.7 context windows to 1M (both ship with 1M at standard pricing), corrected `glm-5-turbo` to 128K, and added explicit `glm-4.6` (200K) / `glm-4.5` (128K) rows against the authoritative vendor docs

### Previous: v2.2.13

- **Session Identity Fix** — Deterministic session ID from CWD (SHA-256 hash) so `/continue` finds prior conversation history; fixed cross-project session leak in resume
- **Proxy Reuse** — Reuses healthy proxy already running for the same project instead of spawning a new one
- **tmux Improvements** — Session reuse on Windows, correct attach outside tmux, preferred port allocation for stable URLs

### Highlights

- **Web Dashboard** — React 19 + Vite + Tailwind SPA at `localhost:18920/web/` with sessions, memory, preferences, models, providers, switch pages
- **Native Coworker Runtime** — Codex + OpenCode with unified `coworker_task()` API (9 actions), cross-platform viewer, scoped code review
- **Official Codex Plugin** — Replaced custom Codex ACP (~500+ files) with `openai/codex-plugin-cc`
- **OpenRouter Provider** — Free models via native Anthropic-compatible API
- **Ollama Native Thinking** — Extended thinking protocol support
- **Model Updates** — MiniMax M2.7 default, Qwen 3.6+ default, Claude 4.6 agents, GLM-5.1
- **Dashboard Hardening** — EMFILE fix, adaptive polling, bounded cache, session-centric views
- **Deep Modularization** — 4 waves of coworker refactoring, proxy splitting, CLI code splitting

## [2.1.x](changelog/v2.1.x.md) — 2026-02-18 to 2026-03-12

### Highlights

- **Native Coworker Development** — OpenCode + Codex integration with unified viewer, task lifecycle, Git Bash discovery, approval policies
- **Windows WezTerm Debug** — Coordinator script pattern, proxy-first spawn, inside/outside WezTerm routing
- **Bridge → Native Migration** — Removed ~18K lines of bridge system, replaced with direct proc-based coworker runtime
- **Proxy Response Capture** — SSE capture, per-session ring buffer, `/response` and `/stream` endpoints
- **CLI Modularization** — 3230-line monolith split into 12 command modules across 4 domains
- **Route Directive Auto-Routing** — 5-priority proxy routing: directive → model-driven → session → global → passthrough
- **Provider Agents** — `@kimi`, `@deepseek`, `@qwen`, `@zhipu`, `@mm-cn`, `@deepseek-r`

## [2.0.x](changelog/v2.0.x.md) — 2026-02-13 to 2026-02-17

### Highlights

- **CC Terminal Launch** — `omc cc` auto-detects WezTerm/tmux, launches in new window
- **Bridge Send** — Multi-AI collaboration: delegate tasks to Codex, OpenCode, Gemini
- **Proxy-Aware Agent Delegation** — Agents use switch+Task for full tool access
- **OAuth Authentication** — Google Gemini, OpenAI Codex, GitHub Copilot via PKCE flow
- **Format Converters** — Antigravity (Gemini), Responses API (Codex), Chat Completions (Copilot)
- **Navigator Agent** — Kimi K2.5 multimodal specialist
- **Hephaestus Agent** — Code forge specialist for multi-file features

## [1.x](changelog/v1.x.md) — 2025-01-15 to 2026-02-13

### Highlights

- **v1.5.x** — Three-tier semantic memory (Hybrid/FTS5/Legacy), SQLite WASM, `cc` command, Kimi provider, per-session proxy
- **v1.4.x** — Live model switching proxy, `/omc-switch`, OAuth, project-scoped memory, context auto-save
- **v1.3.x** — Memory system, output style manager, `execute_with_model`
- **v1.2.x** — Segment-based statusline, rich context, concurrent tasks
- **v1.1.x** — Real-time statusline, setup-tools, execute_agent, beta channel
- **v1.0.x** — Initial release: multi-provider MCP server, 9 agents, slash commands, CLI
