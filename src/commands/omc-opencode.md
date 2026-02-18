# /omc-opencode

Invoke OpenCode (Codeium) for refactoring, UI design, and code comprehension.

## Instructions

Activate the OpenCode agent for tasks requiring code refactoring, UI/UX design, or code understanding.

**Usage:** `/omc-opencode <task description>`

**Examples:**
- `/omc-opencode refactor this component to use React hooks`
- `/omc-opencode design a dark-themed login page`
- `/omc-opencode explain how the authentication flow works`

## Agent Capabilities

**OpenCode specializes in:**
- Code refactoring (rename, restructure, extract)
- UI/UX design and implementation
- Code comprehension and explanation
- Pattern-based code transformations
- Natural language code search

**Fallback Strategy:**
1. Try OpenCode first (if installed)
2. Fall back to Codex CLI for scaffolding tasks
3. Fall back to Claude native for architecture decisions

## Execution

**Step 1: Invoke OpenCode agent**
```
Task(subagent_type="opencode") with the user's request
```

**Step 2: Handle fallback if OpenCode not available**
If OpenCode CLI is not installed, delegate to codex-cli agent for implementation tasks, or use Claude native for analysis.

**Step 3: Return results**
Present the results from OpenCode to the user, including any code changes, explanations, or design recommendations.

---

**Memory Integration (MANDATORY):**
- **Before working**: call `mcp__oh-my-claude-background__recall` with keywords from the request to check for prior design decisions and patterns.
- **After completing**: call `mcp__oh-my-claude-background__remember` to store key refactoring decisions, UI patterns, and code organization insights.

**Note:** OpenCode uses Gemini internally for visual/UI tasks and ChatGPT for coding tasks through Codeium's unified interface.
