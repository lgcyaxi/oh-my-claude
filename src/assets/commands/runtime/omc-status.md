# /omc-status

Display the current oh-my-claude session status.

## Instructions

Show a concise status dashboard. Prefer the unified `coworker_task(action=...)`
surface for coworker inspection. Use only fast, non-blocking tool calls.

**Step 1: Check proxy session**

Read the `OMC_PROXY_CONTROL_PORT` environment variable.

- If set: call `curl http://localhost:{OMC_PROXY_CONTROL_PORT}/status`
- If not set: proxy is inactive

**Step 2: Check coworker runtimes**

Call `mcp__oh-my-claude__coworker_task` with `action: "status"` to get running coworkers.

For each coworker, surface:

- runtime `status`
- `sessionId`
- `activeTaskCount`
- `signalState`
- `viewerAvailable`
- `viewerAttached`
- `agent`
- `provider`
- `model`
- `approvalPolicy`
- `approvalPolicy` reports the actual effective policy, not just the raw caller input
- pending approvals, if any
  - include decision options
  - include question ids/options when the approval is a `request_user_input`
  - include structured details when available (command, cwd, proposed policy amendments, permission options)
- `lastActivityAt`

**Step 3: Read recent coworker activity**

Call `mcp__oh-my-claude__coworker_task` with `action: "recent_activity"` and `limit: 5`.

**Step 4: Display**

```
oh-my-claude  ·  session status
────────────────────────────────────────
PROXY
  Port    : {port}            (or: inactive)
  Session : {sessionId}
  Routing : {provider}/{model}  |  native Claude  |  ~{provider} (auto-route)

CO-WORKERS
  {name}  →  state:{status}  signal:{signalState}
             session:{sessionId}  active:{activeTaskCount}
             viewer:{viewerAvailable}/{viewerAttached}
             last:{lastActivityAt}

RECENT ACTIVITY
  {target}  {type}  {content}
  (none running)
────────────────────────────────────────
Tip: /omc-switch to see available models
```

If no proxy: suggest `omc cc` to start a session.  
If no coworkers: suggest `/codex:rescue` or `/omc-opencode`.  
If MCP is unavailable after a long-running timeout: suggest opening a fresh
Claude Code session first, then fall back to `oh-my-claude doctor`.
