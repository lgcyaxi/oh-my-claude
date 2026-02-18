# /omc-status-bridge

Display the status of the Multi-AI Bridge system.

## Instructions

The user wants to **check the status** of the Multi-AI Bridge. This shows the health, configuration, and activity of all connected AI assistants.

### Step 1: Query bridge status

Use the bridge control API to get comprehensive status:

```
GET /bridge/status
```

This returns:
- Overall bridge health (running/stopped/error)
- Each assistant's status (running/stopped/error)
- Active task count per assistant
- Pending response count per assistant
- Last activity timestamp
- Configuration summary

### Step 2: Display status dashboard

Format the status information clearly:

```
Multi-AI Bridge Status
═══════════════════════════════════════════════════════════════

Overall Status: ✓ Running

Assistants:
  Codex (OpenAI)
    Status: ✓ Running
    Active Tasks: 2
    Pending Responses: 1
    Last Activity: 2 minutes ago

  OpenCode (oh-my-claude)
    Status: ✓ Running
    Active Tasks: 0
    Pending Responses: 0
    Last Activity: 5 minutes ago

  Gemini (Google)
    Status: ✗ Stopped
    Active Tasks: 0
    Pending Responses: 0
    Last Activity: 1 hour ago

Configuration:
  Bridge URL: http://localhost:8080
  API Version: 1.0
  Uptime: 2 hours 34 minutes
```

### Step 3: Provide recommendations

Based on the status:
- If any assistant is down, suggest `/omc-up [assistant]`
- If there are pending responses, suggest `/omc-pend`
- If there are active tasks, show estimated completion time
- If bridge is unhealthy, suggest troubleshooting steps

### Examples

```
/omc-status-bridge         → Show full bridge status
```

### Error Handling

If the bridge is not responding:
- Report that the bridge is unreachable
- Suggest checking if it's running: `oh-my-claude bridge status`
- Recommend starting it: `oh-my-claude bridge start`

### Prerequisites

The Multi-AI Bridge must be configured. If not available, suggest:
```
oh-my-claude bridge init
oh-my-claude bridge start
```

Now query the bridge status and display the results.
