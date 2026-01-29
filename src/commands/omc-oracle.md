# /omc-oracle

Consult Oracle for deep reasoning via DeepSeek Reasoner (oh-my-claude).

## Instructions

The user wants deep analysis using the **Oracle** agent (DeepSeek Reasoner).

**Step 1: Launch the task (non-blocking)**

```
Use mcp__oh-my-claude-background__launch_background_task with:
- agent: "oracle"
- prompt: [user's question or analysis request]
```

This returns a task_id immediately. The statusline will show progress.

**Step 2: Poll for results (with wait)**

```
Use mcp__oh-my-claude-background__poll_task with:
- task_id: [the task_id from step 1]
- wait_seconds: 30
```

This waits up to 30 seconds per call. Repeat until status is "completed" or "failed".

**If you receive a "fallback_required" response:**
Use Claude Code's Task tool with model "opus" instead.

**Oracle excels at:**
- Architecture decisions
- Complex trade-off analysis
- Multi-factor reasoning
- Identifying edge cases
- Long-term consequence evaluation

Now launch the Oracle agent with the user's request, then poll for results.
