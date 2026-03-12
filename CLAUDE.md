# oh-my-claude Development Guide

## Project Overview

Multi-provider MCP server for Claude Code with specialized agent workflows. Routes background tasks to DeepSeek, Z.AI/ZhiPu GLM, MiniMax via Anthropic-compatible APIs.

**npm package:** `@lgcyaxi/oh-my-claude`

## Build Commands

```bash
bun install          # Install dependencies
bun run build:all    # Build everything (main, MCP server, hooks)
bun run typecheck    # TypeScript type checking
bun test             # Run tests
```

## Project Structure

- `src/assets/` - Static definitions: agents (prompts, types, category), commands (slash command .md files), styles
- `src/cli/` - CLI entry point, command modules, installer, and agent generators
- `src/hooks/` - Claude Code hook scripts categorized by type (pre-tool-use, post-tool-use, stop, user-prompt-submit)
- `src/mcp/` - Background Agent MCP server (launch_background_task, poll_task, execute_agent, memory tools)
- `src/memory/` - Markdown-first memory system: SQLite/FTS5 indexer, embeddings, dedup, timeline, search
- `src/proxy/` - Live model switching HTTP proxy: server, handler, control API, state IPC, auth, stream
- `src/shared/` - Cross-domain shared modules: config (Zod), providers (API clients), context, auth, preferences
- `src/statusline/` - Statusline engine, session utils, and segment plugins
- `src/coworker/` - Native coworker runtimes: Codex, OpenCode, shared daemon internals, generated Codex protocol types

## Architecture

Agents are defined in `src/assets/agents/` and organized by `category` array. Agents can support multiple execution modes:

- **Native-only** (`category: ["native"]`, Claude subscription via Task tool):
  Sisyphus, Prometheus, Claude-Reviewer, Claude-Scout, OpenCode, Codex-CLI
- **Proxy-only** (`category: ["proxy"]`, external APIs via MCP):
  Provider-specific tasks use route directives and proxy routing.
- **Dual-mode** (`category: ["native", "proxy"]`):
  Oracle, Navigator, Hephaestus, UI-Designer — can run via Task tool OR MCP background

## Project Context

- **Primary languages**: TypeScript (primary), Python (secondary), Markdown (docs)
- When editing config files, respect JSON/YAML formatting
- For shell scripts, always use LF line endings and add `.gitattributes` rules for any extensionless files

## Platform-Specific Notes (Windows/WSL2)

- Use `shell: true` when spawning UWP aliases like `wt.exe`
- Quote arguments with spaces in shell mode
- Never use `wezterm cli spawn` without a running mux server — prefer Git Bash-compatible approaches
- Watch for CRLF vs LF issues in cross-platform scripts

## Deployment & Testing

- When fixing bugs or implementing features, deploy/test changes on the actual target environment (e.g., remote NAS via SSH, correct proxy version) — do not assume local-only testing is sufficient

## Conventions

- Use Bun runtime (not Node.js)
- All API clients are OpenAI-compatible
- Agent definitions (prompts, metadata, category) are in `src/assets/agents/*.ts`
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

Commands are defined in `src/assets/commands/` subfolders:

- `orchestration/` — workflow commands: sisyphus, plan, start-work, pend, ulw
- `memory/` — memory management: mem-clear, mem-compact, mem-daily, mem-summary
- `runtime/` — runtime & infra: status, codex, opencode, pref
- `actions/` — quick actions: commit, implement, refactor, docs, issue
- **Ultrawork Mode**: `/omc-ulw` (maximum performance, auto-accept permissions, work until done)
- **Model Switching**: use `mcp__oh-my-claude__switch_model` / `mcp__oh-my-claude__switch_revert` MCP tools directly, or `curl` the proxy control API (port 18911)
- **Memory Commands (`/omc-mem-*`)**: `/omc-mem-compact` AI-assisted compaction, `/omc-mem-clear` selective AI cleanup, `/omc-mem-summary` date-range timeline consolidation

When adding new commands:
1. Create `.md` file in the appropriate subfolder under `src/assets/commands/`
2. Add to the matching group array in `src/assets/commands/index.ts`
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

- `src/shared/config/loader.ts` - Config loading and provider resolution
- `src/shared/providers/router.ts` - Routes requests to providers (routeByAgent, routeByCategory, routeByModel)
- `src/mcp/server/index.ts` - MCP server entry point (tool registration and domain wiring)
- `src/mcp/server/manager.ts` - MCP server manager (lifecycle and orchestration)
- `src/mcp/memory/ai-ops.ts` - Memory AI operations (compaction and cleanup workflows)
- `src/mcp/coworker/index.ts` - Coworker MCP flow (`coworker_send`, `coworker_status`)
- `src/mcp/tasks/run.ts` - Task runner execution flow
- `src/mcp/shared/types.ts` - Shared MCP domain types
- `src/assets/agents/index.ts` - Agent registry: `agents`, `taskAgents`, `nativeAgents`
- `src/assets/agents/types.ts` - AgentDefinition type (category, executionMode, prompt, provider, model)
- `src/assets/styles/index.ts` - Output style manager (list, set, reset, create)
- `src/memory/index.ts` - Memory system barrel export (store, parser, search, indexer, embeddings, dedup)
- `src/memory/indexer.ts` - SQLite index engine (sql.js-fts5 WASM, FTS5, chunking, hash tracking)
- `src/memory/embeddings.ts` - Embedding provider (explicit selection: custom/zhipu/openrouter/none, async resolver)
- `src/memory/search.ts` - Three-tier search: hybrid (FTS5+vector) > FTS5 > legacy
- `src/memory/dedup.ts` - Deduplication (exact hash skip + semantic near-dupe detection)
- `src/memory/hybrid-search.ts` - Hybrid BM25 + vector result merging
- `src/memory/timeline.ts` - Timeline generator (auto-maintained TIMELINE.md for cross-session awareness)
- `src/statusline/config.ts` - StatusLine config and segment management
- `src/statusline/segments/memory.ts` - Memory statusline segment
- `src/statusline/segments/proxy.ts` - Proxy statusline segment
- `src/cli/generators/agent-generator.ts` - Generates agent .md files for ~/.claude/agents/
- `src/hooks/stop/context-memory.ts` - Unified session writer (PostToolUse checkpoint + Stop session-end)
- `src/hooks/user-prompt-submit/memory-awareness.ts` - UserPromptSubmit hook for proactive memory usage
- `src/proxy/server.ts` - Proxy server entry point (Bun.serve dual server)
- `src/proxy/handler.ts` - Proxy request handler (passthrough vs switched routing orchestrator)
- `src/proxy/model-resolver.ts` - Model resolution for switched provider requests (`resolveEffectiveModel`)
- `src/proxy/provider-forward.ts` - Provider forwarding (OpenAI-format vs Anthropic-format upstream dispatch)
- `src/proxy/response-builders.ts` - Response conversion (OpenAI/Responses API SSE → Anthropic format)
- `src/proxy/control.ts` - Proxy control API (health, status, switch, revert)
- `src/proxy/state.ts` - Signal file IPC (proxy-switch.json)
- `src/proxy/auth.ts` - Proxy auth (dual mode: api-key / oauth)
- `src/assets/commands/memory/omc-mem-compact.md` - Slash command for AI-assisted memory compaction
- `src/assets/commands/memory/omc-mem-clear.md` - Slash command for AI-powered selective memory cleanup
- `src/assets/commands/memory/omc-mem-summary.md` - Slash command for date-range memory timeline consolidation
- `src/hooks/index.ts` - Hook registry (HOOKS definitions, HookName type)
- `src/cli/installer/index.ts` - CLI installer (install, uninstall, checkInstallation)
- `src/cli/installer/settings-merger.ts` - Settings.json hook/MCP/statusline merging
- `src/cli/cli.ts` - CLI entry point (orchestrator importing 12 command modules)
- `src/cli/commands/core/` - Core lifecycle commands: install, doctor, update
- `src/cli/commands/session/` - Session commands: cc (with `--provider`/proxy mode), proxy, auth
- `src/cli/commands/tools/` - Tools command: CLI tools + MCP server installation
- `src/cli/commands/manage/` - Manager subcommands: preference, memory, config, statusline, style, ollama, cleanup, terminal-config
- `src/cli/commands/system/` - System commands: menubar
- `src/cli/utils/colors.ts` - Shared color/formatter helpers (`createFormatters()`)
- `src/cli/utils/paths.ts` - Shared path constants (INSTALL_DIR, CLAUDE_DIR, etc.)
- `src/cli/utils/health.ts` - Shared proxy health check
- `src/cli/utils/proxy-lifecycle.ts` - Shared proxy daemon spawn logic
- `src/shared/auth/minimax.ts` - MiniMax authentication (cookie + groupId extraction via Playwright)
- `scripts/minimax-login.ts` - Playwright script for MiniMax login (QR code scan)
- `bin/oh-my-claude.js` - CLI entry point (uses pathToFileURL for Windows compatibility)
- `docs/guides/codex-app-server.md` - Codex app-server wire protocol, lifecycle, and coworker integration guide
- `docs/guides/coworker-gui-acceptance.md` - Cross-platform coworker GUI acceptance tests (macOS/Windows/Linux)
- `docs/guides/coworker-smoke-tests.md` - Manual and CI smoke-test commands for Codex/OpenCode coworkers

## Documentation Convention

When adding new features, always update ALL of these:
- `README.md` - English documentation (root for npm visibility)
- `docs/README.zh-CN.md` - Chinese documentation
- `CLAUDE.md` - Project instructions (this file)
- `docs/CHANGELOG.md` - Main changelog
- `docs/changelog/v1.X.x.md` - Version-specific changelog

## Coworker Validation

Use the documented smoke scripts when changing native coworker runtimes:

- `bun run test:smoke:codex`
- `bun run test:smoke:opencode`
- `bun run test:smoke:coworker`

See [docs/guides/coworker-smoke-tests.md](/Users/axiba/Downloads/Gits/oh-my-claude/docs/guides/coworker-smoke-tests.md) for prerequisites and CI usage.
See [docs/guides/coworker-gui-acceptance.md](/Users/axiba/Downloads/Gits/oh-my-claude/docs/guides/coworker-gui-acceptance.md) for cross-platform GUI acceptance testing.
