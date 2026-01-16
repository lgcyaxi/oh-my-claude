# /omc-explore

Fast codebase exploration via DeepSeek Chat (oh-my-claude).

## Instructions

The user wants fast codebase exploration using the **Explore** agent (DeepSeek Chat).

**To use Explore, call the MCP tool:**

```
Use mcp__oh-my-claude-background__launch_background_task with:
- agent: "explore"
- prompt: [what to find/explore in the codebase]
```

Then poll for results:
```
Use mcp__oh-my-claude-background__poll_task with:
- task_id: [returned task_id]
```

**Explore excels at:**
- Finding specific files/functions
- Understanding code flow
- Locating patterns
- Mapping dependencies
- Quick codebase navigation

Now launch the Explore background task with the user's exploration request.
