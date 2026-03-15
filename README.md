# oh-my-claude

[English](README.md) | [中文](README.zh-CN.md)

Multi-provider MCP server for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) with specialized agent workflows.

Route background tasks to multiple AI providers (DeepSeek, ZhiPu GLM, MiniMax, Kimi, Aliyun, Ollama, OpenRouter) via Anthropic-compatible APIs while leveraging Claude Code's native capabilities.

## Features

- **Multi-Provider MCP Server** - Background task execution with DeepSeek, ZhiPu GLM, MiniMax, Kimi, Aliyun, OpenRouter
- **OAuth Authentication** - One-command login for OpenAI Codex, MiniMax, Kimi, and Aliyun — no API keys needed
- **Concurrent Background Tasks** - Run multiple agents in parallel with configurable limits
- **Specialized Agent Workflows** - Pre-configured agents for different task types (Sisyphus, Oracle, Hephaestus, Librarian, etc.)
- **Native Coworker Runtimes** - Codex and OpenCode with cross-platform viewer, 9 operations, scoped-diff reviews, and live status
- **Slash Commands** - Quick actions (`/omcx-commit`, `/omcx-implement`) and agent activation (`/omc-sisyphus`, `/omc-plan`)
- **Real-Time StatusLine** - Live status bar showing active agents, task progress, and concurrency slots
- **Planning System** - Strategic planning with Prometheus agent and boulder-state tracking
- **Official MCP Setup** - One-command installation for Sequential Thinking, MiniMax, and GLM MCPs
- **Hook Integration** - Code quality checks, todo tracking, and agent monitoring
- **Output Style Manager** - Switch between built-in and custom output styles via CLI
- **Memory Timeline** - Auto-maintained chronological index injected into agent context for cross-session awareness
- **Live Model Switching** - HTTP proxy for in-conversation model switching with 5-priority routing chain: directive(1) → model-driven(2) → session(3) → global(4) → passthrough(5)
- **Route Directive Auto-Routing** - Subagents embed `[omc-route:provider/model]` directives in their prompts; the proxy extracts and routes automatically at Priority 1 — no manual switching needed
- **Unified Agent Architecture** - 11 role agents + 6 provider agents (`@kimi`, `@deepseek`, `@qwen`, etc.) run as native Task tool agents with route directives
- **Semantic Memory** - Three-tier search (hybrid FTS5+vector, FTS5, legacy) with deduplication, snippet-only recall, and structured categories (architecture, convention, decision, debugging, workflow, pattern, reference, session)
- **Terminal Configuration** - One-command WezTerm/tmux setup with zsh auto-detection and cross-platform clipboard
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

# ZhiPu GLM CN (for Librarian agent)
export ZHIPU_API_KEY=your-zhipu-api-key
# ZhiPu GLM Global (Z.ai)
export ZAI_API_KEY=your-zai-api-key

# MiniMax Global (api.minimax.io)
export MINIMAX_API_KEY=your-minimax-api-key
# MiniMax CN (for Document-Writer agent)
export MINIMAX_CN_API_KEY=your-minimax-cn-api-key

# Kimi (for proxy model switching)
export KIMI_API_KEY=your-kimi-api-key

# Aliyun Coding Plan (Qwen models)
export ALIYUN_API_KEY=your-aliyun-api-key

# OpenRouter (free models: hunter-alpha, nemotron-3-super)
export OPENROUTER_API_KEY=your-openrouter-api-key

# Ollama (local, no API key needed — auto-discovered)
# export OLLAMA_HOST=http://localhost:11434  # default, only set if non-standard
```

### OAuth Authentication (Optional)

For providers that support OAuth, you can authenticate without API keys (OpenAI, MiniMax, Kimi, Aliyun).

<details>
<summary>View OAuth setup commands</summary>

```bash
# OpenAI (for Codex coworker)
oh-my-claude auth login openai
oh-my-claude auth login openai --headless  # For SSH/remote environments

# MiniMax (for quota display)
oh-my-claude auth login minimax  # Opens browser for QR code login

# Aliyun Bailian (for Coding Plan quota display)
oh-my-claude auth login aliyun   # Opens browser for Aliyun console login

# Kimi (for quota display)
oh-my-claude auth login kimi     # Opens browser for Kimi login

# List authenticated providers
oh-my-claude auth list
```

Once authenticated, use `/omc-switch ds` (DeepSeek), `/omc-switch g5` (ZhiPu GLM-5), or `/omc-switch km` (Kimi) to route requests through these providers.

</details>

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

### Guides

- [Codex App-Server Guide](docs/guides/codex-app-server.md)
- [Coworker Architecture](docs/guides/orchestrator-architecture.md)
- [Coworker GUI Acceptance](docs/guides/coworker-gui-acceptance.md)
- [Coworker Protocol Coverage](docs/guides/coworker-protocol-coverage.md)
- [Coworker Smoke Tests](docs/guides/coworker-smoke-tests.md)

## Slash Commands

oh-my-claude provides slash commands for quick actions (`/omcx-*`) and agent activation (`/omc-*`).

<details>
<summary>View all slash commands</summary>

### Agent Commands (`/omc-*`)

| Command | Description |
|---------|-------------|
| `/omc-sisyphus` | Activate Sisyphus - full implementation orchestrator |
| `/omc-plan` | Start strategic planning with Prometheus |
| `/omc-start-work` | Begin work on an existing plan |
| `/omc-status` | Display proxy + coworker status via `coworker_task(action="status")` |
| `/omc-switch` | Switch model to external provider (e.g., `/omc-switch ds-r`) |
| `/omc-opencode` | Activate OpenCode for refactoring and UI design |
| `/omc-codex` | Assign a self-contained task to the Codex coworker |
| `/omc-pref` | Manage persistent preferences (always/never rules) |
| `/omc-up` | Upvote — mark a response as helpful |
| `/omc-down` | Downvote — mark a response as unhelpful |
| `/omc-pend` | Pending — pause current task for later |
| `/omc-mem-compact` | Compact memories with AI-assisted grouping |
| `/omc-mem-clear` | AI-powered selective memory cleanup |
| `/omc-mem-summary` | Consolidate memories into timeline summary |
| `/omc-mem-daily` | Generate daily narrative from session memories |
| `/omc-ulw` | **Ultrawork Mode** - Maximum performance, work until done |

### Quick Action Commands (`/omcx-*`)

| Command | Description |
|---------|-------------|
| `/omcx-commit` | Smart git commit with conventional format |
| `/omcx-implement` | Implement a feature with best practices |
| `/omcx-refactor` | Refactor code with quality improvements |
| `/omcx-docs` | Generate or update documentation |
| `/omcx-issue` | Report a bug to oh-my-claude GitHub Issues |

#### Ultrawork Mode (`/omc-ulw`)

Ultrawork mode activates **maximum performance execution** with zero-tolerance completion policy:

- **Auto-Accept Permissions** - Prompts user to enable auto-accept before starting
- **100% Delivery** - No partial completion, no scope reduction, no placeholders
- **Aggressive Parallelization** - Fire multiple agents simultaneously
- **Mandatory Verification** - Code compiles, tests pass, build succeeds
- **Work Until Done** - Continue until ALL tasks are marked complete

**Usage:**
```bash
/omc-ulw implement the authentication system from the plan
/omc-ulw fix all type errors in the codebase
/omc-ulw add comprehensive test coverage for the API
```

**Key Features:**
- Requests auto-accept permissions before starting for uninterrupted execution
- Automatically creates comprehensive todo lists
- Uses sync agents (Task tool) and async agents (MCP) in parallel
- Verifies each step before marking complete
- Boulder state persistence for session continuity

</details>

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

<details>
<summary>View segments, presets, and CLI controls</summary>

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
| **Usage** | Provider quota/balance (line 3) | `DS:¥98.5 \| ZP:1%/w:5%/m:2% \| AY:0%/w:1%/m:1%` |
| **Preferences** | Active preference rules | `[pref:3]` |

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

**Available segments:** `model`, `git`, `directory`, `context`, `session`, `output-style`, `mode`, `mcp`, `memory`, `proxy`, `codex`, `usage`, `preferences`

### Multi-Line Support

When you have an existing statusline (like CCometixLine), oh-my-claude automatically creates a wrapper that shows both on separate lines.

</details>

## Output Styles

oh-my-claude ships with built-in output style presets (engineer-professional, agent, concise-coder, teaching, review) that customize Claude Code's response behavior. Switch with `style set <name>`, create custom styles with `style create <name>`.

<details>
<summary>View all styles and CLI commands</summary>

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

</details>

## Memory System

oh-my-claude includes a markdown-first memory system with semantic search that persists knowledge across sessions. Memories are stored as human-readable `.md` files — git-friendly, human-editable, and always rebuildable. A derivative SQLite index provides FTS5 BM25 search + optional vector similarity for context-efficient recall.

<details>
<summary>View memory tools, timeline, embeddings, and file format</summary>

### Storage Scopes

Memories can be stored in two locations:

| Scope | Path | Use Case |
|-------|------|----------|
| **Project** | `.claude/mem/` | Project-specific knowledge (conventions, architecture) |
| **Global** | `~/.claude/oh-my-claude/memory/` | Cross-project knowledge (personal preferences) |

Both locations have the same structure:
```
├── sessions/    # Auto-archived session summaries
└── notes/       # User-created persistent memories
```

**Default behavior:**
- **Read**: Searches both scopes (`--scope all`)
- **Write**: Project scope if in a git repo, otherwise global

### MCP Tools

| Tool | Description |
|------|-------------|
| `remember` | Store a memory with dedup check (exact hash skip, near-duplicate tagging) |
| `recall` | Search memories returning snippets (~300 chars) with relevance scoring |
| `get_memory` | Read full content of a specific memory (drill-down from recall snippets) |
| `forget` | Delete a specific memory by ID (also cleans SQLite index) |
| `list_memories` | Browse memories with type, date, and scope filters |
| `memory_status` | Show memory stats including index health and search tier |
| `compact_memories` | AI-assisted memory compaction (group related memories) |

### Slash Commands

| Command | Description |
|---------|-------------|
| `/omc-mem-compact` | Compact memories with AI-assisted grouping |
| `/omc-mem-clear` | AI-powered selective memory cleanup |
| `/omc-mem-summary` | Consolidate memories into timeline summary |

### CLI Commands

```bash
oh-my-claude memory status                  # Show memory stats
oh-my-claude memory search <query>          # Search memories
oh-my-claude memory list [--scope project]  # List memories (project only)
oh-my-claude memory show <id>               # Show memory content
oh-my-claude memory delete <id>             # Delete a memory
oh-my-claude memory compact                 # Interactive compaction guide
```

### Memory Timeline (Auto-Context)

oh-my-claude auto-maintains a `TIMELINE.md` file that acts as a chronological table of contents for all memories. This gives the AI agent **continuous cross-session awareness** without needing to call `recall()` first.

**How it works:**
1. Every memory mutation (`remember`, `forget`, `compact`, `clear`, `summarize`) regenerates `TIMELINE.md`
2. The memory-awareness hook reads the timeline on each user prompt
3. Timeline content is injected into the agent's system context automatically

**Example timeline:**
```markdown
# Memory Timeline
> 12 memories | Updated: 2026-02-10T15:30:00Z

## Today (Feb 10)
- 15:30 [note] **Proxy thinking block fix** `proxy, bug-fix`
- 14:00 [note] **Summary auto-delete + tags** `memory, enhancement`

## Yesterday (Feb 9)
- 18:45 [session] **Session summary 2026-02-09** `auto-capture`

## This Week (Feb 3-8)
- Feb 7 [note] **Hook duplication fix** `installer, hooks`

## Earlier This Month
3 memories (2 notes, 1 session) | tags: memory, search, indexer

## January 2026
8 memories (5 notes, 3 sessions) | tags: memory, embeddings, proxy
```

**Storage:** `TIMELINE.md` lives at the root of `.claude/mem/` and `~/.claude/oh-my-claude/memory/` — outside `notes/` and `sessions/`, so it's invisible to memory operations (no indexing, no dedup, no listing).

**Auto-scaling:** Entries are progressively collapsed from bottom up (Today/Yesterday = full detail, This Week = capped at 10, Earlier = collapsed summary, Older months = one-line each). Total output is capped at 120 lines.

### Memory Management

**Compaction** — use `/omc-mem-compact` to automatically group and merge related memories:

1. AI analyzes all memories (using ZhiPu → MiniMax → DeepSeek)
2. Suggests merge groups with preview
3. You confirm which groups to compact
4. Creates merged memories and removes originals

### Embedding Provider (Semantic Search)

Semantic search requires an embedding provider. Choose one explicitly in your config:

```json
{
  "memory": {
    "embedding": {
      "provider": "custom"
    }
  }
}
```

| Provider | Config Value | Required Env Var | Model |
|----------|-------------|------------------|-------|
| **Custom** (Ollama, vLLM, LM Studio, etc.) | `"custom"` (default) | `EMBEDDING_API_BASE` | Any OpenAI-compatible |
| **ZhiPu** | `"zhipu"` | `ZHIPU_API_KEY` | `embedding-3` (1024d) |
| **OpenRouter** | `"openrouter"` | `OPENROUTER_API_KEY` | `text-embedding-3-small` (1536d) |
| **Disabled** | `"none"` | — | FTS5-only search (Tier 2) |

**Custom provider** works with any OpenAI-compatible `/v1/embeddings` endpoint:

```bash
# Required: endpoint URL (activates custom provider)
export EMBEDDING_API_BASE=http://localhost:11434/v1

# Optional: model name (default: text-embedding-3-small)
export EMBEDDING_MODEL=qwen3-embedding

# Optional: API key (not needed for local endpoints like Ollama)
export EMBEDDING_API_KEY=your-key

# Optional: dimensions (auto-detected via probe call if not set)
export EMBEDDING_DIMENSIONS=4096
```

If the selected provider can't initialize (missing env var, connection error), the system degrades to FTS5-only keyword search (Tier 2). No silent fallback to another provider — check MCP stderr logs for clear diagnostics.

### Auto-Save (Context Threshold)

Configure automatic memory capture when context usage exceeds a threshold:

```json
{
  "memory": {
    "autoSaveThreshold": 75,
    "aiProviderPriority": ["zhipu", "minimax", "deepseek"]
  }
}
```

Set `autoSaveThreshold` to `0` to disable.

### Memory File Format

Each memory is a markdown file with YAML frontmatter:

```markdown
---
title: Team prefers functional components
type: note
tags: [pattern, react, convention]
category: convention
createdAt: "2026-01-29T10:00:00.000Z"
updatedAt: "2026-01-29T10:00:00.000Z"
---

The team prefers functional components with hooks over class components.
Use `useState` and `useEffect` instead of class lifecycle methods.
```

**Structured Categories:** Memories support taxonomy-based categorization for improved retrieval. Available categories: `architecture`, `convention`, `decision`, `debugging`, `workflow`, `pattern`, `reference`, `session`.

</details>

## Live Model Switching

oh-my-claude includes an HTTP proxy that enables **in-conversation model switching** — temporarily route Claude Code's API calls to external providers (DeepSeek, ZhiPu, MiniMax) without losing conversation context.

### Quick Start

**One-step launch** (recommended):

```bash
oh-my-claude cc                    # Auto-start per-session proxy + launch Claude Code
oh-my-claude cc -r                 # Resume last conversation (OMC shortcut)
oh-my-claude cc -skip              # Dangerously skip permissions (OMC shortcut)
oh-my-claude cc -wt                # Isolated git worktree session (OMC shortcut)
oh-my-claude cc -r -skip           # Combine OMC shortcuts
oh-my-claude cc -rc                # Remote Control mode (mobile via claude.ai/code)
oh-my-claude cc -d                 # Enable debug logging (logs to ~/.claude/oh-my-claude/logs/)
oh-my-claude cc -p ds              # Direct DeepSeek (no proxy, single provider)
oh-my-claude cc -p km              # Direct Kimi (no proxy, single provider)
```

CC session modules use platform-split architecture (`*-unix.ts` / `*-win.ts`) for clean macOS/Linux vs Windows separation.

Each `cc` session gets its own proxy instance with isolated state. Multiple sessions can run simultaneously without interference. In debug mode, if the visible proxy pane fails to spawn (e.g., terminal pane limit reached), the session gracefully falls back to a hidden proxy process.

**OMC shortcuts** use single dash (`-`) to differentiate from Claude Code's native double-dash flags:

| Shortcut | Expands to | Description |
|----------|-----------|-------------|
| `-r` | `--resume` | Resume last conversation |
| `-skip` | `--dangerously-skip-permissions` | Skip permission prompts |
| `-wt` | `--worktree` | Isolated git worktree session |
| `-rc` | `claude remote-control` | Mobile access via claude.ai/code |
Codex and OpenCode are native coworker targets. Use `coworker_task(action="send" | "review" | "diff" | "fork" | "approve" | "revert" | "cancel" | "status" | "recent_activity", ...)` for coworker control. OpenCode accepts explicit `agent`, `provider_id`, and `model_id` overrides. Codex accepts native `approval_policy` values and honors `OMC_CODEX_APPROVAL_POLICY`; supported values are `never`, `on-request`, `on-failure`, `untrusted`, and `reject`. The default Codex behavior is `never`. `on-request` is not an always-ask mode; Codex only opens pending approvals when it decides the action needs approval. For sustained multi-turn provider routing, keep using proxy mode via `oh-my-claude cc`.

For Codex specifically, prefer coworker-style delegation: assign the goal, scope, and completion criteria, then let Codex execute autonomously. Avoid step-by-step task scripts unless the user explicitly asks for them.

**Provider shortcuts for `cc -p`:**

| Shortcut | Provider | Endpoint |
|----------|----------|----------|
| `ds` / `deepseek` | DeepSeek | api.deepseek.com/anthropic |
| `zp` / `zhipu` | ZhiPu (CN) | open.bigmodel.cn/api/anthropic |
| `zai` / `zp-g` | Z.AI (Global) | api.z.ai/api/anthropic |
| `mm` / `minimax` | MiniMax (Global) | api.minimax.io/anthropic |
| `mm-cn` / `minimax-cn` | MiniMax (CN) | api.minimaxi.com/anthropic |
| `km` / `kimi` | Kimi | api.kimi.com/coding |
| `ali` / `aliyun` | Aliyun | coding.dashscope.aliyuncs.com/apps/anthropic |
| `or` / `openrouter` | OpenRouter | openrouter.ai/api |
| `ol` / `ollama` | Ollama (local) | localhost:11434 |

> **Windows**: Proxy CLI is fully cross-platform. Health checks use Node's `http` module (no `curl` dependency).

### Switching Models

**Via slash command** (in a Claude Code conversation):
```
/omc-switch ds-r             # Switch to DeepSeek Reasoner
/omc-switch zp               # Switch to ZhiPu GLM-5
/omc-switch revert           # Switch back to native Claude
```

<details>
<summary>View all model shortcuts, routing details, and proxy CLI</summary>

**Shortcut aliases:**

| Shortcut | Provider | Model |
|----------|----------|-------|
| `ds` | deepseek | deepseek-chat |
| `dr` | deepseek | deepseek-reasoner |
| `g5` | zhipu | glm-5 |
| `mm` | minimax-cn | MiniMax-M2.5 |
| `km` | kimi | kimi-for-coding |
| `q` | aliyun | qwen3.5-plus |
| `qc` | aliyun | qwen3-coder-plus |
| `qn` | aliyun | qwen3-coder-next |
| `g4` | aliyun | glm-4.7 |
| `or` | openrouter | openrouter/hunter-alpha |
| `ol` | ollama | *(auto-discovered)* |

**Via CLI** (session ID supports prefix matching):
```bash
oh-my-claude proxy switch                      # Show sessions and available models
oh-my-claude proxy switch 505a GLM-5           # Switch session 505a... to GLM-5
oh-my-claude proxy switch 505 deep             # Prefix match: deepseek-reasoner
oh-my-claude proxy revert 505a                 # Revert session to native Claude
```

**Via MCP tool:**
```
switch_model(provider="deepseek", model="deepseek-chat")
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `switch_model` | Switch next N requests to external provider |
| `switch_status` | Query current proxy switch state |
| `switch_revert` | Immediately revert to native Claude |

### Route Directive Auto-Routing

The agent generator embeds `[omc-route:provider/model]` directives directly into each agent's prompt text. The proxy extracts this directive at **Priority 1** and routes to the correct provider automatically — no explicit `switch_model` or model-field matching needed.

**5-Priority Routing Chain:**
1. **Directive** — `[omc-route:provider/model]` in prompt text (highest priority)
2. **Model-driven** — non-Claude model ID in request triggers provider lookup
3. **Session** — explicit `switch_model` call for the session
4. **Global** — global proxy switch state
5. **Passthrough** — default to Anthropic

All agents run as native Task tool agents with full Claude Code tool access (Edit, Write, Bash, Glob, Grep). Claude-native agents (no directive) pass through to Anthropic as usual.

| Agent | Model | Routing |
|-------|-------|---------|
| Oracle | *(Claude native)* | Passthrough (dual-mode) |
| Analyst | qwen3.5-plus | Directive → Aliyun |
| Librarian | glm-5 | Directive → ZhiPu |
| Navigator | *(Claude native)* | Passthrough (dual-mode) |
| Hephaestus | *(Claude native)* | Passthrough (dual-mode) |
| Document-Writer | MiniMax-M2.5 | Directive → MiniMax |
| UI-Designer | *(Claude native)* | Passthrough (dual-mode) |
| @kimi | kimi-for-coding | Directive → Kimi |
| @mm-cn | MiniMax-M2.5 | Directive → MiniMax CN |
| @deepseek | deepseek-chat | Directive → DeepSeek |
| @deepseek-r | deepseek-reasoner | Directive → DeepSeek |
| @qwen | qwen3.5-plus | Directive → Aliyun |
| @zhipu | glm-5 | Directive → ZhiPu |

### Safety Features

- **Session Isolation**: Each `oh-my-claude cc` session gets its own proxy instance — no interference between sessions
- **Permanent Switches**: Model switches persist until explicitly reverted (no request counting)
- **DeepSeek Reasoner Compatibility**: Proxy automatically injects required `thinking` blocks when switching mid-conversation to DeepSeek Reasoner
- **Graceful Fallback**: If provider API key is missing, silently falls back to native Claude
- **Error Recovery**: Provider request failures fall back to native Claude

### Proxy CLI Commands

```bash
oh-my-claude proxy                                # Show overview (sessions + status)
oh-my-claude proxy status                         # Show active sessions summary
oh-my-claude proxy sessions                       # Detailed session list with model info
oh-my-claude proxy switch                         # Show sessions and available models
oh-my-claude proxy switch <session> <model>       # Switch session to model (prefix match)
oh-my-claude proxy revert [session]               # Revert to native Claude
```

### Menubar App (GUI Session Manager)

oh-my-claude includes a Tauri-based menubar app for visual session management.

```bash
oh-my-claude menubar                              # Launch built app
oh-my-claude menubar --dev                        # Run in development mode
oh-my-claude menubar --build                      # Build release app
```

**Prerequisites**: [Rust](https://rustup.rs/) and [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) are required for building.

The menubar app displays all active sessions, their current models, and allows one-click model switching — same data as `proxy sessions` but with a visual interface. Includes a per-session memory model picker for choosing which AI provider handles memory operations.

</details>

## Web Dashboard

Access a browser-based dashboard at `http://localhost:18911/web/` when the proxy is running.

**What you can do:**
- **Manage models** — Add, edit, or remove models from any provider (no more editing JSON by hand)
- **Switch models** — One-click provider/model switching with live status updates
- **Monitor proxy** — See proxy health, uptime, request count, and active sessions
- **View providers** — Check which providers are configured, their API key status, and model counts

**How to access:**
```bash
omc cc          # Starts proxy automatically
# Open http://localhost:18911/web/
```

<details>
<summary>Technical details</summary>

- React 19 + Vite + Tailwind CSS SPA, built to `dist/proxy/web/`
- Served directly from the proxy control server (port 18911) — no extra infrastructure
- Backend API: `/api/registry` (models CRUD), `/api/config` (provider status)
- Sidebar navigation with 4 pages: Dashboard, Models, Providers, Switch
- Designed to scale — v2 will add session management (browse/review/archive conversations)

</details>

> **Note**: Screenshots will be added once the UI design is finalized.

## Terminal Configuration

oh-my-claude provides one-command terminal setup optimized for AI coding sessions (WezTerm and tmux).

<details>
<summary>View WezTerm and tmux setup details</summary>

### WezTerm

```bash
oh-my-claude wezterm-config              # Write ~/.wezterm.lua
oh-my-claude wezterm-config --force      # Overwrite existing config
oh-my-claude wezterm-config --show       # Preview without writing
```

**Key settings:** 50k scrollback, JetBrains Mono font, Dracula theme, WebGpu rendering, vi-style copy mode (`Ctrl+Shift+X`), quick select (`Ctrl+Shift+Space`), regex search (`Ctrl+Shift+F`), pane splitting (`Ctrl+Shift+|` / `Ctrl+Shift+_`).

**Shell auto-detection (Windows):** Priority: zsh > Git Bash > PowerShell. If zsh is installed in your Git Bash directory (`bin/` or `usr/bin/`), WezTerm launches it automatically via `bash -i -l -c zsh`. Git Bash location is detected via multiple candidate paths + `where git` fallback.

### tmux

```bash
oh-my-claude tmux-config                 # Write to ~/.tmux.conf
oh-my-claude tmux-config --force         # Overwrite existing config
oh-my-claude tmux-config --show          # Preview without writing
```

**Key settings:** 50k scrollback, mouse mode, 256-color, zero escape delay, vi copy mode. Cross-platform clipboard auto-detection: `pbcopy` (macOS), `clip.exe` (Windows/WSL), `xclip`/`xsel` (Linux).

</details>

## Agent Workflows

All 11 agents are unified as native Task tool agents. They use route directive auto-routing via `[omc-route:provider/model]` embedded in their prompts.

<details>
<summary>View all agents and routing details</summary>

### Claude Code Built-in Agents (Task Tool)

These agents run via Claude Code's native Task tool on the Claude subscription model.

| Agent | Role | Invocation |
|-------|------|------------|
| **Sisyphus** | Primary orchestrator | `/omc-sisyphus` |
| **Claude-Reviewer** | Code review, QA | `Task(subagent_type="claude-reviewer")` |
| **Claude-Scout** | Fast exploration | `Task(subagent_type="claude-scout")` |
| **Prometheus** | Strategic planning | `/omc-plan` |
| **Explore** | Codebase search | `Task(subagent_type="Explore")` |

### Task Agents (Route Directive Auto-Routed)

All task agents run via Claude Code's Task tool. Each agent's prompt contains an `[omc-route:provider/model]` directive that the proxy extracts at Priority 1 for automatic provider routing — no manual `switch_model` needed.

| Agent | Model | Provider (directive-routed) | Role |
|-------|-------|---------------------------|------|
| **Oracle** | *(Claude native)* | Anthropic (dual-mode) | Deep reasoning |
| **Analyst** | qwen3.5-plus | Aliyun | Quick code analysis |
| **Librarian** | glm-5 | ZhiPu | External research |
| **UI-Designer** | *(Claude native)* | Anthropic (dual-mode) | Visual/UI design |
| **Document-Writer** | MiniMax-M2.5 | MiniMax | Documentation |
| **Navigator** | *(Claude native)* | Anthropic (dual-mode) | Visual-to-code & multi-step tasks |
| **Hephaestus** | *(Claude native)* | Anthropic (dual-mode) | Code forge specialist |

**Invocation:** `Task(subagent_type="analyst")` or use `@analyst` in prompts. The proxy auto-routes based on the embedded route directive.

**Direct Model Access:** `execute_with_model(provider="deepseek", model="deepseek-reasoner", prompt="...")` — bypasses agent routing for token-efficient direct model calls.

> **5-Priority Routing Chain:** directive(1) → model-driven(2) → session(3) → global(4) → passthrough(5). Route directives embedded in agent prompts take highest priority, followed by model-ID auto-routing, then explicit session/global switches.

</details>

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

<details>
<summary>View full CLI reference</summary>

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
npx @lgcyaxi/oh-my-claude memory status               # Show memory stats with scope breakdown
npx @lgcyaxi/oh-my-claude memory search <query>       # Search memories (--scope project/global/all)
npx @lgcyaxi/oh-my-claude memory list                 # List all memories (--scope project/global/all)
npx @lgcyaxi/oh-my-claude memory show <id>            # Show memory content
npx @lgcyaxi/oh-my-claude memory delete <id>          # Delete a memory (--scope project/global/all)
npx @lgcyaxi/oh-my-claude memory compact              # Interactive memory compaction guide

# Terminal Configuration
npx @lgcyaxi/oh-my-claude wezterm-config            # Write WezTerm config (~/.wezterm.lua)
npx @lgcyaxi/oh-my-claude wezterm-config --force    # Overwrite existing config
npx @lgcyaxi/oh-my-claude tmux-config               # Write tmux config (~/.tmux.conf)
npx @lgcyaxi/oh-my-claude tmux-config --force       # Overwrite existing config

# Launch Claude Code
npx @lgcyaxi/oh-my-claude cc                      # Auto-start proxy + launch claude
npx @lgcyaxi/oh-my-claude cc -p ds                # Direct DeepSeek connection
npx @lgcyaxi/oh-my-claude cc -p km                # Direct Kimi connection
npx @lgcyaxi/oh-my-claude cc -- --resume           # Forward args to claude

# Authentication (OAuth)
npx @lgcyaxi/oh-my-claude auth login <provider>          # Authenticate (openai/minimax/kimi/aliyun)
npx @lgcyaxi/oh-my-claude auth logout <provider>         # Remove credentials
npx @lgcyaxi/oh-my-claude auth list                      # List authenticated providers

# Proxy (Live Model Switching — auto-managed per session)
npx @lgcyaxi/oh-my-claude proxy                    # Show sessions overview
npx @lgcyaxi/oh-my-claude proxy status             # Active sessions summary
npx @lgcyaxi/oh-my-claude proxy sessions           # Detailed session list
npx @lgcyaxi/oh-my-claude proxy switch             # Show sessions + available models
npx @lgcyaxi/oh-my-claude proxy switch <s> <m>     # Switch session to model
npx @lgcyaxi/oh-my-claude proxy revert [session]   # Revert to native Claude

# Menubar (GUI Session Manager)
npx @lgcyaxi/oh-my-claude menubar                  # Launch built menubar app
npx @lgcyaxi/oh-my-claude menubar --dev            # Run in development mode
npx @lgcyaxi/oh-my-claude menubar --build          # Build release app
```

</details>

## Configuration

Configuration file: `~/.claude/oh-my-claude.json`

<details>
<summary>View full configuration example</summary>

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
    "zai": {
      "type": "anthropic-compatible",
      "base_url": "https://api.z.ai/api/anthropic",
      "api_key_env": "ZAI_API_KEY"
    },
    "minimax": {
      "type": "anthropic-compatible",
      "base_url": "https://api.minimax.io/anthropic",
      "api_key_env": "MINIMAX_API_KEY"
    },
    "minimax-cn": {
      "type": "anthropic-compatible",
      "base_url": "https://api.minimaxi.com/anthropic",
      "api_key_env": "MINIMAX_CN_API_KEY"
    },
    "kimi": {
      "type": "anthropic-compatible",
      "base_url": "https://api.kimi.com/coding",
      "api_key_env": "KIMI_API_KEY"
    },
    "aliyun": {
      "type": "anthropic-compatible",
      "base_url": "https://coding.dashscope.aliyuncs.com/apps/anthropic",
      "api_key_env": "ALIYUN_API_KEY"
    },
    "openai": {
      "type": "openai-oauth",
      "note": "Authenticate via: oh-my-claude auth login openai"
    }
  },
  "agents": {
    "Sisyphus": { "provider": "claude", "model": "claude-opus-4-5" },
    "oracle": { "provider": "aliyun", "model": "qwen3.5-plus" },
    "hephaestus": { "provider": "kimi", "model": "K2.5" },
    "librarian": { "provider": "zhipu", "model": "GLM-5" }
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

### Memory Settings

Configure memory system behavior:

```json
{
  "memory": {
    "defaultReadScope": "all",
    "defaultWriteScope": "auto",
    "autoSaveThreshold": 75,
    "aiProviderPriority": ["zhipu", "minimax", "deepseek"]
  }
}
```

| Setting | Description | Default |
|---------|-------------|---------|
| `defaultReadScope` | Where to search (`project`, `global`, `all`) | `all` |
| `defaultWriteScope` | Where to write (`project`, `global`, `auto`) | `auto` |
| `autoSaveThreshold` | Context % to trigger auto-save (0 = disabled) | `75` |
| `aiProviderPriority` | Provider order for AI-powered features | `["zhipu", "minimax", "deepseek"]` |

</details>

## Architecture

<details>
<summary>View architecture diagram and execution modes</summary>

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Claude Code Session                               │
├──────────────────────────────────────────────────────────────────────────┤
│  Primary Agent (Claude via Subscription)                                  │
│         │                                                                 │
│    ┌────┴────┬─────────────────┬──────────────┐                          │
│    ▼         ▼                 ▼              ▼                          │
│  Task Tool   MCP Server     Hooks       Per-Session Proxy                │
│  (sync)      (async)        (lifecycle)  (auto-managed)                  │
│    │           │                │              │                          │
│    ▼           ▼                ▼              ▼                          │
│  Claude      Multi-Provider  settings.json  API Request Router           │
│  Subagents   Router          scripts          │                          │
│                │                         ┌────┴────┐                     │
│                │                         ▼         ▼                     │
│                ├── DeepSeek          Anthropic   External                 │
│                ├── ZhiPu GLM        (default)   Provider                 │
│                ├── MiniMax                       (switched)               │
│                ├── Kimi                                                   │
│                ├── Aliyun             Menubar App                         │
│                └── OpenAI (OAuth)     (GUI session manager)              │
└──────────────────────────────────────────────────────────────────────────┘
```

### Execution Modes

- **Task Tool (sync)**: Claude subscription agents run via Claude Code's native Task tool
- **MCP Server (async)**: External API agents run via MCP for parallel background execution
- **Proxy (intercept)**: HTTP proxy intercepts Claude Code's native API calls for live model switching

</details>

## Development

<details>
<summary>View development setup</summary>

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

</details>

## Troubleshooting

<details>
<summary>View common issues and solutions</summary>

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

</details>

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
