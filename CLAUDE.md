# oh-my-claude Development Guide

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
