# /omc-pend

Check for responses from AI assistants in the Multi-AI Bridge system.

## Instructions

The user wants to **check for pending responses** from delegated tasks in the Multi-AI Bridge. This polls the bridge for completed tasks and retrieves their results.

**Parse the arguments** to determine which assistants to check:
- `codex` — Check Codex responses
- `opencode` — Check OpenCode responses
- `gemini` — Check Gemini responses
- (no argument) — Check all assistants for responses (default)

### Step 1: Validate the argument

Check if the provided assistant name is valid. If invalid, suggest the valid options.

### Step 2: Poll for responses

Use the bridge control API to check for pending responses:

```
GET /bridge/assistants/{assistant}/responses
```

For no argument, check each assistant:
- codex
- opencode
- gemini

### Step 3: Display results

For each assistant with responses:
- Show the task ID
- Show the response content
- Show the completion timestamp
- Mark the response as retrieved

If no responses are pending, inform the user that all tasks are still processing.

### Examples

```
/omc-pend                  → Check all assistants for responses
/omc-pend codex            → Check only Codex responses
/omc-pend opencode         → Check only OpenCode responses
/omc-pend gemini           → Check only Gemini responses
```

### Response Format

Display responses in a clear format:

```
Codex (2 responses):
  ✓ task-001: [response preview]
  ✓ task-002: [response preview]

OpenCode (0 responses):
  (no pending responses)

Gemini (1 response):
  ✓ task-003: [response preview]
```

### Error Handling

If polling fails:
- Report the error to the user
- Suggest checking the bridge status with `/omc-status-bridge`
- Recommend retrying in a moment

### Prerequisites

The Multi-AI Bridge must be configured and accessible. If the bridge is not responding, suggest:
```
oh-my-claude bridge status
```

Now parse the user's arguments and check for responses.
