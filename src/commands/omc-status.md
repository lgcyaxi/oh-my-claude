# /omc-status

Display status dashboard for oh-my-claude MCP background agents.

## Instructions

The user wants to see the current status of MCP background agents. Display a formatted ASCII dashboard showing:

1. **Active Tasks** - Currently running background tasks
2. **Recent Tasks** - Last 5 completed/failed tasks

**Step 1: Get system status**

```
Use mcp__oh-my-claude-background__get_status to get:
- Provider configuration (which have API keys)
- Available agents
```

**Step 2: Get task list**

```
Use mcp__oh-my-claude-background__list_tasks with:
- limit: 20
(Gets recent tasks including running, completed, failed, fallback_required)
```

**Step 3: Display dashboard**

Format the output as an ASCII dashboard:

```
oh-my-claude Status Dashboard
==============================

ACTIVE TASKS (count)
  [agent]     task_id...  Provider  status duration

RECENT TASKS (last 5)
  [status] task_id agent  time_ago
```

**Status indicators:**
- `running` - Task is executing
- `completed` - Task finished successfully
- `failed` - Task encountered an error
- `fallback_required` - Provider API key not configured

**If no tasks:**
Display a message that no background tasks have been run yet, and suggest using `/omc-oracle` or other agent commands.

**If MCP server not available:**
Display an error message suggesting to run `oh-my-claude doctor` to check configuration.

Now gather the status and display the dashboard.
