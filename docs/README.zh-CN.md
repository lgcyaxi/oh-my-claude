# oh-my-claude

[English](README.md) | [中文](README.zh-CN.md)

为 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 打造的多供应商 MCP 服务器，提供专业化的智能体工作流。

通过 Anthropic 兼容 API 将后台任务路由到多个 AI 供应商（DeepSeek、智谱 GLM、MiniMax、Kimi、Aliyun、Ollama、OpenRouter、OpenAI），同时充分利用 Claude Code 的原生能力。

## 特性

- **多供应商 MCP 服务器** - 支持 DeepSeek、智谱 GLM、MiniMax、Kimi、Aliyun、Ollama、OpenRouter、OpenAI 的后台任务执行
- **OAuth 认证** - 一键登录 OpenAI Codex（用于 Codex 协作者）、MiniMax、Kimi 和 Aliyun — 无需 API 密钥
- **并发后台任务** - 支持多智能体并行运行，可配置并发限制
- **专业化智能体工作流** - 预配置的专业智能体（Sisyphus、Oracle、Hephaestus、Librarian 等）
- **原生协作者运行时** - Codex 和 OpenCode 原生执行，统一跨平台终端查看器（tmux/WezTerm/Terminal）、任务取消/中断、TUI 提示消息、查看器自动关闭和实时状态。OpenCode 的 agent 选择直接基于实时 `/agent` 列表，包含原生 agent 和 server 已暴露的插件 agent。新增定向差异审查（针对指定路径的聚焦 git diff）、丰富审批元数据（decisionOptions、questions、details）和 9 项操作：send、review、diff、fork、approve、revert、cancel、status、recent_activity
- **斜杠命令** - 快捷操作（`/omcx-commit`、`/omcx-implement`）和智能体激活（`/omc-sisyphus`、`/omc-plan`）
- **实时状态栏** - 显示活跃智能体、任务进度和并发槽位
- **规划系统** - 使用 Prometheus 智能体进行战略规划和巨石状态追踪
- **官方 MCP 一键安装** - 一条命令安装 Sequential Thinking、MiniMax 和 GLM MCP 服务
- **Hook 集成** - 代码质量检查和待办追踪
- **输出样式管理器** - 通过 CLI 在内置和自定义输出样式之间切换
- **记忆时间线** - 自动维护的时间顺序索引，注入智能体上下文实现跨会话感知
- **实时模型切换** - HTTP 代理实现对话中模型切换，5 优先级路由链：指令(1) → 模型驱动(2) → 会话(3) → 全局(4) → 透传(5)
- **路由指令自动路由** - 子智能体在提示词中嵌入 `[omc-route:provider/model]` 指令，代理在优先级 1 自动提取并路由 — 无需手动切换
- **统一智能体架构** - 11 个角色智能体 + 6 个供应商智能体（`@kimi`、`@deepseek`、`@qwen` 等）统一为原生 Task 工具智能体，使用路由指令
- **语义记忆** - 三层搜索架构（混合 FTS5+向量、FTS5、传统），支持去重、摘要式召回和结构化分类（architecture、convention、decision、debugging、workflow、pattern、reference、session）
- **终端配置** - 一键配置 WezTerm/tmux，支持 zsh 自动检测和跨平台剪贴板
- **配套工具** - 一键安装 UI UX Pro Max、CCometixLine 等工具

## 快速开始

### 前置要求

- [Bun](https://bun.sh/) 运行时
- 已安装 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
- 您想使用的供应商的 API 密钥

### 安装

```bash
# 从 npm 安装（推荐）
npx @lgcyaxi/oh-my-claude install

# 或者克隆并本地安装
git clone https://github.com/lgcyaxi/oh-my-claude.git
cd oh-my-claude
bun install && bun run build:all
bun run install-local
```

### 设置 API 密钥

```bash
# DeepSeek（用于 Analyst 智能体）
export DEEPSEEK_API_KEY=your-deepseek-api-key

# 智谱 GLM 国内（用于 Librarian 智能体）
export ZHIPU_API_KEY=your-zhipu-api-key
# 智谱 GLM 海外 (Z.ai)
export ZAI_API_KEY=your-zai-api-key

# MiniMax 海外 (api.minimax.io)
export MINIMAX_API_KEY=your-minimax-api-key
# MiniMax 国内（用于 Document-Writer 智能体）
export MINIMAX_CN_API_KEY=your-minimax-cn-api-key

# Kimi（用于代理模型切换）
export KIMI_API_KEY=your-kimi-api-key

# 阿里云灵码（千问模型）
export ALIYUN_API_KEY=your-aliyun-api-key

# OpenRouter（免费模型：hunter-alpha、nemotron-3-super）
export OPENROUTER_API_KEY=your-openrouter-api-key

# Ollama（本地运行，无需 API 密钥 — 自动发现模型）
# export OLLAMA_HOST=http://localhost:11434  # 默认值，仅在非标准端口时设置
```

### OAuth 认证（可选）

支持 OAuth 的供应商可以免 API 密钥使用：

```bash
# OpenAI（用于 Codex 协作者）
oh-my-claude auth login openai
oh-my-claude auth login openai --headless  # 用于 SSH/远程环境

# MiniMax（用于配额显示）
oh-my-claude auth login minimax  # 打开浏览器进行二维码登录

# 阿里云百炼（用于灵码编码计划配额显示）
oh-my-claude auth login aliyun   # 打开浏览器登录阿里云控制台

# Kimi（用于配额显示）
oh-my-claude auth login kimi     # 打开浏览器登录 Kimi

# 列出已认证的供应商
oh-my-claude auth list
```

认证后，使用 `/omc-switch km`（Kimi）或 `/omc-switch ali`（Aliyun）通过这些供应商路由请求。

### 安装官方 MCP 服务

```bash
# 安装所有官方 MCP 服务（Sequential Thinking、MiniMax、GLM）
npx @lgcyaxi/oh-my-claude setup-mcp

# 或者安装特定服务
npx @lgcyaxi/oh-my-claude setup-mcp --thinking  # 仅 Sequential Thinking
npx @lgcyaxi/oh-my-claude setup-mcp --minimax   # 仅 MiniMax
npx @lgcyaxi/oh-my-claude setup-mcp --glm       # 仅 GLM/智谱服务

# 列出可用的 MCP 服务
npx @lgcyaxi/oh-my-claude setup-mcp --list
```

### 验证安装

```bash
# 检查安装状态
npx @lgcyaxi/oh-my-claude status

# 诊断配置（显示详细组件状态）
npx @lgcyaxi/oh-my-claude doctor --detail
```

### 指南

- [Codex App-Server 指南](guides/codex-app-server.md)
- [Coworker 架构](guides/orchestrator-architecture.md)
- [Coworker 协议覆盖](guides/coworker-protocol-coverage.md)
- [Coworker Smoke Tests](guides/coworker-smoke-tests.md)
- [Coworker GUI Acceptance 指南](guides/coworker-gui-acceptance.md)

## 斜杠命令

### 智能体命令（`/omc-*`）

| 命令 | 描述 |
|------|------|
| `/omc-sisyphus` | 激活 Sisyphus - 完整实现编排器 |
| `/omc-plan` | 使用 Prometheus 开始战略规划 |
| `/omc-start-work` | 开始执行现有计划 |
| `/omc-status` | 显示 MCP 后台智能体状态仪表板 |
| `/omc-switch` | 切换到外部供应商模型（如 `/omc-switch dr`） |
| `/omc-opencode` | 激活 OpenCode 进行重构和 UI 设计 |
| `/omc-codex` | 将自包含任务分派给 Codex 协作者 |
| `/omc-pref` | 管理持久偏好设置（始终/禁止规则） |
| `/omc-up` | 点赞 — 标记响应为有帮助 |
| `/omc-down` | 点踩 — 标记响应为无帮助 |
| `/omc-pend` | 挂起 — 暂停当前任务稍后继续 |
| `/omc-mem-compact` | AI 辅助记忆压缩 |
| `/omc-mem-clear` | AI 驱动选择性记忆清理 |
| `/omc-mem-summary` | 按日期范围整合记忆为时间线 |
| `/omc-mem-daily` | 从会话记忆生成每日叙事 |
| `/omc-ulw` | **超级工作模式** - 最高性能，工作到完成 |

### 快捷操作命令（`/omcx-*`）

| 命令 | 描述 |
|------|------|
| `/omcx-commit` | 智能 git commit，使用约定式格式 |
| `/omcx-implement` | 按最佳实践实现功能 |
| `/omcx-refactor` | 重构代码并提升质量 |
| `/omcx-docs` | 生成或更新文档 |
| `/omcx-issue` | 向 oh-my-claude GitHub Issues 报告 Bug |

#### 超级工作模式（`/omc-ulw`）

超级工作模式激活**最高性能执行**，采用零容忍完成策略：

- **自动权限接受** - 启动前提示用户启用自动接受权限，确保不中断执行
- **100% 交付** - 不允许部分完成、不允许缩小范围、不允许占位符
- **激进并行化** - 同时启动多个智能体
- **强制验证** - 代码编译、测试通过、构建成功
- **工作到完成** - 持续执行直到所有任务标记完成

**使用方法：**
```bash
/omc-ulw 根据计划实现认证系统
/omc-ulw 修复代码库中的所有类型错误
/omc-ulw 为 API 添加全面的测试覆盖
```

**核心特性：**
- 启动前请求自动接受权限以实现不间断执行
- 自动创建全面的待办列表
- 同步智能体（Task 工具）和异步智能体（MCP）并行使用
- 每个步骤验证后才标记完成
- 巨石状态持久化以支持会话延续

## 实时状态栏

oh-my-claude 提供基于分段的状态栏，在 Claude Code 中直接显示丰富的信息。

### 示例输出

```
omc [opus-4.5] [dev*↑2] [oh-my-claude] [45% 89k/200k] [79% 7d:4%] [eng-pro] [⠙ Oracle: 32s]
     │          │        │              │              │           │          │
     │          │        │              │              │           │          └─ MCP 任务
     │          │        │              │              │           └─ 输出样式
     │          │        │              │              └─ API 配额（5小时/7天）
     │          │        │              └─ 上下文令牌（已用/限制）
     │          │        └─ 项目名称
     │          └─ Git 分支（* = 有修改，↑2 = 领先2次提交）
     └─ 模型名称
```

### 分段说明

| 分段 | 描述 | 示例 |
|------|------|------|
| **Model** | 当前 Claude 模型 | `[opus-4.5]` |
| **Git** | 分支 + 状态 | `[dev*↑2]`（有修改，领先2次提交） |
| **Directory** | 项目名称 | `[oh-my-claude]` |
| **Context** | 令牌使用率 | `[45% 89k/200k]` |
| **Session** | API 配额使用率 | `[79% 7d:4%]`（5小时/7天） |
| **Output Style** | 当前输出样式 | `[eng-pro]` |
| **MCP** | 后台任务 | `[⠙ Oracle: 32s]` |
| **Memory** | 记忆存储数量 | `[mem:5]` |
| **Proxy** | 模型切换状态 | `[→DS/R ×2]` |
| **Usage** | 供应商配额/余额（第3行） | `DS:¥98.5 \| ZP:1%/w:5%/m:2% \| AY:0%/w:1%/m:1%` |
| **Preferences** | 活跃偏好规则数 | `[pref:3]` |

### 预设配置

在 `~/.config/oh-my-claude/statusline.json` 中配置：

| 预设 | 包含分段 |
|------|----------|
| **minimal** | Git、Directory |
| **standard** | Model、Git、Directory、Context、Session、MCP |
| **full** | 所有分段（包括 Output Style、Memory、Proxy） |

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

### 语义颜色

- 🟢 **绿色** - 良好（干净的 git 状态、低使用率）
- 🟡 **黄色** - 警告（有未提交修改、50-80% 使用率）
- 🔴 **红色** - 危险（>80% 使用率）
- 🔵 **青色** - 中性（目录、一般信息）

### CLI 控制

```bash
# 检查状态
npx @lgcyaxi/oh-my-claude statusline --status    # 检查状态栏状态

# 启用/禁用
npx @lgcyaxi/oh-my-claude statusline --enable    # 启用状态栏
npx @lgcyaxi/oh-my-claude statusline --disable   # 禁用状态栏

# 切换预设
npx @lgcyaxi/oh-my-claude statusline preset minimal   # 设置精简预设
npx @lgcyaxi/oh-my-claude statusline preset standard  # 设置标准预设
npx @lgcyaxi/oh-my-claude statusline preset full      # 设置完整预设（默认）

# 切换单个分段
npx @lgcyaxi/oh-my-claude statusline toggle model on      # 启用 model 分段
npx @lgcyaxi/oh-my-claude statusline toggle output-style  # 切换 output-style
npx @lgcyaxi/oh-my-claude statusline toggle context off   # 禁用 context 分段
```

**可用分段：** `model`、`git`、`directory`、`context`、`session`、`output-style`、`mode`、`mcp`、`memory`、`proxy`、`codex`、`usage`、`preferences`

### 多行支持

当您已有状态栏（如 CCometixLine）时，oh-my-claude 会自动创建一个包装器，将两者显示在不同行。

## 输出样式

oh-my-claude 内置多个输出样式预设，可自定义 Claude Code 的响应行为。

### 内置预设

| 样式 | 描述 |
|------|------|
| **engineer-professional** | SOLID/KISS/DRY/YAGNI 原则，专业工程输出 |
| **agent** | 自主智能体模式 — 最少叙述，最多行动 |
| **concise-coder** | 代码优先，除非被要求否则不解释 |
| **teaching** | 教学模式 — 解释概念、推理和取舍 |
| **review** | 代码审查专注模式，带严重性级别 |

### CLI 命令

```bash
# 列出可用样式
npx @lgcyaxi/oh-my-claude style list

# 切换输出样式
npx @lgcyaxi/oh-my-claude style set agent

# 查看样式内容
npx @lgcyaxi/oh-my-claude style show teaching

# 重置为 Claude 默认
npx @lgcyaxi/oh-my-claude style reset

# 创建自定义样式
npx @lgcyaxi/oh-my-claude style create my-style
```

### 自定义样式

在 `~/.claude/output-styles/` 中创建自定义样式：

```bash
oh-my-claude style create my-custom-style
# 编辑 ~/.claude/output-styles/my-custom-style.md
oh-my-claude style set my-custom-style
```

样式文件使用 YAML 前言 + markdown 正文：

```markdown
---
name: my-custom-style
description: 我的自定义输出样式
---

# 我的自定义样式

在此定义样式指令...
```

## 记忆系统

oh-my-claude 内置语义记忆系统，支持跨会话持久化知识。记忆以人类可读的 `.md` 文件存储 — 支持 Git 版本控制、手动编辑。派生 SQLite 索引提供 FTS5 BM25 搜索 + 可选向量相似度，实现上下文高效召回。

### 存储结构

```
~/.claude/oh-my-claude/memory/
├── sessions/    # 自动归档的会话摘要
└── notes/       # 用户创建的持久记忆
```

### MCP 工具

| 工具 | 说明 |
|------|------|
| `remember` | 存储记忆，自动去重检查（哈希精确匹配跳过、近似重复标记） |
| `recall` | 搜索记忆，返回摘要片段（~300 字符），支持相关度排序 |
| `get_memory` | 按 ID 读取完整记忆内容（从 recall 摘要深入查看） |
| `forget` | 按 ID 删除记忆（同时清理 SQLite 索引） |
| `list_memories` | 浏览记忆，支持类型、日期和范围过滤 |
| `memory_status` | 显示记忆统计，包括索引健康状态和搜索层级 |
| `compact_memories` | AI 辅助记忆压缩（分组合并相关记忆） |

### 记忆时间线（自动上下文）

oh-my-claude 自动维护一个 `TIMELINE.md` 文件，作为所有记忆的时间顺序目录。这使 AI 智能体拥有**持续的跨会话感知能力**，无需先调用 `recall()`。

**工作原理：**
1. 每次记忆变更（`remember`、`forget`、`compact`、`clear`、`summarize`）都会重新生成 `TIMELINE.md`
2. 记忆感知 Hook 在每次用户提示时读取时间线
3. 时间线内容自动注入到智能体的系统上下文中

**时间线示例：**
```markdown
# Memory Timeline
> 12 memories | Updated: 2026-02-10T15:30:00Z

## Today (Feb 10)
- 15:30 [note] **代理 thinking block 修复** `proxy, bug-fix`
- 14:00 [note] **摘要自动删除 + 标签** `memory, enhancement`

## Yesterday (Feb 9)
- 18:45 [session] **会话摘要 2026-02-09** `auto-capture`

## This Week (Feb 3-8)
- Feb 7 [note] **Hook 重复安装修复** `installer, hooks`

## Earlier This Month
3 memories (2 notes, 1 session) | tags: memory, search, indexer

## January 2026
8 memories (5 notes, 3 sessions) | tags: memory, embeddings, proxy
```

**存储位置：** `TIMELINE.md` 存放在 `.claude/mem/` 和 `~/.claude/oh-my-claude/memory/` 的根目录 — 位于 `notes/` 和 `sessions/` 之外，因此对记忆操作不可见（不会被索引、去重或列出）。

**自动缩放：** 条目从底部开始逐步折叠（今天/昨天 = 完整详情，本周 = 最多显示 10 条，更早 = 折叠摘要，更早月份 = 每月一行）。总输出上限为 120 行。

### 嵌入供应商（语义搜索）

语义搜索需要嵌入供应商。在配置中显式选择：

```json
{
  "memory": {
    "embedding": {
      "provider": "custom"
    }
  }
}
```

| 供应商 | 配置值 | 所需环境变量 | 模型 |
|--------|--------|-------------|------|
| **自定义** (Ollama, vLLM, LM Studio 等) | `"custom"` (默认) | `EMBEDDING_API_BASE` | 任意 OpenAI 兼容 |
| **智谱** | `"zhipu"` | `ZHIPU_API_KEY` | `embedding-3` (1024维) |
| **OpenRouter** | `"openrouter"` | `OPENROUTER_API_KEY` | `text-embedding-3-small` (1536维) |
| **禁用** | `"none"` | — | 仅 FTS5 关键词搜索（Tier 2） |

**自定义供应商** 支持任意 OpenAI 兼容的 `/v1/embeddings` 端点：

```bash
# 必填：端点 URL（激活自定义供应商）
export EMBEDDING_API_BASE=http://localhost:11434/v1

# 可选：模型名称（默认：text-embedding-3-small）
export EMBEDDING_MODEL=qwen3-embedding

# 可选：API 密钥（Ollama 等本地端点无需设置）
export EMBEDDING_API_KEY=your-key

# 可选：向量维度（未设置时通过探测调用自动检测）
export EMBEDDING_DIMENSIONS=4096
```

如果选定的供应商无法初始化（缺少环境变量、连接错误），系统降级为 FTS5 关键词搜索（Tier 2）。不会静默切换到其他供应商 — 查看 MCP stderr 日志获取明确的诊断信息。

### CLI 命令

```bash
oh-my-claude memory status              # 显示记忆统计
oh-my-claude memory search <查询>       # 搜索记忆
oh-my-claude memory list [--type note]  # 列出记忆
oh-my-claude memory show <id>           # 查看记忆内容
oh-my-claude memory delete <id>         # 删除记忆
```

### 记忆文件格式

每个记忆都是带有 YAML 前言的 Markdown 文件：

```markdown
---
title: 团队偏好函数式组件
type: note
tags: [pattern, react, convention]
category: convention
created: 2026-01-29T10:00:00.000Z
updated: 2026-01-29T10:00:00.000Z
---

团队偏好使用 hooks 的函数式组件而非类组件。
使用 `useState` 和 `useEffect` 替代类生命周期方法。
```

**结构化分类：** 记忆支持基于分类法的分类以提升检索效果。可用分类：`architecture`、`convention`、`decision`、`debugging`、`workflow`、`pattern`、`reference`、`session`。

## 实时模型切换

oh-my-claude 内置 HTTP 代理，支持**对话中模型切换** — 将 Claude Code 的 API 请求临时路由到外部供应商（DeepSeek、智谱 GLM、MiniMax），不会丢失对话上下文。

### 工作原理

```
  Claude Code（使用 Anthropic API）
       │  ANTHROPIC_BASE_URL=http://localhost:18910
       ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  oh-my-claude 代理 (localhost:18910)                         │
  │                                                              │
  │  switched=false?  → 透传到 Anthropic                         │
  │  switched=true?   → 路由到外部供应商：                        │
  │    ├─ OpenAI     → Responses API（input/instructions）       │
  │    └─ DS/ZP/MM/KM/ALI → Anthropic /v1/messages（直通）       │
  └──────────────────────────────────────────────────────────────┘
```

**格式转换**：API 密钥供应商（DeepSeek、智谱、MiniMax、Kimi、Aliyun）使用 Anthropic 兼容的 `/v1/messages` — 无需转换。OpenAI 需要格式转换：
- **OpenAI Codex**：Responses API 格式（`input` 数组 + `instructions`）

### 快速开始

**一键启动**（推荐）：

```bash
oh-my-claude cc                    # 自动启动每会话代理 + 启动 Claude Code
oh-my-claude cc -r                 # 恢复上次会话（OMC 快捷方式）
oh-my-claude cc -skip              # 跳过权限确认（OMC 快捷方式）
oh-my-claude cc -wt                # 隔离的 git worktree 会话（OMC 快捷方式）
oh-my-claude cc -r -skip           # 组合多个 OMC 快捷方式
oh-my-claude cc -rc                # 远程控制模式（通过 claude.ai/code 移动端访问）
oh-my-claude cc -d                 # 启用调试日志（日志写入 ~/.claude/oh-my-claude/logs/）
oh-my-claude cc -p ds              # 直连 DeepSeek（无代理，单供应商）
oh-my-claude cc -p km              # 直连 Kimi（无代理，单供应商）
```

CC 会话模块采用平台分离架构（`*-unix.ts` / `*-win.ts`），实现清晰的 macOS/Linux 与 Windows 分离。

每个 `cc` 会话都有自己独立的代理实例和隔离的状态。多个会话可以同时运行互不干扰。在调试模式下，如果可见代理面板无法生成（如终端面板数量限制），会话会优雅降级为隐藏代理进程。

**OMC 快捷方式**使用单横杠（`-`）以区别于 Claude Code 原生的双横杠标志：

| 快捷方式 | 展开为 | 说明 |
|----------|--------|------|
| `-r` | `--resume` | 恢复上次会话 |
| `-skip` | `--dangerously-skip-permissions` | 跳过权限确认 |
| `-wt` | `--worktree` | 隔离的 git worktree 会话 |
| `-rc` | `claude remote-control` | 通过 claude.ai/code 移动端访问 |
Codex 和 OpenCode 现在都是原生协作者目标。对于协作者控制，统一使用 `coworker_task(action="send" | "review" | "diff" | "fork" | "approve" | "revert" | "cancel" | "status" | "recent_activity", ...)`。OpenCode 支持显式 `agent` / `provider_id` / `model_id` 覆盖，其中 `agent` 只会从实时 `/agent` 列表解析，可命中原生 agent 和 server 已暴露的插件 agent。Codex 支持原生 `approval_policy`，并会读取 `OMC_CODEX_APPROVAL_POLICY`；受支持的值只有 `never`、`on-request`、`on-failure`、`untrusted`、`reject`。Codex 默认是 `never`。`on-request` 只会在 Codex 判断有必要时请求审批，并不是“每一步都强制确认”。对于需要持续多轮切换供应商的工作，继续使用 `oh-my-claude cc` 的代理模式。

对 Codex，优先采用“协作者任务分派”风格：给出目标、范围和完成标准，然后让 Codex 自主执行；除非用户明确要求，否则不要提供逐步操作脚本。

**`cc -p` 供应商快捷名：**

| 快捷名 | 供应商 | 端点 |
|--------|--------|------|
| `ds` / `deepseek` | DeepSeek | api.deepseek.com/anthropic |
| `zp` / `zhipu` | 智谱 (国内) | open.bigmodel.cn/api/anthropic |
| `zai` / `zp-g` | Z.AI (海外) | api.z.ai/api/anthropic |
| `mm` / `minimax` | MiniMax (海外) | api.minimax.io/anthropic |
| `mm-cn` / `minimax-cn` | MiniMax (国内) | api.minimaxi.com/anthropic |
| `km` / `kimi` | Kimi | api.kimi.com/coding |
| `ali` / `aliyun` | 阿里云灵码 | coding.dashscope.aliyuncs.com/apps/anthropic |
| `or` / `openrouter` | OpenRouter | openrouter.ai/api |
| `ol` / `ollama` | Ollama（本地） | localhost:11434 |

> **Windows**：代理 CLI 完全跨平台。健康检查使用 Node 的 `http` 模块（无需 `curl` 依赖）。

### 切换模型

**通过斜杠命令**（在 Claude Code 对话中）：
```
/omc-switch dr               # 切换到 DeepSeek Reasoner
/omc-switch zp               # 切换到智谱 GLM-5
/omc-switch revert           # 切换回原生 Claude
```

**快捷别名：**

| 快捷名 | 供应商 | 模型 |
|--------|--------|------|
| `ds` | deepseek | deepseek-chat |
| `dr` | deepseek | deepseek-reasoner |
| `g5` | zhipu | GLM-5 |
| `mm` | minimax | MiniMax-M2.5 |
| `km` | kimi | K2.5 |
| `q` | aliyun | qwen3.5-plus |
| `qc` | aliyun | qwen3-coder-plus |
| `qn` | aliyun | qwen3.5-coder-plus |
| `g4` | aliyun | qwen-max |
| `or` | openrouter | openrouter/hunter-alpha |
| `ol` | ollama | *（自动发现）* |

**通过 CLI**（会话 ID 支持前缀匹配）：
```bash
oh-my-claude proxy switch                      # 显示会话和可用模型
oh-my-claude proxy switch 505a GLM-5           # 将会话 505a... 切换到 GLM-5
oh-my-claude proxy switch 505 deep             # 前缀匹配：deepseek-reasoner
oh-my-claude proxy revert 505a                 # 恢复会话到原生 Claude
```

**通过 MCP 工具：**
```
switch_model(provider="deepseek", model="deepseek-chat")
```

### MCP 工具

| 工具 | 说明 |
|------|------|
| `switch_model` | 将接下来 N 个请求切换到外部供应商 |
| `switch_status` | 查询当前代理切换状态 |
| `switch_revert` | 立即恢复为原生 Claude |

### 路由指令自动路由

智能体生成器在每个智能体的提示词中嵌入 `[omc-route:provider/model]` 指令。代理在**优先级 1** 提取此指令并自动路由到正确的供应商 — 无需显式调用 `switch_model` 或模型字段匹配。

**5 优先级路由链：**
1. **指令** — 提示词中的 `[omc-route:provider/model]`（最高优先级）
2. **模型驱动** — 请求中的非 Claude 模型 ID 触发供应商查找
3. **会话** — 显式 `switch_model` 调用
4. **全局** — 全局代理切换状态
5. **透传** — 默认转发至 Anthropic

所有智能体以原生 Task 工具运行，拥有完整的 Claude Code 工具访问权限（Edit、Write、Bash、Glob、Grep）。Claude 原生智能体（无指令）照常直通到 Anthropic。

| 智能体 | 模式 | 路由方式 |
|--------|------|----------|
| Oracle | 双模式（Claude 原生 + 路由） | 指令或无指令直通 |
| Analyst | 路由 | 指令 → Aliyun |
| Librarian | 路由 | 指令 → 智谱 |
| Navigator | 双模式（Claude 原生 + 路由） | 指令或无指令直通 |
| Hephaestus | 双模式（Claude 原生 + 路由） | 指令或无指令直通 |
| Document-Writer | 路由 | 指令 → MiniMax |
| UI-Designer | 双模式（Claude 原生 + 路由） | 指令或无指令直通 |
| @kimi | 路由 | 指令 → Kimi |
| @mm-cn | 路由 | 指令 → MiniMax CN |
| @deepseek | 路由 | 指令 → DeepSeek |
| @deepseek-r | 路由 | 指令 → DeepSeek |
| @qwen | 路由 | 指令 → Aliyun |
| @zhipu | 路由 | 指令 → 智谱 |

### 安全特性

- **会话隔离**：每个 `oh-my-claude cc` 会话拥有独立的代理实例 — 会话间互不干扰
- **永久切换**：模型切换持续有效，直到显式恢复（无请求计数）
- **DeepSeek Reasoner 兼容**：对话中途切换到 DeepSeek Reasoner 时，代理自动注入所需的 `thinking` 块
- **优雅降级**：如果供应商 API 密钥缺失，静默回退到原生 Claude
- **错误恢复**：供应商请求失败时自动回退到原生 Claude

### 代理 CLI 命令

```bash
oh-my-claude proxy                                # 显示概览（会话 + 状态）
oh-my-claude proxy status                         # 显示活跃会话摘要
oh-my-claude proxy sessions                       # 详细会话列表（含模型信息）
oh-my-claude proxy switch                         # 显示会话和可用模型
oh-my-claude proxy switch <会话> <模型>            # 切换会话到指定模型（前缀匹配）
oh-my-claude proxy revert [会话]                   # 恢复为原生 Claude
```

### 菜单栏应用（GUI 会话管理器）

oh-my-claude 内置基于 Tauri 的菜单栏应用，提供可视化会话管理。

```bash
oh-my-claude menubar                              # 启动已构建的应用
oh-my-claude menubar --dev                        # 以开发模式运行
oh-my-claude menubar --build                      # 构建发布版应用
```

**前置要求**：构建需要 [Rust](https://rustup.rs/) 和 [Tauri 前置依赖](https://v2.tauri.app/start/prerequisites/)。

菜单栏应用显示所有活跃会话及其当前模型，支持一键切换模型 — 与 `proxy sessions` 数据相同，但提供可视化界面。包含每会话记忆模型选择器，用于选择处理记忆操作的 AI 供应商。

## 终端配置

oh-my-claude 提供一键终端配置，针对 AI 编程会话进行了优化。

### WezTerm

```bash
oh-my-claude wezterm-config              # 写入 ~/.wezterm.lua
oh-my-claude wezterm-config --force      # 覆盖已有配置
oh-my-claude wezterm-config --show       # 预览但不写入
```

**主要配置：** 50k 滚动缓冲、JetBrains Mono 字体、Dracula 主题、WebGpu 渲染、vi 风格复制模式（`Ctrl+Shift+X`）、快速选择（`Ctrl+Shift+Space`）、正则搜索（`Ctrl+Shift+F`）、窗格分割（`Ctrl+Shift+|` / `Ctrl+Shift+_`）。

**Shell 自动检测（Windows）：** 优先级：zsh > Git Bash > PowerShell。如果在 Git Bash 目录中检测到 zsh（`bin/` 或 `usr/bin/`），WezTerm 会通过 `bash -i -l -c zsh` 自动启动 zsh。Git Bash 位置通过多个候选路径和 `where git` 回退检测。

### tmux

```bash
oh-my-claude tmux-config                 # 写入 ~/.tmux.conf
oh-my-claude tmux-config --force         # 覆盖已有配置
oh-my-claude tmux-config --show          # 预览但不写入
```

**主要配置：** 50k 滚动缓冲、鼠标模式、256 色、零转义延迟、vi 复制模式。跨平台剪贴板自动检测：`pbcopy`（macOS）、`clip.exe`（Windows/WSL）、`xclip`/`xsel`（Linux）。

## 智能体工作流

全部 11 个智能体统一为原生 Task 工具智能体。桥接智能体已废弃 — 所有智能体现在通过提示词中嵌入的 `[omc-route:provider/model]` 路由指令实现自动路由。

### Claude Code 内置智能体（Task 工具）

这些智能体通过 Claude Code 的原生 Task 工具在 Claude 订阅模型上运行。

| 智能体 | 角色 | 调用方式 |
|--------|------|----------|
| **Sisyphus** | 主编排器 | `/omc-sisyphus` |
| **Claude-Reviewer** | 代码审查、质量保证 | `Task(subagent_type="claude-reviewer")` |
| **Claude-Scout** | 快速探索 | `Task(subagent_type="claude-scout")` |
| **Prometheus** | 战略规划 | `/omc-plan` |
| **Explore** | 代码库搜索 | `Task(subagent_type="Explore")` |

### 任务智能体（路由指令自动路由）

所有任务智能体通过 Claude Code 的 Task 工具运行。每个智能体的提示词包含 `[omc-route:provider/model]` 指令，代理在优先级 1 提取并自动路由至正确的供应商 — 无需手动 `switch_model`。

| 智能体 | 模式 | 角色 |
|--------|------|------|
| **Oracle** | 双模式（Claude 原生 + 路由） | 深度推理、架构设计、调试 |
| **Analyst** | 路由 | 快速代码分析 |
| **Librarian** | 路由 | 外部文档研究 |
| **Document-Writer** | 路由 | 技术文档编写 |
| **Navigator** | 双模式（Claude 原生 + 路由） | 视觉转代码、多模态 |
| **Hephaestus** | 双模式（Claude 原生 + 路由） | 深度实现、代码锻造 |
| **UI-Designer** | 双模式（Claude 原生 + 路由） | UI/UX 设计（OpenCode 不可用时的备选） |

**调用方式：** `Task(subagent_type="analyst")` 或在提示中使用 `@analyst`。代理基于嵌入的路由指令自动路由。

> **5 优先级路由链：** 指令(1) → 模型驱动(2) → 会话(3) → 全局(4) → 透传(5)。智能体提示词中嵌入的路由指令拥有最高优先级，其次是模型 ID 自动路由，然后是显式会话/全局切换。

## 官方 MCP 服务

`setup-mcp` 命令可安装以下官方 MCP 服务：

| 服务 | 供应商 | 描述 | 需要 API 密钥 |
|------|--------|------|---------------|
| **sequential-thinking** | Anthropic | 结构化问题解决 | 否 |
| **MiniMax** | MiniMax | 编码计划辅助 | MINIMAX_API_KEY |
| **web-reader** | 智谱 GLM | 网页内容提取 | ZHIPU_API_KEY |
| **web-search-prime** | 智谱 GLM | 网页搜索 | ZHIPU_API_KEY |
| **zread** | 智谱 GLM | GitHub 仓库阅读器 | ZHIPU_API_KEY |
| **zai-mcp-server** | 智谱 GLM | 图像/视频分析 | ZHIPU_API_KEY |

## CLI 命令

```bash
# 安装
npx @lgcyaxi/oh-my-claude install              # 安装 oh-my-claude
npx @lgcyaxi/oh-my-claude install --force      # 强制重新安装
npx @lgcyaxi/oh-my-claude install --skip-mcp   # 跳过 MCP 服务设置

# 更新
npx @lgcyaxi/oh-my-claude update               # 更新到最新版本
npx @lgcyaxi/oh-my-claude update --check       # 仅检查更新
npx @lgcyaxi/oh-my-claude update --force       # 强制重新安装最新版

# 状态和诊断
npx @lgcyaxi/oh-my-claude status               # 检查安装状态
npx @lgcyaxi/oh-my-claude doctor               # 诊断配置
npx @lgcyaxi/oh-my-claude doctor --detail      # 详细组件状态
npx @lgcyaxi/oh-my-claude doctor --no-color    # 禁用彩色输出

# MCP 服务设置
npx @lgcyaxi/oh-my-claude setup-mcp            # 安装所有官方 MCP
npx @lgcyaxi/oh-my-claude setup-mcp --list     # 列出可用 MCP
npx @lgcyaxi/oh-my-claude setup-mcp --thinking # 仅 Sequential Thinking
npx @lgcyaxi/oh-my-claude setup-mcp --minimax  # 仅 MiniMax
npx @lgcyaxi/oh-my-claude setup-mcp --glm      # 仅 GLM/智谱服务

# 卸载
npx @lgcyaxi/oh-my-claude uninstall            # 移除 oh-my-claude
npx @lgcyaxi/oh-my-claude uninstall --keep-config  # 保留配置文件

# 状态栏
npx @lgcyaxi/oh-my-claude statusline --status   # 检查状态栏状态
npx @lgcyaxi/oh-my-claude statusline --enable   # 启用状态栏
npx @lgcyaxi/oh-my-claude statusline --disable  # 禁用状态栏
npx @lgcyaxi/oh-my-claude statusline preset <名称>     # 设置预设 (minimal/standard/full)
npx @lgcyaxi/oh-my-claude statusline toggle <分段>     # 切换分段开关

# 输出样式
npx @lgcyaxi/oh-my-claude style list            # 列出可用样式
npx @lgcyaxi/oh-my-claude style set <名称>      # 切换输出样式
npx @lgcyaxi/oh-my-claude style show [名称]     # 查看样式内容
npx @lgcyaxi/oh-my-claude style reset           # 重置为 Claude 默认
npx @lgcyaxi/oh-my-claude style create <名称>   # 创建自定义样式

# 记忆
npx @lgcyaxi/oh-my-claude memory status          # 显示记忆统计
npx @lgcyaxi/oh-my-claude memory search <查询>   # 搜索记忆
npx @lgcyaxi/oh-my-claude memory list             # 列出所有记忆
npx @lgcyaxi/oh-my-claude memory show <id>        # 查看记忆内容
npx @lgcyaxi/oh-my-claude memory delete <id>      # 删除记忆

# 终端配置
npx @lgcyaxi/oh-my-claude wezterm-config            # 写入 WezTerm 配置 (~/.wezterm.lua)
npx @lgcyaxi/oh-my-claude wezterm-config --force    # 覆盖已有配置
npx @lgcyaxi/oh-my-claude tmux-config               # 写入 tmux 配置 (~/.tmux.conf)
npx @lgcyaxi/oh-my-claude tmux-config --force       # 覆盖已有配置

# 启动 Claude Code
npx @lgcyaxi/oh-my-claude cc                      # 自动启动代理 + 启动 claude
npx @lgcyaxi/oh-my-claude cc -r                    # 恢复上次会话（OMC 快捷方式）
npx @lgcyaxi/oh-my-claude cc -skip                 # 跳过权限确认
npx @lgcyaxi/oh-my-claude cc -wt                   # 隔离的 git worktree 会话
npx @lgcyaxi/oh-my-claude cc -rc                   # 远程控制模式
npx @lgcyaxi/oh-my-claude cc -p ds                # 直连 DeepSeek
npx @lgcyaxi/oh-my-claude cc -p km                # 直连 Kimi
npx @lgcyaxi/oh-my-claude cc -- --resume           # 转发参数给 claude

# 认证（OAuth）
npx @lgcyaxi/oh-my-claude auth login <供应商>      # 认证（openai/minimax/aliyun/kimi）
npx @lgcyaxi/oh-my-claude auth logout <供应商>     # 移除凭证
npx @lgcyaxi/oh-my-claude auth list               # 列出已认证供应商

# 代理（实时模型切换 — 每会话自动管理）
npx @lgcyaxi/oh-my-claude proxy                    # 显示会话概览
npx @lgcyaxi/oh-my-claude proxy status             # 活跃会话摘要
npx @lgcyaxi/oh-my-claude proxy sessions           # 详细会话列表
npx @lgcyaxi/oh-my-claude proxy switch             # 显示会话 + 可用模型
npx @lgcyaxi/oh-my-claude proxy switch <会话> <模型>  # 切换会话到指定模型
npx @lgcyaxi/oh-my-claude proxy revert [会话]      # 恢复为原生 Claude

# 菜单栏（GUI 会话管理器）
npx @lgcyaxi/oh-my-claude menubar                  # 启动菜单栏应用
npx @lgcyaxi/oh-my-claude menubar --dev            # 以开发模式运行
npx @lgcyaxi/oh-my-claude menubar --build          # 构建发布版应用
```

## 配置

配置文件位置：`~/.claude/oh-my-claude.json`

```json
{
  "providers": {
    "claude": {
      "type": "claude-subscription",
      "note": "使用 Claude Code 原生订阅"
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
      "note": "通过 oh-my-claude auth login openai 认证（用于 Codex 协作者）"
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

## 架构

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Claude Code 会话                                  │
├──────────────────────────────────────────────────────────────────────────┤
│  主智能体（Claude 订阅）                                                   │
│         │                                                                 │
│    ┌────┴────┬─────────────────┬──────────────┐                          │
│    ▼         ▼                 ▼              ▼                          │
│  Task 工具   MCP 服务器     Hooks       每会话代理                       │
│  (同步)      (异步)        (生命周期)  (自动管理)                        │
│    │           │                │              │                          │
│    ▼           ▼                ▼              ▼                          │
│  Claude      多供应商       settings.json  API 请求路由器                  │
│  子智能体    路由器         脚本              │                            │
│                │                         ┌────┴────┐                     │
│                │                         ▼         ▼                     │
│                ├── DeepSeek          Anthropic   外部供应商                │
│                ├── 智谱 GLM          (默认)     (已切换)                   │
│                ├── MiniMax                                                │
│                ├── Kimi                                                   │
│                └── Aliyun              菜单栏应用                          │
│                                        (GUI 会话管理器)                   │
└──────────────────────────────────────────────────────────────────────────┘
```

### 执行模式

- **Task 工具（同步）**：Claude 订阅智能体通过 Claude Code 原生 Task 工具运行
- **MCP 服务器（异步）**：外部 API 智能体通过 MCP 进行并行后台执行
- **代理（拦截）**：HTTP 代理拦截 Claude Code 的原生 API 请求，实现实时模型切换

## 开发

```bash
# 安装依赖
bun install

# 类型检查
bun run typecheck

# 构建所有组件
bun run build:all

# 运行测试
bun test

# 本地开发安装
bun run install-local
```

## 故障排除

### "Provider not configured"（供应商未配置）

请确保已设置 API 密钥环境变量：
```bash
export DEEPSEEK_API_KEY=your-key
```

### "Agent uses Claude subscription"（智能体使用 Claude 订阅）

部分智能体使用 Claude Code 的 Task 工具，而非 MCP 服务器。这些智能体在 Claude Code 内同步运行。

### MCP 服务器无响应

重新构建 MCP 服务器：
```bash
bun run build:mcp
npx @lgcyaxi/oh-my-claude install --force
```

### 检查详细状态

```bash
npx @lgcyaxi/oh-my-claude doctor --detail
```

## 贡献

欢迎贡献！请随时提交 Pull Request。

## 许可证

可持续使用许可证 - 详见 [LICENSE](LICENSE)。

本项目包含源自 [oh-my-opencode](https://github.com/nicepkg/opencode) 的智能体提示词。`src/agents/original/` 中的原始智能体提示词采用 MIT 许可证。

## 致谢

- 为 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 构建
- 使用 [Model Context Protocol](https://modelcontextprotocol.io/)
- 智能体工作流概念来自 [oh-my-opencode](https://github.com/nicepkg/opencode)
- Sequential Thinking MCP 来自 [@modelcontextprotocol/server-sequential-thinking](https://www.npmjs.com/package/@modelcontextprotocol/server-sequential-thinking)
