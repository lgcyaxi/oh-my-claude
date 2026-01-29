# /omc-librarian

Consult Librarian for research via ZhiPu GLM (oh-my-claude).

## Instructions

The user wants research using the **Librarian** agent (ZhiPu GLM).

**Step 1: Launch the task (non-blocking)**

```
Use mcp__oh-my-claude-background__launch_background_task with:
- agent: "librarian"
- prompt: [user's research question]
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
Use Claude Code's Task tool with model "sonnet" instead.

**Librarian excels at:**
- External documentation research
- Library/API comparison
- Best practices lookup
- Multi-source synthesis
- Technical reference gathering

Now launch the Librarian agent with the user's research request, then poll for results.
