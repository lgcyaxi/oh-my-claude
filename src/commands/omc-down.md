# /omc-down

Stop AI assistants in the Multi-AI Bridge system.

## Instructions

The user wants to **stop AI assistants** in the Multi-AI Bridge. This gracefully shuts down one or more AI providers and prevents them from accepting new tasks.

**Parse the arguments** to determine which assistants to stop:
- `codex` — Stop OpenAI Codex assistant
- `opencode` — Stop oh-my-claude OpenCode assistant
- `gemini` — Stop Google Gemini assistant
- `all` — Stop all running assistants (default if no argument provided)

### Step 1: Validate the argument

Check if the provided assistant name is valid. If invalid, suggest the valid options.

### Step 2: Stop the assistant(s)

Use the bridge control API to stop the specified assistant(s):

```
POST /bridge/assistants/{assistant}/stop
```

For `all`, stop each assistant sequentially:
- codex
- opencode
- gemini

### Step 3: Confirm to the user

Report which assistants have been stopped and are no longer accepting tasks.

### Examples

```
/omc-down                  → Stop all assistants
/omc-down codex            → Stop only Codex
/omc-down opencode         → Stop only OpenCode
/omc-down gemini           → Stop only Gemini
/omc-down all              → Stop all assistants
```

### Error Handling

If an assistant fails to stop:
- Report the error to the user
- Suggest checking the bridge status with `/omc-status-bridge`
- Note that the assistant may still be processing existing tasks

### Prerequisites

The Multi-AI Bridge must be configured and accessible. If the bridge is not responding, suggest:
```
oh-my-claude bridge status
oh-my-claude bridge stop
```

Now parse the user's arguments and execute the shutdown.
