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

- **Agent Commands (`/omc-*`)**: Activate specific agents (sisyphus, oracle, librarian, etc.)
- **Action Commands (`/omcx-*`)**: Quick actions (commit, implement, refactor, docs)
- **Mode Commands**: `/ulw` (Ultrawork - maximum performance, work until done)

When adding new commands:
1. Create `.md` file in `src/commands/`
2. Add to appropriate array in `src/commands/index.ts`
3. Update README documentation

## Fallback System

MCP agents automatically fall back to Claude models when provider API keys are not configured:

- Oracle → claude-opus-4-5
- Librarian → claude-sonnet-4-5
- Explore → claude-haiku-4-5
- Frontend-UI-UX → claude-sonnet-4-5
- Document-Writer → claude-sonnet-4-5

Configuration in `src/config/schema.ts` with `fallback` field on agents.

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

- `src/config/loader.ts` - Config loading with fallback helpers
- `src/providers/router.ts` - Routes requests to providers, handles FallbackRequiredError
- `src/mcp/background-agent-server/server.ts` - MCP server implementation
- `bin/oh-my-claude.js` - CLI entry point (uses pathToFileURL for Windows compatibility)
