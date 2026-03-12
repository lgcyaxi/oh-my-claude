# /omc-codex

Assign a task to the Codex coworker. Codex App Service is the native execution
path.

## Instructions

Delegate the user's coding task to the Codex coworker (headless
`codex app-server` via JSON-RPC 2.0). Codex operates autonomously — it reads
files, edits code, and runs tests while the viewer/log panel shows progress.

Describe the task in terms of goal, scope, and completion criteria. Do not
provide detailed implementation steps unless the user explicitly requires that
level of control.

**Usage:** `/omc-codex <task description>`

**Examples:**

- `/omc-codex scaffold a new Next.js app with TypeScript`
- `/omc-codex fix the login bug in src/auth.ts`
- `/omc-codex refactor the payment module to use async/await`

## Execution

**Step 1: Check if the Codex coworker runtime is available**

```javascript
const status = await coworker_task({ action: "status" });
const codexWorker = status.coworkers.find(w => w.name === "codex");
```

**Step 2: Auto-start if not running**

If `codexWorker` is null or undefined:

- Tell the user: "Starting Codex daemon..." (so they know what's happening)
- The daemon will auto-open a conversation viewer in your terminal (tmux split,
  WezTerm split, or new terminal window)
- Note: daemon startup takes a few seconds while it connects to the Codex
  app-server

```javascript
// The user will see the daemon start automatically via the viewer
// coworker_task(action="send", ...) will trigger startup if needed
```

**Step 3: Send the task to the coworker runtime**

```javascript
await coworker_task({
  action: "send",
  target: "codex",
  message: "<user's task description>",
  timeout_ms: 120000,
  approval_policy: "on-request" // optional: protocol-native approval behavior
});
```

For review-specific work, prefer `coworker_task(action="review", ...)`:

```javascript
await coworker_task({
  action: "review",
  target: "codex",
  review_target: "uncommittedChanges",
  paths: ["src/coworker/", "src/mcp/coworker/index.ts"]
});
```

When `paths` are provided, Codex switches to a scoped diff review prompt instead
of reviewing the entire working tree. The MCP layer also raises the timeout
budget automatically for larger diffs. `delivery: "detached"` is currently only
supported on native full-tree reviews; scoped `paths` reviews stay inline.

**Step 4: Return results**

Present Codex's response to the user. By default Codex runs with full
file-system access (`danger-full-access` sandbox, `approvalPolicy: "never"`)
so it directly edits files, runs tests, and verifies changes autonomously.
If the user needs to exercise the real approval flow, switch Codex into a
protocol-native approval mode with either `approval_policy: "on-request"` on
the request or `OMC_CODEX_APPROVAL_POLICY=on-request` for the session.
`on-request` still only prompts when Codex decides approval is needed.

**Step 5: Surface observability when helpful** If the user asks for progress or
debugging details, use `coworker_task(action="status")` and
`coworker_task(action="recent_activity", target="codex")`. For live terminal output, mention
`omc m codex log` and `omc m codex log --raw` when the user needs the unmerged
event stream. If approvals are pending, surface `requestId`, `summary`,
`decisionOptions`, `details`, and any `questions` returned in
`pendingApprovals`. `coworker_task(action="status")` also exposes the active
`approvalPolicy`, so use it when the user asks why approvals are not appearing.

---

## Native Coworker Notes

- **No `Task(subagent_type="codex-cli")`** — Codex runs as a persistent headless
  daemon, not a one-shot task
- **Proc-based** — no terminal pane required; communication is via JSON-RPC 2.0
  over stdio
- **Auto-viewer** — a live conversation log opens automatically in your terminal
  when the daemon starts
- **Autonomous file editing** — Codex modifies files itself; Claude Code just
  relays the task and presents results

## Daemon Architecture

The Codex coworker runtime (`CodexAppServerDaemon`) communicates with
`codex app-server` via JSON-RPC 2.0. Start on first task automatically via
`coworker_task(action="send", target="codex", ...)` views live progress through:
`omc m codex log`

If `coworker_task(..., timeout_ms=...)` times out, the runtime now issues a
real Codex interrupt instead of only timing out the MCP wait. The same
interrupt path now applies to `coworker_task(action="review", ...)`.
If a timed-out review still returns error metadata, surface
`meta.review_mode` and `meta.recommended_timeout_ms` so the user can retry with
an appropriate timeout budget.
If a very long review timeout leaves the current Claude Code session without
MCP tools, open a fresh Claude Code session before retrying so the coworker
tool connection is re-established cleanly.

---

**Memory Integration (MANDATORY):**

- **Before delegating**: call `mcp__oh-my-claude__recall` with keywords to
  surface prior project patterns.
- **After Codex completes**: call `mcp__oh-my-claude__remember` to store the
  approach, file paths modified, and any decisions made.
