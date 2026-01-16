# oh-my-claude

[English](README.md) | [中文](README.zh-CN.md)

Multi-provider MCP server for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) with specialized agent workflows.

Route background tasks to multiple AI providers (DeepSeek, ZhiPu GLM, MiniMax) via Anthropic-compatible APIs while leveraging Claude Code's native capabilities.

## Features

- **Multi-Provider MCP Server** - Background task execution with DeepSeek, ZhiPu GLM, MiniMax
- **Specialized Agent Workflows** - Pre-configured agents for different task types (Sisyphus, Oracle, Librarian, etc.)
- **Slash Commands** - Quick actions (`/omcx-commit`, `/omcx-implement`) and agent activation (`/omc-sisyphus`, `/omc-plan`)
- **Planning System** - Strategic planning with Prometheus agent and boulder-state tracking
- **Official MCP Setup** - One-command installation for Sequential Thinking, MiniMax, and GLM MCPs
- **Concurrent Execution** - Per-provider rate limiting and parallel task management
- **Hook Integration** - Code quality checks and todo tracking

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) runtime
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed
- API keys for providers you want to use

### Installation

```bash
# Install from npm (recommended)
npx @lgcyaxi/oh-my-claude install

# Or clone and install locally
git clone https://github.com/lgcyaxi/oh-my-claude.git
cd oh-my-claude
bun install && bun run build:all
bun run install-local
```

### Set API Keys

```bash
# DeepSeek (for Oracle, Explore agents)
export DEEPSEEK_API_KEY=your-deepseek-api-key

# ZhiPu GLM (for Librarian, Frontend-UI-UX agents)
export ZHIPU_API_KEY=your-zhipu-api-key

# MiniMax (for Document-Writer agent)
export MINIMAX_API_KEY=your-minimax-api-key
```

### Setup Official MCP Servers

```bash
# Install all official MCP servers (Sequential Thinking, MiniMax, GLM)
npx @lgcyaxi/oh-my-claude setup-mcp

# Or install specific ones
npx @lgcyaxi/oh-my-claude setup-mcp --thinking  # Sequential Thinking only
npx @lgcyaxi/oh-my-claude setup-mcp --minimax   # MiniMax only
npx @lgcyaxi/oh-my-claude setup-mcp --glm       # GLM/ZhiPu servers only

# List available MCP servers
npx @lgcyaxi/oh-my-claude setup-mcp --list
```

### Verify Installation

```bash
# Check installation status
npx @lgcyaxi/oh-my-claude status

# Diagnose configuration (with detailed component status)
npx @lgcyaxi/oh-my-claude doctor --detail
```

## Slash Commands

### Agent Commands (`/omc-*`)

| Command | Description |
|---------|-------------|
| `/omc-sisyphus` | Activate Sisyphus - full implementation orchestrator |
| `/omc-oracle` | Activate Oracle - deep reasoning and architecture |
| `/omc-librarian` | Activate Librarian - external research and docs |
| `/omc-reviewer` | Activate Claude-Reviewer - code review and QA |
| `/omc-scout` | Activate Claude-Scout - fast exploration |
| `/omc-explore` | Activate Explore - codebase search |
| `/omc-plan` | Start strategic planning with Prometheus |
| `/omc-start-work` | Begin work on an existing plan |

### Quick Action Commands (`/omcx-*`)

| Command | Description |
|---------|-------------|
| `/omcx-commit` | Smart git commit with conventional format |
| `/omcx-implement` | Implement a feature with best practices |
| `/omcx-refactor` | Refactor code with quality improvements |
| `/omcx-docs` | Generate or update documentation |

## Agent Workflows

| Agent | Provider | Model | Role | Fallback |
|-------|----------|-------|------|----------|
| **Sisyphus** | Claude (Task tool) | claude-opus-4-5 | Primary orchestrator | - |
| **Claude-Reviewer** | Claude (Task tool) | claude-sonnet-4-5 | Code review, QA | - |
| **Claude-Scout** | Claude (Task tool) | claude-haiku-4-5 | Fast exploration | - |
| **Prometheus** | Claude (Task tool) | claude-opus-4-5 | Strategic planning | - |
| **Oracle** | DeepSeek (MCP) | deepseek-reasoner | Deep reasoning | claude-opus-4-5 |
| **Librarian** | ZhiPu (MCP) | glm-4.7 | External research | claude-sonnet-4-5 |
| **Explore** | DeepSeek (MCP) | deepseek-chat | Codebase search | claude-haiku-4-5 |
| **Frontend-UI-UX** | ZhiPu (MCP) | glm-4v-flash | Visual/UI design | claude-sonnet-4-5 |
| **Document-Writer** | MiniMax (MCP) | MiniMax-M2.1 | Documentation | claude-sonnet-4-5 |

### Automatic Fallback

MCP agents automatically fall back to Claude models when the provider's API key is not configured:

- **Oracle** → `claude-opus-4-5` (preserves deep reasoning capability)
- **Librarian** → `claude-sonnet-4-5` (balanced research capability)
- **Explore** → `claude-haiku-4-5` (fast search operations)
- **Frontend-UI-UX** → `claude-sonnet-4-5` (quality visual design)
- **Document-Writer** → `claude-sonnet-4-5` (quality documentation)

This allows oh-my-claude to work with Claude Code's subscription even without external API keys.

## Official MCP Servers

The `setup-mcp` command installs these official MCP servers:

| Server | Provider | Description | API Key Required |
|--------|----------|-------------|------------------|
| **sequential-thinking** | Anthropic | Structured problem-solving | No |
| **MiniMax** | MiniMax | Coding plan assistance | MINIMAX_API_KEY |
| **web-reader** | ZhiPu GLM | Web content extraction | ZHIPU_API_KEY |
| **web-search-prime** | ZhiPu GLM | Web search | ZHIPU_API_KEY |
| **zread** | ZhiPu GLM | GitHub repository reader | ZHIPU_API_KEY |
| **zai-mcp-server** | ZhiPu GLM | Image/video analysis | ZHIPU_API_KEY |

## CLI Commands

```bash
# Installation
npx @lgcyaxi/oh-my-claude install              # Install oh-my-claude
npx @lgcyaxi/oh-my-claude install --force      # Force reinstall
npx @lgcyaxi/oh-my-claude install --skip-mcp   # Skip MCP server setup

# Update
npx @lgcyaxi/oh-my-claude update               # Update to latest version
npx @lgcyaxi/oh-my-claude update --check       # Check for updates only
npx @lgcyaxi/oh-my-claude update --force       # Force reinstall latest

# Status & Diagnostics
npx @lgcyaxi/oh-my-claude status               # Check installation status
npx @lgcyaxi/oh-my-claude doctor               # Diagnose configuration
npx @lgcyaxi/oh-my-claude doctor --detail      # Detailed component status
npx @lgcyaxi/oh-my-claude doctor --no-color    # Disable colored output

# MCP Server Setup
npx @lgcyaxi/oh-my-claude setup-mcp            # Install all official MCPs
npx @lgcyaxi/oh-my-claude setup-mcp --list     # List available MCPs
npx @lgcyaxi/oh-my-claude setup-mcp --thinking # Sequential Thinking only
npx @lgcyaxi/oh-my-claude setup-mcp --minimax  # MiniMax only
npx @lgcyaxi/oh-my-claude setup-mcp --glm      # GLM/ZhiPu servers only

# Uninstall
npx @lgcyaxi/oh-my-claude uninstall            # Remove oh-my-claude
npx @lgcyaxi/oh-my-claude uninstall --keep-config  # Keep config file
```

## Configuration

Configuration file: `~/.claude/oh-my-claude.json`

```json
{
  "providers": {
    "claude": {
      "type": "claude-subscription",
      "note": "Uses Claude Code's native subscription"
    },
    "deepseek": {
      "type": "anthropic-compatible",
      "base_url": "https://api.deepseek.com/anthropic",
      "api_key_env": "DEEPSEEK_API_KEY"
    },
    "zhipu": {
      "type": "anthropic-compatible",
      "base_url": "https://open.bigmodel.cn/api/anthropic",
      "api_key_env": "ZHIPU_API_KEY"
    },
    "minimax": {
      "type": "anthropic-compatible",
      "base_url": "https://api.minimaxi.com/anthropic",
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
      "zhipu": 10,
      "minimax": 5
    }
  }
}
```

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Claude Code Session                               │
├──────────────────────────────────────────────────────────────────────────┤
│  Primary Agent (Claude via Subscription)                                  │
│         │                                                                 │
│    ┌────┴────┬─────────────────┐                                         │
│    ▼         ▼                 ▼                                         │
│  Task Tool   MCP Server     Hooks                                        │
│  (sync)      (async)        (lifecycle)                                  │
│    │           │                │                                        │
│    ▼           ▼                ▼                                        │
│  Claude      Multi-Provider  settings.json                               │
│  Subagents   Router          scripts                                     │
│                │                                                         │
│                ├── DeepSeek (Anthropic-compatible)                       │
│                ├── ZhiPu GLM (Anthropic-compatible)                      │
│                ├── MiniMax (Anthropic-compatible)                        │
│                └── OpenRouter (OpenAI-compatible, optional)              │
└──────────────────────────────────────────────────────────────────────────┘
```

### Execution Modes

- **Task Tool (sync)**: Claude subscription agents run via Claude Code's native Task tool
- **MCP Server (async)**: External API agents run via MCP for parallel background execution

## Development

```bash
# Install dependencies
bun install

# Type checking
bun run typecheck

# Build everything
bun run build:all

# Run tests
bun test

# Install locally for development
bun run install-local
```

## Troubleshooting

### "Provider not configured"

Make sure you've set the API key environment variable:
```bash
export DEEPSEEK_API_KEY=your-key
```

### "Agent uses Claude subscription"

Some agents use Claude Code's Task tool, not the MCP server. These run synchronously within Claude Code.

### MCP server not responding

Rebuild the MCP server:
```bash
bun run build:mcp
npx @lgcyaxi/oh-my-claude install --force
```

### Check detailed status

```bash
npx @lgcyaxi/oh-my-claude doctor --detail
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

Sustainable Use License - see [LICENSE](LICENSE) for details.

This project contains agent prompts derived from [oh-my-opencode](https://github.com/nicepkg/opencode). Original agent prompts in `src/agents/original/` are available under MIT License.

## Acknowledgments

- Built for [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- Uses [Model Context Protocol](https://modelcontextprotocol.io/)
- Agent workflow concepts from [oh-my-opencode](https://github.com/nicepkg/opencode)
- Sequential Thinking MCP from [@modelcontextprotocol/server-sequential-thinking](https://www.npmjs.com/package/@modelcontextprotocol/server-sequential-thinking)
