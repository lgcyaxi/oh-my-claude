# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Individual version changelogs are available in the [changelog/](./changelog/) directory.

## [1.1.2] - 2026-01-16

See [changelog/v1.1.2.md](./changelog/v1.1.2.md) for details.

### Fixed
- Windows compatibility for `update` command (shell redirection errors)
- MCP list/remove commands now work on Windows

## [1.1.1] - 2026-01-16

See [changelog/v1.1.1.md](./changelog/v1.1.1.md) for details.

### Added
- Real-time StatusLine showing active agents and provider availability
- Task tool agent tracking (Claude-Reviewer, Claude-Scout, etc.)
- StatusLine CLI subcommand (`statusline --enable/--disable/--status`)
- Multi-line statusline support (merges with existing statusline)

### Changed
- MCP server now writes status file on startup
- Doctor command shows statusline status

## [1.1.0] - 2026-01-15

See [changelog/v1.1.0.md](./changelog/v1.1.0.md) for details.

### Added
- Bug reporting command (`/omcx-issue`)
- GitHub issue template for bug reports

## [1.0.1] - 2025-01-15

See [changelog/v1.0.1.md](./changelog/v1.0.1.md) for details.

### Added
- Self-update command (`update`)
- Automatic fallback to Claude models when API keys not configured

### Fixed
- Windows ESM path compatibility

## [1.0.0] - 2025-01-15

See [changelog/v1.0.0.md](./changelog/v1.0.0.md) for details.

### Added
- Initial release
- Multi-provider MCP server (DeepSeek, ZhiPu GLM, MiniMax)
- Specialized agent workflows
- Slash commands and CLI tools
- Planning system with Prometheus
- Hook integration
