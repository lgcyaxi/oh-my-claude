# /omc-status

Display the current oh-my-claude session status.

## Instructions

Show a concise status dashboard. Use only fast, non-blocking tool calls.

**Step 1: Check proxy session**

Read the `OMC_PROXY_CONTROL_PORT` environment variable.
- If set: call `curl http://localhost:{OMC_PROXY_CONTROL_PORT}/status` to get provider, model, session ID, switched state
- If not set: proxy is inactive

**Step 2: Check bridge workers**

Call `mcp__oh-my-claude__bridge_status` to get running workers.

**Step 3: Display**

```
oh-my-claude  ·  session status
────────────────────────────────────────
PROXY
  Port    : {port}            (or: inactive)
  Session : {sessionId}
  Routing : {provider}/{model}  |  native Claude  |  ~{provider} (auto-route)

BRIDGE WORKERS
  {name}  →  {target}
  (none running)
────────────────────────────────────────
Tip: /omc-switch to see available models
```

If no proxy: suggest `omc cc` to start a session.
If no bridge workers: suggest `oh-my-claude bridge up cc`.
If MCP unavailable: suggest `oh-my-claude doctor`.
