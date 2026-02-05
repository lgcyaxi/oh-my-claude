# Changelog

All notable changes to oh-my-claude are documented here.

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
