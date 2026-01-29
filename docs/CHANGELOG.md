# Changelog

All notable changes to oh-my-claude are documented here.

## [1.2.x](changelog/v1.2.x.md) - Current Stable

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
