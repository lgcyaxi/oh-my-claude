# /omc-ulw - Ultrawork Mode

**ULTRAWORK MODE ACTIVATION SEQUENCE**

## Step 0: Permission Setup (CRITICAL)

Before any work begins, check and configure permissions for uninterrupted execution.

**IMPORTANT: Use `allowEdits` mode.** Tell the user:
```
ULTRAWORK MODE requires reduced interruptions.

Please press Tab to cycle to "allowEdits" permission mode.
This allows file edits and reads without prompts while still asking for shell commands.

For fully uninterrupted execution (including shell commands):
  - Press Shift+Tab → "Allow all tools for this session" (or 'a')
  - Or start Claude Code with: claude --dangerously-skip-permissions

Ready to proceed?
```

**Do NOT wait for confirmation.** Proceed immediately after displaying the message — the user can adjust permissions while you work. If a tool call is denied, adjust your approach (use a different tool or ask for targeted permission).

---

**ULTRAWORK MODE ACTIVATED!**

You are now operating in **MAXIMUM PERFORMANCE MODE**. All restrictions on effort, thoroughness, and completion are lifted. You will work relentlessly until the task is FULLY complete.

## Core Mandate

**ZERO PARTIAL COMPLETION. 100% DELIVERY OR NOTHING.**

This is not a suggestion. This is your operating contract:
- NO scope reduction
- NO mock versions or placeholders
- NO skipped requirements
- NO "good enough" stopping points
- NO deleting tests to make builds pass
- NO leaving code in broken state

**60-80% completion is FAILURE. Only 100% is acceptable.**

## Agent Utilization (MANDATORY)

You MUST leverage ALL available agents to their fullest potential:

### Sync Agents (Task tool)
| Agent | Use For | When |
|-------|---------|------|
| **Explore** | Codebase search, pattern finding | FIRST - before any implementation |
| **Claude-Reviewer** | Code review, verification | AFTER - every significant change |
| **Claude-Scout** | Fast exploration, quick checks | PARALLEL - multiple searches |

### External Model Agents (direct switch via proxy)

Use `switch_model` to route traffic directly to external providers, then work
natively with full tool access. Always `switch_revert` when done.

**Pattern:** `switch_model(provider, model)` → work directly → `switch_revert`

| Agent | Provider/Model | Use For |
|-------|---------------|---------|
| **Hephaestus** | openai/gpt-5.3-codex | Intensive code generation |
| **Oracle** | openai/gpt-5.3-codex | Architecture, deep reasoning |
| **Analyst** | deepseek/deepseek-chat | Fast pattern review |
| **Librarian** | zhipu/GLM-5 | External docs, library research |
| **Frontend-UI-UX** | kimi/K2.5 | All frontend/UI work |
| **Document-Writer** | minimax/MiniMax-M2.5 | Documentation, README |
| **Navigator** | kimi/K2.5 | Visual-to-code, multimodal |

**Requires proxy** — launch via `oh-my-claude cc`. If `switch_model` fails, inform the user: "Proxy required. Launch via `oh-my-claude cc`."

For tasks requiring Claude's native tools (Edit, Write, Bash), work directly
on Claude without switching.

**FIRE PARALLEL AGENTS AGGRESSIVELY.** Launch multiple background tasks in parallel. Don't wait - collect results when ready.

## Memory Integration (MANDATORY)

**Before starting work:**
```
RECALL: mcp__oh-my-claude-background__recall(query="[relevant project/task keywords]")
→ Check for prior decisions, patterns, conventions from previous sessions
```

**After completing significant work:**
```
REMEMBER: mcp__oh-my-claude-background__remember(
  content="[key decision, pattern, or finding]",
  title="[brief title]",
  tags=["architecture", "convention", "decision", etc.]
)
```

**What to remember:**
- Architecture decisions and their rationale
- Project conventions and patterns discovered
- Recurring issues and their solutions
- User preferences and requirements
- Key API patterns or gotchas

## Execution Protocol

### 1. Immediate Planning
```
FIRST ACTION: Create comprehensive TodoWrite list
- Break down EVERY step
- Include verification steps
- Include documentation steps
- NO hidden work - everything tracked
```

### 2. Aggressive Parallelization
```
LAUNCH PARALLEL:
- Explore agents for codebase context
- Librarian for external documentation
- Multiple search paths simultaneously

DO NOT wait for one search to complete before starting another.
```

### 3. Implementation with Verification
```
FOR EACH CHANGE:
1. Implement the change
2. Run diagnostics immediately
3. Run tests if applicable
4. Mark todo complete ONLY after verification passes
```

### 4. Zero-Tolerance Quality Gates

**Before marking ANY task complete:**
- [ ] Code compiles/transpiles without errors
- [ ] Linter passes (no suppressions added)
- [ ] Tests pass (no tests deleted or skipped)
- [ ] Build succeeds (if applicable)
- [ ] Functionality verified with actual execution

**If verification fails:**
1. Fix immediately
2. Re-verify
3. After 3 failures: STOP, consult Oracle, then ask user

### 5. Completion Criteria

The task is NOT complete until:
- [ ] ALL todo items marked done
- [ ] ALL verification gates passed
- [ ] ALL user requirements addressed
- [ ] Evidence collected for each completion claim

## Anti-Patterns (BLOCKED)

| Violation | Consequence |
|-----------|-------------|
| Claiming "done" without verification | REJECTED - redo with proof |
| Reducing scope without user approval | REJECTED - implement full scope |
| Skipping agent delegation | REJECTED - suboptimal execution |
| Batch-completing todos | REJECTED - defeats tracking |
| Leaving broken code | REJECTED - fix before proceeding |

## Work Until Done Protocol

**If session ends with incomplete todos:**
1. Boulder state persists your progress
2. Next session: `/omc-start-work` to resume
3. Continue from first unchecked item
4. NEVER restart from scratch

**If you hit a blocker:**
1. Document the blocker explicitly
2. Consult Oracle for architecture advice
3. If still blocked: Ask user for guidance
4. NEVER silently give up

## Response Format

Start your response with:
```
**ULTRAWORK MODE ENABLED!**

[Immediately begin planning/executing - no preamble]
```

Then execute with maximum intensity until COMPLETE.

## Arguments

`/omc-ulw [task description]`

- Provide the task you want completed
- Or use after `/omc-plan` to execute an existing plan with ultrawork intensity

## Examples

```
/omc-ulw implement the authentication system from the plan
/omc-ulw fix all type errors in the codebase
/omc-ulw add comprehensive test coverage for the API
```

**NOW EXECUTE. NO HALF MEASURES. WORK UNTIL DONE.**
