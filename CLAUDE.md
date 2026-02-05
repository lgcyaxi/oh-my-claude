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
- `src/memory/` - Markdown-first memory system (types, store, parser, search)
- `src/statusline/` - StatusLine segments and configuration
- `src/proxy/` - Live model switching HTTP proxy (server, handler, control, state, auth, stream)

## Architecture

- **Task Tool Agents** (Claude subscription): Sisyphus, Claude-Reviewer, Claude-Scout
- **MCP Background Agents** (external APIs): Oracle, Librarian, Explore, Frontend-UI-UX, Document-Writer

## Conventions

- Use Bun runtime (not Node.js)
- All API clients are OpenAI-compatible
- Agent prompts are in their respective `src/agents/*.ts` files
- Configuration is validated with Zod schema

## Testing Installation

```bash
bun run install-local  # Build and install to ~/.claude/
oh-my-claude doctor    # Verify configuration
```

## Slash Commands

Commands are defined in `src/commands/`:

- **Agent Commands (`/omc-*`)**: Activate specific agents (sisyphus, oracle, librarian, switch, etc.)
- **Action Commands (`/omcx-*`)**: Quick actions (commit, implement, refactor, docs)
- **Mode Commands**: `/ulw` (Ultrawork - maximum performance, work until done)
- **Switch Command**: `/omc-switch` switches models via proxy (shortcuts: ds, ds-r, zp, mm)

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

## Key Files

- `src/config/loader.ts` - Config loading and provider resolution
- `src/providers/router.ts` - Routes requests to providers (routeByAgent, routeByCategory, routeByModel)
- `src/mcp/background-agent-server/server.ts` - MCP server implementation
- `src/styles/index.ts` - Output style manager (list, set, reset, create)
- `src/memory/index.ts` - Memory system barrel export (store, parser, search)
- `src/statusline/config.ts` - StatusLine config and segment management (9 segments)
- `src/statusline/segments/memory.ts` - Memory statusline segment
- `src/statusline/segments/proxy.ts` - Proxy statusline segment
- `src/proxy/server.ts` - Proxy server entry point (Bun.serve dual server)
- `src/proxy/handler.ts` - Proxy request handler (passthrough vs switched routing)
- `src/proxy/control.ts` - Proxy control API (health, status, switch, revert)
- `src/proxy/state.ts` - Signal file IPC (proxy-switch.json)
- `src/proxy/auth.ts` - Proxy auth (dual mode: api-key / oauth)
- `src/hooks/memory-awareness.ts` - UserPromptSubmit hook for proactive memory usage
- `src/commands/omc-switch.md` - Slash command for model switching with aliases
- `bin/oh-my-claude.js` - CLI entry point (uses pathToFileURL for Windows compatibility)

## Documentation Convention

When adding new features, always update ALL of these:
- `README.md` - English documentation (root for npm visibility)
- `docs/README.zh-CN.md` - Chinese documentation
- `CLAUDE.md` - Project instructions (this file)
- `docs/CHANGELOG.md` - Main changelog
- `docs/changelog/v1.X.x.md` - Version-specific changelog
