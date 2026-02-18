# oh-my-claude Development Guide

## Project Overview

Multi-provider MCP server for Claude Code with specialized agent workflows. Routes background tasks to DeepSeek, ZhiPu GLM, MiniMax via Anthropic-compatible APIs.

**npm package:** `@lgcyaxi/oh-my-claude`

## Build Commands

```bash
bun install          # Install dependencies
bun run build:all    # Build everything (main, MCP server, hooks)
bun run typecheck    # TypeScript type checking
bun test             # Run tests
```

## Project Structure

- `src/agents/` - Agent definitions with prompts (8 agents)
- `src/config/` - Configuration schema (Zod validation)
- `src/providers/` - Multi-provider API clients (DeepSeek, ZhiPu, MiniMax, OpenRouter)
- `src/mcp/` - Background Agent MCP server
- `src/hooks/` - Claude Code hook scripts
- `src/generators/` - Agent .md file generators
- `src/installer/` - CLI installer
- `src/styles/` - Output style presets and manager
- `src/memory/` - Markdown-first memory system with three-tier semantic search (hybrid/FTS5/legacy), SQLite indexer, embeddings, dedup, timeline
- `src/statusline/` - StatusLine segments and configuration
- `src/proxy/` - Live model switching HTTP proxy (server, handler, control, state, auth, stream)
- `src/cli/commands/` - CLI command modules (12 files: install, doctor, update, cc, proxy, etc.)
- `src/cli/utils/` - Shared CLI utilities (colors, paths, health, proxy-lifecycle)

## Architecture

- **Task Tool Agents** (Claude subscription): Sisyphus, Claude-Reviewer, Claude-Scout
- **MCP Background Agents** (external APIs): Oracle, Librarian, Explore, Frontend-UI-UX, Document-Writer

## Conventions

- Use Bun runtime (not Node.js)
- All API clients are OpenAI-compatible
- Agent prompts are in their respective `src/agents/*.ts` files
- Configuration is validated with Zod schema

## Build & Test Workflow (MUST follow)

**Every change MUST be verified through the installed production version, not source.**

```bash
# 1. Build everything
bun run build:all

# 2. Install to ~/.claude/ (always use --force to overwrite stale files)
bun run install-local -- --force

# 3. Verify via the installed CLI (NOT via bun run src/...)
oh-my-claude doctor         # Check configuration
oh-my-claude menubar --build  # Rebuild menubar if changed

# For menubar changes specifically:
oh-my-claude menubar --build  # Build Tauri app from installed source
```

**IMPORTANT**: Never test source directly (e.g., `bun run src/cli.ts`). Always go through the installed `oh-my-claude` binary. This catches installer bugs (stale files, missing copies, broken paths).

## Slash Commands

Commands are defined in `src/commands/`:

- **Agent Commands (`/omc-*`)**: Activate specific agents (sisyphus, oracle, librarian, switch, etc.)
- **Action Commands (`/omcx-*`)**: Quick actions (commit, implement, refactor, docs)
- **Ultrawork Mode**: `/omc-ulw` (maximum performance, auto-accept permissions, work until done)
- **Switch Command**: `/omc-switch` switches models via proxy (shortcuts: ds, ds-r, zp, mm)
- **Memory Commands (`/omc-mem-*`)**: `/omc-mem-compact` AI-assisted compaction, `/omc-mem-clear` selective AI cleanup, `/omc-mem-summary` date-range timeline consolidation

When adding new commands:
1. Create `.md` file in `src/commands/`
2. Add to appropriate array in `src/commands/index.ts`
3. Update README documentation

## Release Process

```bash
# 1. Update version in package.json and src/cli.ts
# 2. Create changelog in changelog/vX.X.X.md
# 3. Update CHANGELOG.md
# 4. Commit to dev branch
# 5. Squash merge to main
git checkout main && git merge --squash dev
git commit -m "release: vX.X.X - description"
git tag vX.X.X
git push origin main --tags

# 6. Publish to npm
npm publish --access public
```

## Git Conventions

- `.sisyphus/` directory at project root should NOT be committed (session state files)
- Always check `git status` before committing to avoid staging unwanted files
- **DO NOT auto-commit**: Wait for user verification before committing. Build and test first, then ask user to review before creating the commit.
- **Before every commit**: Update changelogs first, then commit all changes together
  1. Update `docs/changelog/v1.X.x.md` with the specific changes
  2. Update `docs/CHANGELOG.md` if the highlights section needs updating
  3. Stage changelog files along with code changes
  4. Commit everything in a single commit

## Key Files

- `src/config/loader.ts` - Config loading and provider resolution
- `src/providers/router.ts` - Routes requests to providers (routeByAgent, routeByCategory, routeByModel)
- `src/mcp/background-agent-server/server.ts` - MCP server implementation
- `src/styles/index.ts` - Output style manager (list, set, reset, create)
- `src/memory/index.ts` - Memory system barrel export (store, parser, search, indexer, embeddings, dedup)
- `src/memory/indexer.ts` - SQLite index engine (sql.js-fts5 WASM, FTS5, chunking, hash tracking)
- `src/memory/embeddings.ts` - Embedding provider (explicit selection: custom/zhipu/openrouter/none, async resolver)
- `src/memory/search.ts` - Three-tier search: hybrid (FTS5+vector) > FTS5 > legacy
- `src/memory/dedup.ts` - Deduplication (exact hash skip + semantic near-dupe detection)
- `src/memory/hybrid-search.ts` - Hybrid BM25 + vector result merging
- `src/memory/timeline.ts` - Timeline generator (auto-maintained TIMELINE.md for cross-session awareness)
- `src/statusline/config.ts` - StatusLine config and segment management (8 segments)
- `src/statusline/segments/memory.ts` - Memory statusline segment
- `src/statusline/segments/proxy.ts` - Proxy statusline segment
- `src/proxy/server.ts` - Proxy server entry point (Bun.serve dual server)
- `src/proxy/handler.ts` - Proxy request handler (passthrough vs switched routing)
- `src/proxy/control.ts` - Proxy control API (health, status, switch, revert)
- `src/proxy/state.ts` - Signal file IPC (proxy-switch.json)
- `src/proxy/auth.ts` - Proxy auth (dual mode: api-key / oauth)
- `src/hooks/memory-awareness.ts` - UserPromptSubmit hook for proactive memory usage
- `src/hooks/context-memory.ts` - Unified session writer (PostToolUse checkpoint + Stop session-end capture)
- `src/commands/omc-switch.md` - Slash command for model switching with aliases
- `src/commands/omc-mem-compact.md` - Slash command for AI-assisted memory compaction
- `src/commands/omc-mem-clear.md` - Slash command for AI-powered selective memory cleanup
- `src/commands/omc-mem-summary.md` - Slash command for date-range memory timeline consolidation
- `src/cli.ts` - CLI entry point (51-line orchestrator importing 12 command modules)
- `src/cli/commands/cc.ts` - `cc` command with `--provider` direct connection and proxy mode
- `src/cli/utils/colors.ts` - Shared color/formatter helpers (`createFormatters()`)
- `src/cli/utils/paths.ts` - Shared path constants (INSTALL_DIR, CLAUDE_DIR, etc.)
- `src/cli/utils/health.ts` - Shared proxy health check
- `src/cli/utils/proxy-lifecycle.ts` - Shared proxy daemon spawn logic
- `src/auth/minimax.ts` - MiniMax authentication (cookie + groupId extraction via Playwright)
- `scripts/minimax-login.ts` - Playwright script for MiniMax login (QR code scan)
- `bin/oh-my-claude.js` - CLI entry point (uses pathToFileURL for Windows compatibility)

## Documentation Convention

When adding new features, always update ALL of these:
- `README.md` - English documentation (root for npm visibility)
- `docs/README.zh-CN.md` - Chinese documentation
- `CLAUDE.md` - Project instructions (this file)
- `docs/CHANGELOG.md` - Main changelog
- `docs/changelog/v1.X.x.md` - Version-specific changelog

## Bridge Enhancements

### Event-Driven Notifications
Background tasks write completion signal files to `~/.claude/oh-my-claude/signals/completed/` when finished. The PostToolUse and UserPromptSubmit hooks scan for these signals, eliminating the need for repeated `poll_task` calls.

### `wait_for_tasks` MCP Tool
Blocks until multiple background tasks complete. Supports `any` (first completion) or `all` (wait for all) modes. Max timeout 300s. Replaces repeated polling.

### Bridge Auto-Close
`bridge_send` now accepts `auto_close` parameter (default: `true`). After receiving a response, the AI pane is automatically killed and removed from bridge state.

### Per-Session Bridge State
Bridge request counts are tracked per-session in `~/.claude/oh-my-claude/sessions/{session-id}/bridge-requests.json`, scoped to the current session (not globally). The bridge statusline segment has been removed since bridge AIs are now visible by default (pane-right layout).

### CC-to-CC Bridge
Spawn Claude Code instances as bridge workers (`bridge up cc`), each with its own proxy session for isolated model switching. Supports `--switch <alias>` for auto-switching at startup and multi-instance names (`cc:2`, `cc:3`). Response capture via pane-output polling. `bridge_send` MCP tool supports `cc` targets.
