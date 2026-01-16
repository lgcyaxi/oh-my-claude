# oh-my-claude

[English](README.md) | [中文](README.zh-CN.md)

为 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 打造的多供应商 MCP 服务器，提供专业化的智能体工作流。

通过 Anthropic 兼容 API 将后台任务路由到多个 AI 供应商（DeepSeek、智谱 GLM、MiniMax），同时充分利用 Claude Code 的原生能力。

## 特性

- **多供应商 MCP 服务器** - 支持 DeepSeek、智谱 GLM、MiniMax 的后台任务执行
- **专业化智能体工作流** - 预配置的专业智能体（Sisyphus、Oracle、Librarian 等）
- **斜杠命令** - 快捷操作（`/omcx-commit`、`/omcx-implement`）和智能体激活（`/omc-sisyphus`、`/omc-plan`）
- **规划系统** - 使用 Prometheus 智能体进行战略规划和巨石状态追踪
- **官方 MCP 一键安装** - 一条命令安装 Sequential Thinking、MiniMax 和 GLM MCP 服务
- **并发执行** - 按供应商限速和并行任务管理
- **Hook 集成** - 代码质量检查和待办追踪

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
# DeepSeek（用于 Oracle、Explore 智能体）
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

### 快捷操作命令（`/omcx-*`）

| 命令 | 描述 |
|------|------|
| `/omcx-commit` | 智能 git commit，使用约定式格式 |
| `/omcx-implement` | 按最佳实践实现功能 |
| `/omcx-refactor` | 重构代码并提升质量 |
| `/omcx-docs` | 生成或更新文档 |

## 智能体工作流

| 智能体 | 供应商 | 模型 | 角色 | 降级模型 |
|--------|--------|------|------|----------|
| **Sisyphus** | Claude（Task 工具）| claude-opus-4-5 | 主编排器 | - |
| **Claude-Reviewer** | Claude（Task 工具）| claude-sonnet-4-5 | 代码审查、质量保证 | - |
| **Claude-Scout** | Claude（Task 工具）| claude-haiku-4-5 | 快速探索 | - |
| **Prometheus** | Claude（Task 工具）| claude-opus-4-5 | 战略规划 | - |
| **Oracle** | DeepSeek（MCP）| deepseek-reasoner | 深度推理 | claude-opus-4-5 |
| **Librarian** | 智谱（MCP）| glm-4.7 | 外部研究 | claude-sonnet-4-5 |
| **Explore** | DeepSeek（MCP）| deepseek-chat | 代码库搜索 | claude-haiku-4-5 |
| **Frontend-UI-UX** | 智谱（MCP）| glm-4v-flash | 视觉/UI 设计 | claude-sonnet-4-5 |
| **Document-Writer** | MiniMax（MCP）| MiniMax-M2.1 | 文档编写 | claude-sonnet-4-5 |

### 自动降级

当供应商的 API 密钥未配置时，MCP 智能体会自动降级到 Claude 模型：

- **Oracle** → `claude-opus-4-5`（保持深度推理能力）
- **Librarian** → `claude-sonnet-4-5`（平衡的研究能力）
- **Explore** → `claude-haiku-4-5`（快速搜索操作）
- **Frontend-UI-UX** → `claude-sonnet-4-5`（优质视觉设计）
- **Document-Writer** → `claude-sonnet-4-5`（优质文档编写）

这使得 oh-my-claude 即使没有外部 API 密钥也能通过 Claude Code 订阅正常工作。

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

## 架构

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Claude Code 会话                                  │
├──────────────────────────────────────────────────────────────────────────┤
│  主智能体（Claude 订阅）                                                   │
│         │                                                                 │
│    ┌────┴────┬─────────────────┐                                         │
│    ▼         ▼                 ▼                                         │
│  Task 工具   MCP 服务器     Hooks                                         │
│  (同步)      (异步)        (生命周期)                                      │
│    │           │                │                                        │
│    ▼           ▼                ▼                                        │
│  Claude      多供应商       settings.json                                 │
│  子智能体    路由器         脚本                                           │
│                │                                                         │
│                ├── DeepSeek（Anthropic 兼容）                             │
│                ├── 智谱 GLM（Anthropic 兼容）                              │
│                ├── MiniMax（Anthropic 兼容）                              │
│                └── OpenRouter（OpenAI 兼容，可选）                         │
└──────────────────────────────────────────────────────────────────────────┘
```

### 执行模式

- **Task 工具（同步）**：Claude 订阅智能体通过 Claude Code 原生 Task 工具运行
- **MCP 服务器（异步）**：外部 API 智能体通过 MCP 进行并行后台执行

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
