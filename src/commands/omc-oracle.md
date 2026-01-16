# /omc-oracle

Consult Oracle for deep reasoning via DeepSeek Reasoner (oh-my-claude).

## Instructions

The user wants deep analysis using the **Oracle** agent (DeepSeek Reasoner).

**To use Oracle, call the MCP tool:**

```
Use mcp__oh-my-claude-background__launch_background_task with:
- agent: "oracle"
- prompt: [user's question or analysis request]
```

Then poll for results:
```
Use mcp__oh-my-claude-background__poll_task with:
- task_id: [returned task_id]
```

**Oracle excels at:**
- Architecture decisions
- Complex trade-off analysis
- Multi-factor reasoning
- Identifying edge cases
- Long-term consequence evaluation

Now launch the Oracle background task with the user's request.
