# /omc-codex

Delegate a task to the Codex daemon via the bridge. Auto-starts the daemon if not running.

## Instructions

Delegate the user's coding task to the Codex daemon (headless `codex app-server` via JSON-RPC 2.0).
The daemon operates autonomously — it reads files, edits code, and runs tests without requiring a terminal pane.

**Usage:** `/omc-codex <task description>`

**Examples:**
- `/omc-codex scaffold a new Next.js app with TypeScript`
- `/omc-codex fix the login bug in src/auth.ts`
- `/omc-codex refactor the payment module to use async/await`

## Execution

**Step 1: Check if Codex daemon is running**

```javascript
const status = await bridge_status();
const codexWorker = status.workers.find(w => w.name === "codex");
```

**Step 2: Auto-start if not running**

If `codexWorker` is null or undefined:
- Tell the user: "Starting Codex daemon..." (so they know what's happening)
- The daemon will auto-open a conversation viewer in your terminal (tmux split, WezTerm split, or new terminal window)
- Note: daemon startup takes a few seconds while it connects to the Codex app-server

```javascript
// The user will see the daemon start automatically via the viewer
// bridge_send will trigger startup if needed
```

**Step 3: Delegate task via bridge_send**

```javascript
await bridge_send({
  ai_name: "codex",
  message: "<user's task description>",
  wait_for_response: true
});
```

**Step 4: Return results**

Present Codex's response to the user. Codex operates with full file-system access (`danger-full-access` sandbox, `approvalPolicy: "never"`) — it directly edits files, runs tests, and verifies changes autonomously.

---

## Key Differences from Old Approach

- **No `Task(subagent_type="codex-cli")`** — Codex runs as a persistent headless daemon, not a one-shot task
- **Proc-based** — no terminal pane required; communication is via JSON-RPC 2.0 over stdio
- **Auto-viewer** — a live conversation log opens automatically in your terminal when the daemon starts
- **Autonomous file editing** — Codex modifies files itself; Claude Code just relays the task and presents results

## Daemon Architecture

The Codex daemon (`CodexAppServerDaemon`) communicates with `codex app-server` via JSON-RPC 2.0.
Start/stop via: `oh-my-claude bridge up codex` / `oh-my-claude bridge down codex`
View live conversation: `oh-my-claude m codex log`

---

**Memory Integration (MANDATORY):**
- **Before delegating**: call `mcp__oh-my-claude__recall` with keywords to surface prior project patterns.
- **After Codex completes**: call `mcp__oh-my-claude__remember` to store the approach, file paths modified, and any decisions made.
