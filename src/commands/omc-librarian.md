# /omc-librarian

Consult Librarian for research via ZhiPu GLM (oh-my-claude).

## Instructions

The user wants research using the **Librarian** agent (ZhiPu GLM).

**To use Librarian, call the MCP tool:**

```
Use mcp__oh-my-claude-background__execute_agent with:
- agent: "librarian"
- prompt: [user's research question]
```

This will block until Librarian responds with the research.

**If you receive a "fallback_required" response:**
Use Claude Code's Task tool with model "sonnet" instead.

**If you receive a "timeout" response:**
Use the returned task_id with poll_task to check for results later.

**Librarian excels at:**
- External documentation research
- Library/API comparison
- Best practices lookup
- Multi-source synthesis
- Technical reference gathering

Now execute the Librarian agent with the user's research request.
