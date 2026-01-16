# /omc-librarian

Consult Librarian for research via ZhiPu GLM (oh-my-claude).

## Instructions

The user wants research using the **Librarian** agent (ZhiPu GLM).

**To use Librarian, call the MCP tool:**

```
Use mcp__oh-my-claude-background__launch_background_task with:
- agent: "librarian"
- prompt: [user's research question]
```

Then poll for results:
```
Use mcp__oh-my-claude-background__poll_task with:
- task_id: [returned task_id]
```

**Librarian excels at:**
- External documentation research
- Library/API comparison
- Best practices lookup
- Multi-source synthesis
- Technical reference gathering

Now launch the Librarian background task with the user's research request.
