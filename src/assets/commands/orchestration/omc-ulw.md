# /omc-ulw - Ultrawork Mode

**ULTRAWORK MODE ACTIVATION SEQUENCE**

## Phase 0: Permission Gate (CRITICAL)

Before any work begins, verify you are running with `--dangerously-skip-permissions`:

Check: Does the current session have unrestricted tool access? If you are unsure or if the user has NOT launched with `--dangerously-skip-permissions` (or `-skip`), **BLOCK immediately**:

```
BLOCKED: ULW requires --dangerously-skip-permissions.

Launch with: oh-my-claude cc -skip
```

**Do NOT proceed past this gate without skip-permissions.** ULW executes shell commands, file edits, and agent spawns without interruption — it requires full tool access.

If the user confirms they have skip-permissions, proceed to Phase 1.

---

## Phase 1: Information Gathering (NORMAL mode — ULW not yet active)

Before activating ULW, gather complete requirements:

1. **Read the task description** provided after `/omc-ulw`
2. **If the task is broad or unclear**, ask clarifying questions iteratively:
   - What is the exact scope?
   - What are the acceptance criteria?
   - Are there constraints or preferences?
   - Which files/modules are involved?
3. **Keep asking until you have a complete picture** — don't guess
4. **Summarize your understanding** and confirm with the user:
   ```
   My understanding:
   - [requirement 1]
   - [requirement 2]
   - [acceptance criteria]

   Shall I activate ULW and begin execution?
   ```
5. Wait for user confirmation before proceeding to Phase 2

**This phase runs in NORMAL mode.** No ULW behavior yet — take your time to understand the task fully.

---

## Phase 2: Activate ULW

Once the user confirms, activate ULW mode:

1. **Write mode.json** to enable ULW statusline indicator:
   ```bash
   # Extract session ID from ANTHROPIC_BASE_URL
   SESSION_ID=$(echo "$ANTHROPIC_BASE_URL" | grep -oP '/s/\K[a-zA-Z0-9_-]+')
   mkdir -p ~/.claude/oh-my-claude/sessions/$SESSION_ID
   echo '{"ulw":true}' > ~/.claude/oh-my-claude/sessions/$SESSION_ID/mode.json
   ```
   The statusline will now show `ULW`.

2. **Print activation banner:**
   ```
   **ULTRAWORK MODE ENABLED!**
   ```

3. **Create comprehensive todo list** — break down EVERY step, including verification

4. **Execute with full intensity** — follow the Core Mandate below

---

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
| **Hephaestus** | kimi/K2.5 | Intensive code generation |
| **Oracle** | aliyun/qwen3.6-plus | Architecture, deep reasoning |
| **Oracle** | deepseek/deepseek-v4-pro | Fast pattern review and reasoning (V4 thinking, effort=max) |
| **Research Route** | zhipu/glm-5.1 | External docs and library research via proxy |
| **Frontend-UI-UX** | kimi/K2.5 | All frontend/UI work |
| **Docs Route (Long-form)** | minimax/MiniMax-M2.7 | Documentation, README via proxy |
| **Navigator** | kimi/K2.5 | Visual-to-code, multimodal |

**Requires proxy** — launch via `oh-my-claude cc`. If `switch_model` fails, inform the user: "Proxy required. Launch via `oh-my-claude cc`."

For tasks requiring Claude's native tools (Edit, Write, Bash), work directly
on Claude without switching.

**FIRE PARALLEL AGENTS AGGRESSIVELY.** Launch multiple background tasks in parallel. Don't wait - collect results when ready.

## Memory Integration (MANDATORY)

**Before starting work:**
```
RECALL: mcp__oh-my-claude__recall(query="[relevant project/task keywords]")
→ Check for prior decisions, patterns, conventions from previous sessions
```

**After completing significant work:**
```
REMEMBER: mcp__oh-my-claude__remember(
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
- Proxy-routed docs/research models for external documentation when useful
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

---

## Phase 3: Completion

When ALL todos are verified complete:

1. **Deactivate ULW mode** — write mode.json to clear ulw flag:
   ```bash
   SESSION_ID=$(echo "$ANTHROPIC_BASE_URL" | grep -oP '/s/\K[a-zA-Z0-9_-]+')
   echo '{"ulw":false}' > ~/.claude/oh-my-claude/sessions/$SESSION_ID/mode.json
   ```

2. **Print completion summary:**
   ```
   **ULTRAWORK MODE COMPLETE**

   Summary:
   - [X completed tasks]
   - [verification results]
   - [key decisions made]
   ```

3. **Remember key findings** via `mcp__oh-my-claude__remember`

---

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
