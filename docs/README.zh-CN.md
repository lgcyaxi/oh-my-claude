# oh-my-claude

[English](README.md) | [中文](README.zh-CN.md)

为 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 打造的多供应商 MCP 服务器，提供专业化的智能体工作流。

通过 Anthropic 兼容 API 将后台任务路由到多个 AI 供应商（DeepSeek、智谱 GLM、MiniMax），同时充分利用 Claude Code 的原生能力。

## 特性

- **多供应商 MCP 服务器** - 支持 DeepSeek、智谱 GLM、MiniMax 的后台任务执行
- **并发后台任务** - 支持多智能体并行运行，可配置并发限制
- **专业化智能体工作流** - 预配置的专业智能体（Sisyphus、Oracle、Librarian 等）
- **斜杠命令** - 快捷操作（`/omcx-commit`、`/omcx-implement`）和智能体激活（`/omc-sisyphus`、`/omc-plan`）
- **实时状态栏** - 显示活跃智能体、任务进度和并发槽位
- **规划系统** - 使用 Prometheus 智能体进行战略规划和巨石状态追踪
- **官方 MCP 一键安装** - 一条命令安装 Sequential Thinking、MiniMax 和 GLM MCP 服务
- **Hook 集成** - 代码质量检查和待办追踪
- **输出样式管理器** - 通过 CLI 在内置和自定义输出样式之间切换
- **记忆系统** - 基于 Markdown 的持久化记忆，支持 MCP 工具（remember、recall、forget）
- **实时模型切换** - HTTP 代理实现对话中模型切换，支持外部供应商（DeepSeek、智谱 GLM、MiniMax）
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

# 智谱 GLM（用于 Librarian、Frontend-UI-UX 智能体）
export ZHIPU_API_KEY=your-zhipu-api-key

# MiniMax（用于 Document-Writer 智能体）
export MINIMAX_API_KEY=your-minimax-api-key
```

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

## 斜杠命令

### 智能体命令（`/omc-*`）

| 命令 | 描述 |
|------|------|
| `/omc-sisyphus` | 激活 Sisyphus - 完整实现编排器 |
| `/omc-oracle` | 激活 Oracle - 深度推理和架构 |
| `/omc-librarian` | 激活 Librarian - 外部研究和文档 |
| `/omc-reviewer` | 激活 Claude-Reviewer - 代码审查和质量保证 |
| `/omc-scout` | 激活 Claude-Scout - 快速探索 |
| `/omc-explore` | 激活 Explore - 代码库搜索 |
| `/omc-plan` | 使用 Prometheus 开始战略规划 |
| `/omc-start-work` | 开始执行现有计划 |
| `/omc-status` | 显示 MCP 后台智能体状态仪表板 |
| `/omc-switch` | 切换到外部供应商模型（如 `/omc-switch ds-r 3`） |

### 快捷操作命令（`/omcx-*`）

| 命令 | 描述 |
|------|------|
| `/omcx-commit` | 智能 git commit，使用约定式格式 |
| `/omcx-implement` | 按最佳实践实现功能 |
| `/omcx-refactor` | 重构代码并提升质量 |
| `/omcx-docs` | 生成或更新文档 |
| `/omcx-issue` | 向 oh-my-claude GitHub Issues 报告 Bug |

### 模式命令

| 命令 | 描述 |
|------|------|
| `/ulw` | **超级工作模式** - 最高性能，工作到完成 |

#### 超级工作模式（`/ulw`）

超级工作模式激活**最高性能执行**，采用零容忍完成策略：

- **100% 交付** - 不允许部分完成、不允许缩小范围、不允许占位符
- **激进并行化** - 同时启动多个智能体
- **强制验证** - 代码编译、测试通过、构建成功
- **工作到完成** - 持续执行直到所有任务标记完成

**使用方法：**
```bash
/ulw 根据计划实现认证系统
/ulw 修复代码库中的所有类型错误
/ulw 为 API 添加全面的测试覆盖
```

**核心特性：**
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

**可用分段：** `model`、`git`、`directory`、`context`、`session`、`output-style`、`mcp`、`memory`、`proxy`

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

oh-my-claude 内置基于 Markdown 的记忆系统，可跨会话持久化知识。记忆以人类可读的 `.md` 文件存储 — 支持 Git 版本控制、手动编辑，索引始终可从源文件重建。

### 存储结构

```
~/.claude/oh-my-claude/memory/
├── sessions/    # 自动归档的会话摘要
└── notes/       # 用户创建的持久记忆
```

### MCP 工具

| 工具 | 说明 |
|------|------|
| `remember` | 存储记忆，可选标题、类型和标签 |
| `recall` | 按文本查询搜索记忆，支持相关度排序 |
| `forget` | 按 ID 删除特定记忆 |
| `list_memories` | 浏览记忆，支持类型和日期过滤 |
| `memory_status` | 显示记忆存储统计信息 |

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
created: 2026-01-29T10:00:00.000Z
updated: 2026-01-29T10:00:00.000Z
---

团队偏好使用 hooks 的函数式组件而非类组件。
使用 `useState` 和 `useEffect` 替代类生命周期方法。
```

## 实时模型切换

oh-my-claude 内置 HTTP 代理，支持**对话中模型切换** — 将 Claude Code 的 API 请求临时路由到外部供应商（DeepSeek、智谱 GLM、MiniMax），不会丢失对话上下文。

### 工作原理

```
  Claude Code
       │  ANTHROPIC_BASE_URL=http://localhost:18910
       ▼
  ┌─────────────────────────────────────────────┐
  │  oh-my-claude 代理 (localhost:18910)         │
  │                                              │
  │  switched=false?  → 透传到 Anthropic         │
  │  switched=true?   → 转发到外部供应商          │
  │                     (DeepSeek/智谱/MiniMax)  │
  └─────────────────────────────────────────────┘
```

所有目标供应商使用 **Anthropic 兼容**的 `/v1/messages` 端点。代理仅重写：目标主机、API 密钥头和模型字段 — 无需格式转换。

### 快速开始

```bash
# 1. 启用代理
oh-my-claude proxy enable

# 2. 启动代理服务器
oh-my-claude proxy start

# 3. 设置环境变量（代理启动时会打印）
export ANTHROPIC_BASE_URL=http://localhost:18910   # Linux/macOS
set ANTHROPIC_BASE_URL=http://localhost:18910      # Windows

# 4. 正常使用 Claude Code — 所有请求透传到 Anthropic
```

> **Windows**：代理 CLI 完全跨平台。健康检查使用 Node 的 `http` 模块（无需 `curl`），进程管理使用 PID 文件和 `wmic` 回退（无需 `pgrep`）。

### 切换模型

**通过斜杠命令**（最简单 — 在 Claude Code 对话中）：
```
/omc-switch ds-r 3          # 3 个请求通过 DeepSeek Reasoner
/omc-switch deepseek deepseek-chat
/omc-switch zhipu glm-4.7 5
/omc-switch revert           # 切换回原生 Claude
```

**快捷别名：**

| 快捷名 | 供应商 | 模型 |
|--------|--------|------|
| `ds` | deepseek | deepseek-chat |
| `ds-r` | deepseek | deepseek-reasoner |
| `zp` | zhipu | glm-4.7 |
| `mm` | minimax | MiniMax-M2.1 |

**通过 MCP 工具：**
```
switch_model(provider="deepseek", model="deepseek-chat", requests=3)
```

**通过 CLI：**
```bash
oh-my-claude proxy switch deepseek deepseek-chat
```

**通过控制 API：**
```bash
curl -X POST http://localhost:18911/switch \
  -H "Content-Type: application/json" \
  -d '{"provider":"deepseek","model":"deepseek-chat","requests":3}'
```

### MCP 工具

| 工具 | 说明 |
|------|------|
| `switch_model` | 将接下来 N 个请求切换到外部供应商 |
| `switch_status` | 查询当前代理切换状态 |
| `switch_revert` | 立即恢复为原生 Claude |

### 安全特性

- **自动恢复**：N 个请求后（默认：1），自动恢复为原生 Claude
- **斜杠命令开销跳过**：切换后前 2 个请求不计数（补偿斜杠命令内部 API 调用）
- **超时机制**：切换在超时后过期（默认：10 分钟）
- **优雅降级**：如果供应商 API 密钥缺失，静默回退到原生 Claude
- **错误恢复**：供应商请求失败时自动回退到原生 Claude
- **默认关闭**：代理默认禁用，需显式启用

### 代理 CLI 命令

```bash
oh-my-claude proxy start                          # 启动代理守护进程
oh-my-claude proxy stop                           # 停止代理守护进程
oh-my-claude proxy status                         # 显示代理状态
oh-my-claude proxy enable                         # 在配置中启用
oh-my-claude proxy disable                        # 在配置中禁用
oh-my-claude proxy switch <供应商> <模型>          # 手动切换模型
```

### 配置

添加到 `~/.claude/oh-my-claude.json`：

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

## 智能体工作流

oh-my-claude 提供两种类型的智能体：

### Claude Code 内置智能体（Task 工具）

这些智能体通过 Claude Code 的原生 Task 工具运行。**模型选择由 Claude Code 内部控制** - 我们无法更改使用的模型。

| 智能体 | 角色 | 调用方式 |
|--------|------|----------|
| **Sisyphus** | 主编排器 | `/omc-sisyphus` |
| **Claude-Reviewer** | 代码审查、质量保证 | `/omc-reviewer` |
| **Claude-Scout** | 快速探索 | `/omc-scout` |
| **Prometheus** | 战略规划 | `/omc-plan` |
| **Explore** | 代码库搜索 | `Task(subagent_type="Explore")` |

### MCP 后台智能体（外部 API）

这些智能体通过 oh-my-claude 的 MCP 服务器运行，使用外部 API 供应商。**我们可以通过配置控制模型选择**。

| 智能体 | 供应商 | 模型 | 角色 |
|--------|--------|------|------|
| **Oracle** | Claude | claude-sonnet-4.5 | 深度推理 |
| **Analyst** | DeepSeek | deepseek-chat | 快速代码分析 |
| **Librarian** | 智谱 | glm-4.7 | 外部研究 |
| **Frontend-UI-UX** | 智谱 | glm-4v-flash | 视觉/UI 设计 |
| **Document-Writer** | MiniMax | MiniMax-M2.1 | 文档编写 |

**调用方式：** `launch_background_task(agent="oracle", prompt="...")` 或 `execute_agent(agent="oracle", prompt="...")`

**直接模型访问：** `execute_with_model(provider="deepseek", model="deepseek-reasoner", prompt="...")` — 绕过智能体路由，直接调用模型，节省 Token 开销。

> **注意：** 如果供应商的 API 密钥未配置，使用该供应商的任务将失败。在使用依赖特定供应商的智能体前，请先设置所需的环境变量（如 `DEEPSEEK_API_KEY`）。

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

# 代理（实时模型切换）
npx @lgcyaxi/oh-my-claude proxy start             # 启动代理守护进程
npx @lgcyaxi/oh-my-claude proxy stop              # 停止代理守护进程
npx @lgcyaxi/oh-my-claude proxy status            # 显示代理状态
npx @lgcyaxi/oh-my-claude proxy enable            # 在配置中启用代理
npx @lgcyaxi/oh-my-claude proxy disable           # 在配置中禁用代理
npx @lgcyaxi/oh-my-claude proxy switch <供应商> <模型>  # 切换到供应商/模型
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
│  Task 工具   MCP 服务器     Hooks          代理                           │
│  (同步)      (异步)        (生命周期)     (拦截)                          │
│    │           │                │              │                          │
│    ▼           ▼                ▼              ▼                          │
│  Claude      多供应商       settings.json  API 请求路由器                  │
│  子智能体    路由器         脚本              │                            │
│                │                         ┌────┴────┐                     │
│                │                         ▼         ▼                     │
│                ├── DeepSeek          Anthropic   外部供应商                │
│                ├── 智谱 GLM          (默认)     (已切换)                   │
│                ├── MiniMax                                                │
│                └── OpenRouter                                            │
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
