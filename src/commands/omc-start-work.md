# /omc-start-work

Start a Sisyphus work session to execute a Prometheus-generated work plan.

## Instructions

You are starting a **Sisyphus work session** to execute tasks from a work plan.

### Step 1: Check for Active Work

Read `.sisyphus/boulder.json` if it exists:
- If exists AND plan is NOT complete (has unchecked boxes): **RESUME** existing work
- If no active plan OR plan is complete: **SELECT** a new plan

### Step 2: Find Available Plans

Search for Prometheus-generated plan files at `.sisyphus/plans/*.md`

**Decision Logic:**
| Situation | Action |
|-----------|--------|
| boulder.json exists, plan incomplete | Append session, continue work |
| No boulder.json, ONE plan available | Auto-select it |
| No boulder.json, MULTIPLE plans | Show list, ask user to select |
| No plans found | Tell user to run `/omc-plan` first |

### Step 3: Create/Update boulder.json

When starting or resuming work, ensure `.sisyphus/boulder.json` contains:
```json
{
  "active_plan": "/absolute/path/to/plan.md",
  "started_at": "ISO_TIMESTAMP",
  "session_ids": ["session_id_1", "session_id_2"],
  "plan_name": "plan-name"
}
```

### Step 4: Execute the Plan

1. Read the FULL plan file
2. Create TodoWrite items for each unchecked task in the plan
3. Execute tasks sequentially, marking checkboxes as you complete them
4. Follow Sisyphus orchestration protocols (delegate when appropriate)

## Output Formats

**When listing plans for selection:**
```
Available Work Plans

1. [plan-name-1] - Progress: 3/10 tasks
2. [plan-name-2] - Progress: 0/5 tasks

Which plan would you like to work on? (Enter number or plan name)
```

**When resuming existing work:**
```
Resuming Work Session

Active Plan: {plan-name}
Progress: {completed}/{total} tasks
Sessions: {count} (appending current session)

Reading plan and continuing from last incomplete task...
```

**When auto-selecting single plan:**
```
Starting Work Session

Plan: {plan-name}
Progress: 0/{total} tasks

Reading plan and beginning execution...
```

**When no plans found:**
```
No work plans found.

Create a plan first by running: /omc-plan "your task description"
```

## Memory Integration (MANDATORY)

- **Before starting work**: call `mcp__oh-my-claude-background__recall` with the plan name and task keywords to retrieve prior context from previous sessions.
- **After completing tasks**: call `mcp__oh-my-claude-background__remember` to store decisions made, problems solved, and patterns discovered during execution.

## Critical Rules

1. **ALWAYS update boulder.json** before starting work
2. **Read the FULL plan file** before delegating any tasks
3. **Mark checkboxes in the plan file** as tasks are completed (`- [ ]` → `- [x]`)
4. **Track progress with TodoWrite** - create todos from plan tasks
5. **Follow Sisyphus delegation protocols** when delegating to other agents

## Arguments

`/omc-start-work [plan-name]`

- If plan-name provided: Start that specific plan
- If no argument: Auto-select if one plan, or list available plans
