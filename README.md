# oh-my-claude

[English](README.md) | [中文](README.zh-CN.md)

Multi-provider MCP server for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) with specialized agent workflows.

Route background tasks to multiple AI providers (DeepSeek, ZhiPu GLM, MiniMax) via Anthropic-compatible APIs while leveraging Claude Code's native capabilities.

## Features

- **Multi-Provider MCP Server** - Background task execution with DeepSeek, ZhiPu GLM, MiniMax
- **Concurrent Background Tasks** - Run multiple agents in parallel with configurable limits
- **Specialized Agent Workflows** - Pre-configured agents for different task types (Sisyphus, Oracle, Librarian, etc.)
- **Slash Commands** - Quick actions (`/omcx-commit`, `/omcx-implement`) and agent activation (`/omc-sisyphus`, `/omc-plan`)
- **Real-Time StatusLine** - Live status bar showing active agents, task progress, and concurrency slots
- **Planning System** - Strategic planning with Prometheus agent and boulder-state tracking
- **Official MCP Setup** - One-command installation for Sequential Thinking, MiniMax, and GLM MCPs
- **Hook Integration** - Code quality checks, todo tracking, and agent monitoring
- **Output Style Manager** - Switch between built-in and custom output styles via CLI
- **Memory System** - Persistent markdown-based memory with MCP tools (remember, recall, forget)
- **Live Model Switching** - HTTP proxy for in-conversation model switching to external providers (DeepSeek, ZhiPu, MiniMax)
- **Companion Tools** - One-command setup for UI UX Pro Max, CCometixLine, and more

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
# DeepSeek (for Analyst agent)
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
| `/omc-switch` | Switch model to external provider (e.g., `/omc-switch ds-r 3`) |

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

oh-my-claude provides a segment-based statusline that shows rich information directly in Claude Code.

### Example Output

```
omc [opus-4.5] [dev*↑2] [oh-my-claude] [45% 89k/200k] [79% 7d:4%] [eng-pro] [⠙ Oracle: 32s]
     │          │        │              │              │           │          │
     │          │        │              │              │           │          └─ MCP tasks
     │          │        │              │              │           └─ Output style
     │          │        │              │              └─ API quota (5h/7d)
     │          │        │              └─ Context tokens (used/limit)
     │          │        └─ Project name
     │          └─ Git branch (* = dirty, ↑2 = ahead)
     └─ Model name
```

### Segments

| Segment | Description | Example |
|---------|-------------|---------|
| **Model** | Current Claude model | `[opus-4.5]` |
| **Git** | Branch + status | `[dev*↑2]` (dirty, 2 ahead) |
| **Directory** | Project name | `[oh-my-claude]` |
| **Context** | Token usage % | `[45% 89k/200k]` |
| **Session** | API quota usage | `[79% 7d:4%]` (5-hour/7-day) |
| **Output Style** | Current style | `[eng-pro]` |
| **MCP** | Background tasks | `[⠙ Oracle: 32s]` |
| **Memory** | Memory store count | `[mem:5]` |
| **Proxy** | Model switch state | `[→DS/R ×2]` |

### Presets

Configure in `~/.config/oh-my-claude/statusline.json`:

| Preset | Segments |
|--------|----------|
| **minimal** | Git, Directory |
| **standard** | Model, Git, Directory, Context, Session, MCP |
| **full** | All segments (including Output Style, Memory, Proxy) |

```json
{
  "enabled": true,
  "preset": "standard",
  "segments": {
    "model": { "enabled": false, "position": 1 },
    "git": { "enabled": true, "position": 2 },
    "directory": { "enabled": true, "position": 3 },
    "context": { "enabled": false, "position": 4 },
    "session": { "enabled": true, "position": 5 },
    "output-style": { "enabled": false, "position": 6 },
    "mcp": { "enabled": true, "position": 7 }
  },
  "style": {
    "separator": " ",
    "brackets": true,
    "colors": true
  }
}
```

### Semantic Colors

- 🟢 **Green** - Good (clean git, low usage)
- 🟡 **Yellow** - Warning (dirty git, 50-80% usage)
- 🔴 **Red** - Critical (>80% usage)
- 🔵 **Cyan** - Neutral (directory, info)

### CLI Control

```bash
# Check status
npx @lgcyaxi/oh-my-claude statusline --status    # Check statusline status

# Enable/Disable
npx @lgcyaxi/oh-my-claude statusline --enable    # Enable statusline
npx @lgcyaxi/oh-my-claude statusline --disable   # Disable statusline

# Change preset
npx @lgcyaxi/oh-my-claude statusline preset minimal   # Set minimal preset
npx @lgcyaxi/oh-my-claude statusline preset standard  # Set standard preset
npx @lgcyaxi/oh-my-claude statusline preset full      # Set full preset (default)

# Toggle individual segments
npx @lgcyaxi/oh-my-claude statusline toggle model on      # Enable model segment
npx @lgcyaxi/oh-my-claude statusline toggle output-style  # Toggle output-style
npx @lgcyaxi/oh-my-claude statusline toggle context off   # Disable context segment
```

**Available segments:** `model`, `git`, `directory`, `context`, `session`, `output-style`, `mcp`, `memory`, `proxy`

### Multi-Line Support

When you have an existing statusline (like CCometixLine), oh-my-claude automatically creates a wrapper that shows both on separate lines.

## Output Styles

oh-my-claude ships with built-in output style presets that customize Claude Code's response behavior.

### Built-in Presets

| Style | Description |
|-------|-------------|
| **engineer-professional** | SOLID/KISS/DRY/YAGNI principles, professional engineering output |
| **agent** | Autonomous agent mode — minimal narration, maximum action |
| **concise-coder** | Code-first, no explanations unless asked |
| **teaching** | Educational — explains concepts, reasoning, and trade-offs |
| **review** | Code review focused with severity levels |

### CLI Commands

```bash
# List available styles
npx @lgcyaxi/oh-my-claude style list

# Switch output style
npx @lgcyaxi/oh-my-claude style set agent

# Show style content
npx @lgcyaxi/oh-my-claude style show teaching

# Reset to Claude default
npx @lgcyaxi/oh-my-claude style reset

# Create a custom style
npx @lgcyaxi/oh-my-claude style create my-style
```

### Custom Styles

Create your own styles in `~/.claude/output-styles/`:

```bash
oh-my-claude style create my-custom-style
# Edit ~/.claude/output-styles/my-custom-style.md
oh-my-claude style set my-custom-style
```

Style files use YAML frontmatter + markdown body:

```markdown
---
name: my-custom-style
description: My custom output style
---

# My Custom Style

Define your style instructions here...
```

## Memory System

oh-my-claude includes a markdown-first memory system that persists knowledge across sessions. Memories are stored as human-readable `.md` files — git-friendly, human-editable, and always rebuildable.

### Storage Layout

```
~/.claude/oh-my-claude/memory/
├── sessions/    # Auto-archived session summaries
└── notes/       # User-created persistent memories
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `remember` | Store a memory with optional title, type, and tags |
| `recall` | Search memories by text query with relevance scoring |
| `forget` | Delete a specific memory by ID |
| `list_memories` | Browse memories with type and date filters |
| `memory_status` | Show memory store statistics |

### CLI Commands

```bash
oh-my-claude memory status              # Show memory stats
oh-my-claude memory search <query>      # Search memories
oh-my-claude memory list [--type note]  # List memories
oh-my-claude memory show <id>           # Show memory content
oh-my-claude memory delete <id>         # Delete a memory
```

### Memory File Format

Each memory is a markdown file with YAML frontmatter:

```markdown
---
title: Team prefers functional components
type: note
tags: [pattern, react, convention]
created: 2026-01-29T10:00:00.000Z
updated: 2026-01-29T10:00:00.000Z
---

The team prefers functional components with hooks over class components.
Use `useState` and `useEffect` instead of class lifecycle methods.
```

## Live Model Switching

oh-my-claude includes an HTTP proxy that enables **in-conversation model switching** — temporarily route Claude Code's API calls to external providers (DeepSeek, ZhiPu, MiniMax) without losing conversation context.

### How It Works

```
  Claude Code
       │  ANTHROPIC_BASE_URL=http://localhost:18910
       ▼
  ┌─────────────────────────────────────────────┐
  │  oh-my-claude Proxy (localhost:18910)        │
  │                                              │
  │  switched=false?  → Passthrough to Anthropic │
  │  switched=true?   → Forward to provider      │
  │                     (DeepSeek/ZhiPu/MiniMax) │
  └─────────────────────────────────────────────┘
```

All target providers use **Anthropic-compatible** `/v1/messages` endpoints. The proxy only rewrites: target host, API key header, and model field — no format translation needed.

### Quick Start

```bash
# 1. Enable proxy
oh-my-claude proxy enable

# 2. Start proxy server
oh-my-claude proxy start

# 3. Set environment variable (printed by proxy start)
export ANTHROPIC_BASE_URL=http://localhost:18910   # Linux/macOS
set ANTHROPIC_BASE_URL=http://localhost:18910      # Windows

# 4. Use Claude Code normally — all requests pass through to Anthropic
```

> **Windows**: Proxy CLI is fully cross-platform. Health checks use Node's `http` module (no `curl` dependency), and process management uses PID files with `wmic` fallback (no `pgrep` dependency).

### Switching Models

**Via slash command** (easiest — in a Claude Code conversation):
```
/omc-switch ds-r 3          # 3 requests via DeepSeek Reasoner
/omc-switch deepseek deepseek-chat
/omc-switch zhipu glm-4.7 5
/omc-switch revert           # switch back to native Claude
```

**Shortcut aliases:**

| Shortcut | Provider | Model |
|----------|----------|-------|
| `ds` | deepseek | deepseek-chat |
| `ds-r` | deepseek | deepseek-reasoner |
| `zp` | zhipu | glm-4.7 |
| `mm` | minimax | MiniMax-M2.1 |

**Via MCP tool:**
```
switch_model(provider="deepseek", model="deepseek-chat", requests=3)
```

**Via CLI:**
```bash
oh-my-claude proxy switch deepseek deepseek-chat
```

**Via Control API:**
```bash
curl -X POST http://localhost:18911/switch \
  -H "Content-Type: application/json" \
  -d '{"provider":"deepseek","model":"deepseek-chat","requests":3}'
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `switch_model` | Switch next N requests to external provider |
| `switch_status` | Query current proxy switch state |
| `switch_revert` | Immediately revert to native Claude |

### Safety Features

- **Auto-Revert**: After N requests (default: 1), automatically returns to native Claude
- **Slash Command Overhead Skip**: First 2 requests after switch are not counted (accounts for slash command internal API calls)
- **Timeout**: Switch expires after timeout (default: 10 minutes)
- **Graceful Fallback**: If provider API key is missing, silently falls back to native Claude
- **Error Recovery**: Provider request failures fall back to native Claude
- **Opt-In**: Proxy is disabled by default, must explicitly enable

### Proxy CLI Commands

```bash
oh-my-claude proxy start                          # Start proxy daemon
oh-my-claude proxy stop                           # Stop proxy daemon
oh-my-claude proxy status                         # Show proxy state
oh-my-claude proxy enable                         # Enable in config
oh-my-claude proxy disable                        # Disable in config
oh-my-claude proxy switch <provider> <model>      # Manual model switch
```

### Configuration

Add to `~/.claude/oh-my-claude.json`:

```json
{
  "proxy": {
    "port": 18910,
    "controlPort": 18911,
    "defaultRequests": 1,
    "defaultTimeoutMs": 600000,
    "enabled": false
  }
}
```

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
| **Oracle** | Claude | claude-sonnet-4.5 | Deep reasoning |
| **Analyst** | DeepSeek | deepseek-chat | Quick code analysis |
| **Librarian** | ZhiPu | glm-4.7 | External research |
| **Frontend-UI-UX** | ZhiPu | glm-4v-flash | Visual/UI design |
| **Document-Writer** | MiniMax | MiniMax-M2.1 | Documentation |

**Invocation:** `launch_background_task(agent="oracle", prompt="...")` or `execute_agent(agent="oracle", prompt="...")`

**Direct Model Access:** `execute_with_model(provider="deepseek", model="deepseek-reasoner", prompt="...")` — bypasses agent routing for token-efficient direct model calls.

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
npx @lgcyaxi/oh-my-claude statusline --status   # Check statusline status
npx @lgcyaxi/oh-my-claude statusline --enable   # Enable statusline
npx @lgcyaxi/oh-my-claude statusline --disable  # Disable statusline
npx @lgcyaxi/oh-my-claude statusline preset <name>     # Set preset (minimal/standard/full)
npx @lgcyaxi/oh-my-claude statusline toggle <segment>  # Toggle segment on/off

# Output Styles
npx @lgcyaxi/oh-my-claude style list            # List available styles
npx @lgcyaxi/oh-my-claude style set <name>      # Switch output style
npx @lgcyaxi/oh-my-claude style show [name]     # Show style content
npx @lgcyaxi/oh-my-claude style reset           # Reset to Claude default
npx @lgcyaxi/oh-my-claude style create <name>   # Create custom style

# Memory
npx @lgcyaxi/oh-my-claude memory status          # Show memory stats
npx @lgcyaxi/oh-my-claude memory search <query>  # Search memories
npx @lgcyaxi/oh-my-claude memory list             # List all memories
npx @lgcyaxi/oh-my-claude memory show <id>        # Show memory content
npx @lgcyaxi/oh-my-claude memory delete <id>      # Delete a memory

# Proxy (Live Model Switching)
npx @lgcyaxi/oh-my-claude proxy start             # Start proxy daemon
npx @lgcyaxi/oh-my-claude proxy stop              # Stop proxy daemon
npx @lgcyaxi/oh-my-claude proxy status            # Show proxy state
npx @lgcyaxi/oh-my-claude proxy enable            # Enable proxy in config
npx @lgcyaxi/oh-my-claude proxy disable           # Disable proxy in config
npx @lgcyaxi/oh-my-claude proxy switch <p> <m>    # Switch to provider/model
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
    "oracle": { "provider": "claude", "model": "claude-sonnet-4.5" },
    "librarian": { "provider": "zhipu", "model": "glm-4.7" }
  },
  "concurrency": {
    "global": 10,
    "per_provider": {
      "deepseek": 5,
      "zhipu": 5,
      "minimax": 3
    }
  }
}
```

### Concurrency Settings

Control how many background tasks can run in parallel:

- **global**: Maximum concurrent tasks across all providers (default: 10)
- **per_provider**: Per-provider limits to prevent rate limiting

When limits are reached, new tasks queue and start automatically when slots free up.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Claude Code Session                               │
├──────────────────────────────────────────────────────────────────────────┤
│  Primary Agent (Claude via Subscription)                                  │
│         │                                                                 │
│    ┌────┴────┬─────────────────┬──────────────┐                          │
│    ▼         ▼                 ▼              ▼                          │
│  Task Tool   MCP Server     Hooks          Proxy                         │
│  (sync)      (async)        (lifecycle)    (intercept)                   │
│    │           │                │              │                          │
│    ▼           ▼                ▼              ▼                          │
│  Claude      Multi-Provider  settings.json  API Request Router           │
│  Subagents   Router          scripts          │                          │
│                │                         ┌────┴────┐                     │
│                │                         ▼         ▼                     │
│                ├── DeepSeek          Anthropic   External                 │
│                ├── ZhiPu GLM        (default)   Provider                 │
│                ├── MiniMax                       (switched)               │
│                └── OpenRouter                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

### Execution Modes

- **Task Tool (sync)**: Claude subscription agents run via Claude Code's native Task tool
- **MCP Server (async)**: External API agents run via MCP for parallel background execution
- **Proxy (intercept)**: HTTP proxy intercepts Claude Code's native API calls for live model switching

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
