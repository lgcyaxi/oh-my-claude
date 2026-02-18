# /omc-codex

Invoke OpenAI Codex CLI for scaffolding, boilerplate generation, and greenfield development.

## Instructions

Activate the Codex CLI agent for tasks requiring project scaffolding, boilerplate code, or autonomous implementation.

**Usage:** `/omc-codex <task description>`

**Examples:**
- `/omc-codex scaffold a new Next.js app with TypeScript`
- `/omc-codex create a REST API with Express and authentication`
- `/omc-codex generate a component library with Storybook`

## Agent Capabilities

**Codex CLI specializes in:**
- Project scaffolding and initialization
- Boilerplate code generation
- Autonomous multi-step implementation
- File and directory creation
- Test-driven development workflows

**Fallback Strategy:**
1. Try Codex CLI first (if installed)
2. Fall back to OpenCode for refactoring/UI tasks
3. Fall back to Claude native for architecture decisions

## Execution

**Step 1: Invoke Codex CLI agent**
```
Task(subagent_type="codex-cli") with the user's request
```

**Step 2: Handle fallback if Codex CLI not available**
If Codex CLI is not installed, delegate to opencode agent for implementation tasks, or use Claude native for analysis.

**Step 3: Return results**
Present the results from Codex CLI to the user, including created files, setup instructions, and any dependencies to install.

---

**Memory Integration (MANDATORY):**
- **Before working**: call `mcp__oh-my-claude-background__recall` with keywords from the request to check for prior project structures and conventions.
- **After completing**: call `mcp__oh-my-claude-background__remember` to store project setup patterns, scaffolding decisions, and architectural foundations.

**Note:** Codex CLI uses OpenAI's GPT-5.3-codex model for code generation and can run tests autonomously to iterate on implementations.
