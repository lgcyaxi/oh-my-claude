# /omc-up

Start AI assistants in the Multi-AI Bridge system.

## Instructions

The user wants to **start AI assistants** in the Multi-AI Bridge. This activates one or more AI providers to begin accepting delegated tasks.

**Parse the arguments** to determine which assistants to start:
- `codex` — Start OpenAI Codex assistant
- `opencode` — Start oh-my-claude OpenCode assistant
- `gemini` — Start Google Gemini assistant
- `all` — Start all available assistants (default if no argument provided)

### Step 1: Validate the argument

Check if the provided assistant name is valid. If invalid, suggest the valid options.

### Step 2: Start the assistant(s)

Use the bridge control API to start the specified assistant(s):

```
POST /bridge/assistants/{assistant}/start
```

For `all`, start each assistant sequentially:
- codex
- opencode
- gemini

### Step 3: Confirm to the user

Report which assistants have been started and are ready to accept tasks.

### Examples

```
/omc-up                    → Start all assistants (codex, opencode, gemini)
/omc-up codex              → Start only Codex
/omc-up opencode           → Start only OpenCode
/omc-up gemini             → Start only Gemini
/omc-up all                → Start all assistants
```

### Error Handling

If an assistant fails to start:
- Report the error to the user
- Suggest checking the bridge status with `/omc-status-bridge`
- Recommend checking logs for more details

### Prerequisites

The Multi-AI Bridge must be configured and accessible. If the bridge is not responding, suggest:
```
oh-my-claude bridge status
oh-my-claude bridge start
```

Now parse the user's arguments and execute the startup.
