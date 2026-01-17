# /omc-oracle

Consult Oracle for deep reasoning via DeepSeek Reasoner (oh-my-claude).

## Instructions

The user wants deep analysis using the **Oracle** agent (DeepSeek Reasoner).

**To use Oracle, call the MCP tool:**

```
Use mcp__oh-my-claude-background__execute_agent with:
- agent: "oracle"
- prompt: [user's question or analysis request]
```

This will block until Oracle responds with the analysis.

**If you receive a "fallback_required" response:**
Use Claude Code's Task tool with model "opus" instead.

**If you receive a "timeout" response:**
Use the returned task_id with poll_task to check for results later.

**Oracle excels at:**
- Architecture decisions
- Complex trade-off analysis
- Multi-factor reasoning
- Identifying edge cases
- Long-term consequence evaluation

Now execute the Oracle agent with the user's request.
