# Changelog

All notable changes to oh-my-claude will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Versions

- [v1.0.0](changelog/v1.0.0.md) - 2025-01-15 - First public release

---

## [1.0.0] - 2025-01-15

First public release of oh-my-claude.

### Added

- **Multi-Provider MCP Server**
  - Support for DeepSeek, ZhiPu GLM, MiniMax via Anthropic-compatible APIs
  - Background task execution with concurrent task management
  - Per-provider rate limiting and parallel execution

- **Specialized Agents** (9 total)
  - Sisyphus - Primary orchestrator (Claude)
  - Claude-Reviewer - Code review, QA (Claude)
  - Claude-Scout - Fast exploration (Claude)
  - Prometheus - Strategic planning (Claude)
  - Oracle - Deep reasoning (DeepSeek)
  - Librarian - External research (ZhiPu)
  - Explore - Codebase search (DeepSeek)
  - Frontend-UI-UX - Visual/UI design (ZhiPu)
  - Document-Writer - Documentation (MiniMax)

- **Slash Commands**
  - Agent commands (`/omc-*`): sisyphus, oracle, librarian, reviewer, scout, explore, plan, start-work
  - Quick action commands (`/omcx-*`): commit, implement, refactor, docs

- **CLI Commands**
  - `install` - Install oh-my-claude into Claude Code
  - `uninstall` - Remove oh-my-claude
  - `status` - Check installation status
  - `doctor` - Diagnose configuration with `--detail` flag
  - `setup-mcp` - Install official MCP servers

- **Official MCP Server Setup**
  - sequential-thinking (Anthropic)
  - MiniMax coding plan
  - ZhiPu GLM: web-reader, web-search-prime, zread, zai-mcp-server

- **Planning System**
  - Prometheus agent for strategic planning
  - Boulder-state tracking for active plans
  - `/omc-plan` and `/omc-start-work` workflow

- **Hook Integration**
  - Comment checker for code quality
  - Todo continuation tracking

- **Documentation**
  - README.md (English)
  - README.zh-CN.md (Chinese)

### Technical Details

- Built with Bun runtime
- TypeScript throughout
- MCP server using @modelcontextprotocol/sdk
- Anthropic-compatible API format for all providers

[1.0.0]: https://github.com/anthropics/oh-my-claude/releases/tag/v1.0.0
