# Changelog

All notable changes to oh-my-claude are documented here. Detailed changelogs are in `docs/changelog/`.

## [2.2.x](changelog/v2.2.x.md) — 2026-03-12 to 2026-04-13

### Latest: v2.2.12

- **`/resume` Fix** — Sessions created via omc proxy now have proper `messageCount` in `sessions-index.json`, fixing Claude Code's `/resume` discovery
- **Shared AI Ops Engine** — Extracted duplicated prompt/merge/parse logic into `src/memory/ai-ops-shared.ts`
- **Dead Code Cleanup** — Removed ~840 lines of orphaned segments, dead hooks, unused functions

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
