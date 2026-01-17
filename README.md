# oh-my-claude

[English](README.md) | [中文](README.zh-CN.md)

Multi-provider MCP server for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) with specialized agent workflows.

Route background tasks to multiple AI providers (DeepSeek, ZhiPu GLM, MiniMax) via Anthropic-compatible APIs while leveraging Claude Code's native capabilities.

## Features

- **Multi-Provider MCP Server** - Background task execution with DeepSeek, ZhiPu GLM, MiniMax
- **Specialized Agent Workflows** - Pre-configured agents for different task types (Sisyphus, Oracle, Librarian, etc.)
- **Slash Commands** - Quick actions (`/omcx-commit`, `/omcx-implement`) and agent activation (`/omc-sisyphus`, `/omc-plan`)
- **Real-Time StatusLine** - Live status bar showing active agents, task progress, and provider availability
- **Planning System** - Strategic planning with Prometheus agent and boulder-state tracking
- **Official MCP Setup** - One-command installation for Sequential Thinking, MiniMax, and GLM MCPs
- **Concurrent Execution** - Per-provider rate limiting and parallel task management
- **Hook Integration** - Code quality checks, todo tracking, and agent monitoring

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
# DeepSeek (for Oracle, Analyst agents)
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
| `/omc-status` | Display MCP background agent status dashboard |

### Quick Action Commands (`/omcx-*`)

| Command | Description |
|---------|-------------|
| `/omcx-commit` | Smart git commit with conventional format |
| `/omcx-implement` | Implement a feature with best practices |
| `/omcx-refactor` | Refactor code with quality improvements |
| `/omcx-docs` | Generate or update documentation |
| `/omcx-issue` | Report a bug to oh-my-claude GitHub Issues |

### Mode Commands

| Command | Description |
|---------|-------------|
| `/ulw` | **Ultrawork Mode** - Maximum performance, work until done |

#### Ultrawork Mode (`/ulw`)

Ultrawork mode activates **maximum performance execution** with zero-tolerance completion policy:

- **100% Delivery** - No partial completion, no scope reduction, no placeholders
- **Aggressive Parallelization** - Fire multiple agents simultaneously
- **Mandatory Verification** - Code compiles, tests pass, build succeeds
- **Work Until Done** - Continue until ALL tasks are marked complete

**Usage:**
```bash
/ulw implement the authentication system from the plan
/ulw fix all type errors in the codebase
/ulw add comprehensive test coverage for the API
```

**Key Features:**
- Automatically creates comprehensive todo lists
- Uses sync agents (Task tool) and async agents (MCP) in parallel
- Verifies each step before marking complete
- Boulder state persistence for session continuity

## Real-Time StatusLine

oh-my-claude provides a real-time status bar that shows active agents and provider availability directly in Claude Code.

### Status Display

```
omc ready | DS: 10 ZP: 10 MM: 5                    # Idle - showing available slots
omc [Oracle: 32s] [@Scout: 15s] | DS: 1/10 ...    # Active tasks with elapsed time
```

### Legend

- **omc ready** - System is ready, no active tasks
- **[Oracle: 32s]** - MCP background agent running (via external API)
- **[@Scout: 15s]** - Task tool agent running (via Claude subscription)
- **DS: 1/10** - DeepSeek: 1 active / 10 max concurrent slots
- **ZP: 0/10** - ZhiPu: 0 active / 10 max concurrent
- **MM: 0/5** - MiniMax: 0 active / 5 max concurrent

### CLI Control

```bash
npx @lgcyaxi/oh-my-claude statusline --status    # Check statusline status
npx @lgcyaxi/oh-my-claude statusline --enable    # Enable statusline
npx @lgcyaxi/oh-my-claude statusline --disable   # Disable statusline
```

### Multi-Line Support

When you have an existing statusline (like CCometixLine), oh-my-claude automatically creates a wrapper that shows both on separate lines.

## Agent Workflows

oh-my-claude provides two types of agents:

### Claude Code Built-in Agents (Task Tool)

These agents run via Claude Code's native Task tool. **Model selection is controlled by Claude Code internally** - we cannot change which model is used.

| Agent | Role | Invocation |
|-------|------|------------|
| **Sisyphus** | Primary orchestrator | `/omc-sisyphus` |
| **Claude-Reviewer** | Code review, QA | `/omc-reviewer` |
| **Claude-Scout** | Fast exploration | `/omc-scout` |
| **Prometheus** | Strategic planning | `/omc-plan` |
| **Explore** | Codebase search | `Task(subagent_type="Explore")` |

### MCP Background Agents (External APIs)

These agents run via oh-my-claude's MCP server using external API providers. **We control model selection** via configuration.

| Agent | Provider | Model | Role |
|-------|----------|-------|------|
| **Oracle** | DeepSeek | deepseek-reasoner | Deep reasoning |
| **Analyst** | DeepSeek | deepseek-chat | Quick code analysis |
| **Librarian** | ZhiPu | glm-4.7 | External research |
| **Frontend-UI-UX** | ZhiPu | glm-4v-flash | Visual/UI design |
| **Document-Writer** | MiniMax | MiniMax-M2.1 | Documentation |

**Invocation:** `launch_background_task(agent="oracle", prompt="...")` or `execute_agent(agent="oracle", prompt="...")`

> **Note:** If a provider's API key is not configured, tasks using that provider will fail. Set the required environment variable (e.g., `DEEPSEEK_API_KEY`) before using agents that depend on it.

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

# StatusLine
npx @lgcyaxi/oh-my-claude statusline --status  # Check statusline status
npx @lgcyaxi/oh-my-claude statusline --enable  # Enable statusline
npx @lgcyaxi/oh-my-claude statusline --disable # Disable statusline
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
