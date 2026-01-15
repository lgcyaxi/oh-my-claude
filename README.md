# oh-my-claude

Multi-agent orchestration plugin for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) with multi-provider support.

Bring the power of specialized AI agents working together to your Claude Code sessions. Inspired by [oh-my-opencode](https://github.com/nicepkg/opencode).

## Features

- **8 Specialized Agents** - Each optimized for specific tasks
- **Multi-Provider Support** - Use Claude subscription + DeepSeek, ZhiPu GLM, MiniMax
- **Background Tasks** - Run async operations via MCP server
- **Smart Delegation** - Sisyphus orchestrates work to the right specialist
- **Parallel Execution** - Maximum throughput with concurrent agents
- **Hook Integration** - Code quality checks and todo tracking

## Agent Roles

| Agent | Provider | Model | Role |
|-------|----------|-------|------|
| **Sisyphus** | Claude | claude-opus-4-5 | Primary orchestrator, full implementation |
| **Claude-Reviewer** | Claude | claude-sonnet-4-5 | Code review, test verification, QA |
| **Claude-Scout** | Claude | claude-haiku-4-5 | Fast exploration, quick tasks |
| **Oracle** | DeepSeek | deepseek-reasoner | Deep reasoning, architecture advice |
| **Librarian** | ZhiPu | glm-4.7 | External docs, library research |
| **Explore** | DeepSeek | deepseek-chat | Codebase search |
| **Frontend-UI-UX** | ZhiPu | glm-4v-flash | Visual/UI design |
| **Document-Writer** | MiniMax | MiniMax-M2.1 | Documentation, README, guides |

## Installation

### Prerequisites

- [Bun](https://bun.sh/) runtime
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed
- API keys for providers you want to use

### Quick Install

```bash
# Clone the repository
git clone https://github.com/your-username/oh-my-claude.git
cd oh-my-claude

# Install dependencies
bun install

# Build all components
bun run build:all

# Install into Claude Code
bun run install-local
```

### Manual Install via npx (coming soon)

```bash
npx oh-my-claude install
```

## Configuration

### API Keys

Set environment variables for the providers you want to use:

```bash
# DeepSeek (for Oracle, Explore agents)
export DEEPSEEK_API_KEY=your-deepseek-api-key

# ZhiPu GLM (for Librarian, Frontend-UI-UX agents)
export ZHIPU_API_KEY=your-zhipu-api-key

# MiniMax (for Document-Writer agent)
export MINIMAX_API_KEY=your-minimax-api-key

# OpenRouter (optional, for GPT/Grok/Gemini)
export OPENROUTER_API_KEY=your-openrouter-api-key
```

### Configuration File

The configuration file is located at `~/.claude/oh-my-claude.json`:

```json
{
  "providers": {
    "claude": {
      "type": "claude-subscription",
      "note": "Uses Claude Code's native subscription"
    },
    "deepseek": {
      "type": "openai-compatible",
      "base_url": "https://api.deepseek.com/v1",
      "api_key_env": "DEEPSEEK_API_KEY"
    },
    "zhipu": {
      "type": "openai-compatible",
      "base_url": "https://open.bigmodel.cn/api/paas/v4",
      "api_key_env": "ZHIPU_API_KEY"
    },
    "minimax": {
      "type": "openai-compatible",
      "base_url": "https://api.minimax.chat/v1",
      "api_key_env": "MINIMAX_API_KEY"
    }
  },
  "agents": {
    "Sisyphus": { "provider": "claude", "model": "claude-opus-4-5" },
    "oracle": { "provider": "deepseek", "model": "deepseek-reasoner" },
    "librarian": { "provider": "zhipu", "model": "glm-4.7" }
  },
  "concurrency": {
    "default": 5,
    "per_provider": {
      "deepseek": 10,
      "zhipu": 10
    }
  }
}
```

## Usage

### In Claude Code

After installation, agents are available in Claude Code:

```
# Use Sisyphus for complex tasks
@sisyphus Implement user authentication with JWT

# Explore codebase
@claude-scout Where is the database connection handled?

# Get architecture advice via MCP
Use launch_background_task with agent="oracle" to get architecture recommendations
```

### CLI Commands

```bash
# Check installation status
oh-my-claude status

# Diagnose configuration
oh-my-claude doctor

# Reinstall with force
oh-my-claude install --force

# Uninstall
oh-my-claude uninstall
```

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Claude Code Session                               │
├──────────────────────────────────────────────────────────────────────────┤
│  Sisyphus (Primary Agent - Claude Opus 4.5 via Subscription)             │
│         │                                                                 │
│    ┌────┴────┬─────────────────┐                                         │
│    ▼         ▼                 ▼                                         │
│  Task Tool   MCP Server     Hooks                                        │
│  (sync)      (async)        (lifecycle)                                  │
│    │           │                │                                        │
│    ▼           ▼                ▼                                        │
│  Claude      Multi-Provider  settings.json                               │
│  Agents      Router          scripts                                     │
│  (sub.)        │                                                         │
│                ├── DeepSeek API (oracle, explore)                        │
│                ├── ZhiPu GLM API (librarian, frontend-ui-ux)             │
│                ├── MiniMax API (document-writer)                         │
│                └── OpenRouter (optional)                                 │
└──────────────────────────────────────────────────────────────────────────┘
```

### Execution Modes

- **Task Tool (sync)**: Agents using Claude subscription run via Claude Code's native Task tool
- **MCP Server (async)**: External API agents run via MCP background server for parallel execution

## Development

```bash
# Install dependencies
bun install

# Type checking
bun run typecheck

# Build main package
bun run build

# Build MCP server
bun run build:mcp

# Build hook scripts
bun run build:hooks

# Build everything
bun run build:all

# Run tests
bun test
```

## Project Structure

```
oh-my-claude/
├── src/
│   ├── agents/           # Agent definitions with prompts
│   ├── config/           # Configuration schema (Zod)
│   ├── providers/        # Multi-provider API clients
│   ├── mcp/              # Background Agent MCP server
│   ├── hooks/            # Claude Code hook scripts
│   ├── generators/       # Agent .md file generators
│   ├── installer/        # CLI installer
│   └── cli.ts            # CLI entry point
├── bin/oh-my-claude.js   # CLI wrapper
├── dist/                 # Built files
└── package.json
```

## Comparison with oh-my-opencode

| Feature | oh-my-opencode | oh-my-claude |
|---------|----------------|--------------|
| Platform | OpenCode | Claude Code |
| Primary Model | OpenRouter | Claude Subscription |
| External APIs | OpenRouter only | DeepSeek, ZhiPu, MiniMax, OpenRouter |
| Agent Sync | Session API | Task tool |
| Agent Async | Background Agent | MCP Server |
| License | Sustainable Use | MIT |

## Troubleshooting

### "Provider not configured"

Make sure you've set the API key environment variable:
```bash
export DEEPSEEK_API_KEY=your-key
```

### "Agent uses Claude subscription"

Some agents (Sisyphus, Claude-Reviewer, Claude-Scout) use Claude Code's Task tool, not the MCP server. Use them via `@agent-name` in Claude Code.

### MCP server not responding

Rebuild the MCP server:
```bash
bun run build:mcp
oh-my-claude install --force
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- Inspired by [oh-my-opencode](https://github.com/nicepkg/opencode)
- Built for [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- Uses [Model Context Protocol](https://modelcontextprotocol.io/)
