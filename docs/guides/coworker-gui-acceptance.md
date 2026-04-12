# Coworker GUI Acceptance

End-to-end validation for coworker GUI behavior through `coworker_task(...)`. Covers viewer pane
spawning, log rendering, session communication, review flows, and OpenCode workflows on
**macOS**, **Windows**, and **Linux**.

## Platform Support

| Platform                 | Viewer mechanism             | Env var check                              |
| ------------------------ | ---------------------------- | ------------------------------------------ |
| **macOS (tmux)**         | `tmux split-window -h`       | `TMUX` is set                              |
| **macOS (standalone)**   | Terminal.app via AppleScript | `process.platform === 'darwin'`            |
| **Windows (tmux/psmux)** | `tmux split-window -h`       | `TMUX` is set                              |
| **Linux (tmux)**         | `tmux split-window -h`       | `TMUX` is set                              |
| **Linux (X11)**          | xterm                        | `platform === 'linux'` && `DISPLAY` is set |

> **iTerm2 note:** Not currently supported. Falls back to Terminal.app on macOS.

## Prerequisites

```bash
bun test tests/coworker/viewer.test.ts
bun run build:all
bun run install-local -- --force
```

Ensure:

- `OPENCODE_NO_VIEWER` is **unset**
- **macOS (tmux):** Running inside tmux (`echo $TMUX` returns a value)
- **macOS (standalone):** Terminal.app available (default)
- **Windows:** Running inside tmux via psmux (`echo $TMUX` returns a value)
- **Linux:** Inside tmux or X11 available (`echo $DISPLAY`)

## Timeout Reference

Timeouts vary by action type. Using insufficient timeouts is the most common cause of false test
failures.

| Action                     | Default | Minimum | Recommended                       |
| -------------------------- | ------- | ------- | --------------------------------- |
| `send` (simple read-only)  | 300s    | 60s     | 120s                              |
| `send` (with tool use)     | 300s    | 120s    | 300s                              |
| `review` (OpenCode)        | 300s    | 120s    | 120-300s                          |
| `diff` / `fork` / `status` | 10s     | ---     | 10s                               |

---

## Phase 1: Viewer Spawning

### OpenCode Viewer

```text
coworker_task(
  action="send",
  target="opencode",
  message="Read src/coworker/viewer.ts and summarize the resolveViewerCommand() function. Read-only, no changes.",
  timeout_ms=120000
)
```

Verify:

- [ ] OpenCode TUI renders in viewer pane (not blank)
- [ ] Session shows actual communication (not just a frozen prompt)
- [ ] Response returns with `agent`, `provider`, `model` fields populated
- [ ] **macOS (tmux):** tmux split pane renders TUI correctly
- [ ] **macOS (standalone):** Terminal.app window shows OpenCode TUI
- [ ] **Windows:** tmux pane renders TUI correctly

### OpenCode with Agent Override

```text
coworker_task(
  action="send",
  target="opencode",
  agent="atlas",
  message="Describe the project structure of this repository. Read-only.",
  timeout_ms=120000
)
```

Verify:

- [ ] Agent resolved correctly (check response `agent` field)
- [ ] Fuzzy matching works (e.g., `"Atlas"` matches `"atlas"`)
- [ ] Error with candidates list if agent name is ambiguous

### OpenCode with Provider/Model Override

```text
coworker_task(
  action="send",
  target="opencode",
  provider_id="zhipuai-coding-plan",
  model_id="glm-5",
  message="Read package.json and list the main dependencies. Read-only.",
  timeout_ms=120000
)
```

Verify:

- [ ] Response `provider` matches `"zhipuai-coding-plan"`
- [ ] Response `model` matches `"glm-5"`
- [ ] Error if only one of `provider_id`/`model_id` is given (both required)

---

## Phase 2: Log Rendering

### Live Viewer Rendering

Open a manual viewer pane, then trigger a task:

```bash
# Terminal 1: open viewer
omc m opencode log

# Terminal 2 (or Claude Code): trigger work
coworker_task(action="send", target="opencode", message="Run `cat package.json | head -5` and show the output.", timeout_ms=120000)
```

Verify:

- [ ] Live viewer shows aggregated tool output (collapsed), not raw lines
- [ ] Text entries stream in real-time
- [ ] `DONE:` appears when task completes
- [ ] Viewer exits cleanly after idle timeout (or Ctrl+C)

---

## Phase 3: Review Flows

### OpenCode Review

```text
coworker_task(
  action="review",
  target="opencode",
  review_target="uncommittedChanges",
  timeout_ms=120000
)
```

Verify:

- [ ] Review completes with findings
- [ ] `meta.taskType` is `"review"`
- [ ] `meta.approvalPolicy` is `"external"`

### OpenCode Review with Provider Override

```text
coworker_task(
  action="review",
  target="opencode",
  review_target="uncommittedChanges",
  provider_id="zhipuai-coding-plan",
  model_id="glm-5",
  timeout_ms=120000
)
```

Verify:

- [ ] Review uses specified provider/model
- [ ] Response `provider` and `model` reflect overrides

---

## Phase 4: Session Operations

### Diff

```text
coworker_task(
  action="diff",
  target="opencode"
)
```

Verify:

- [ ] Returns diff content or `"(no diff)"` if no changes
- [ ] Includes path + diff pairs for each modified file

### Fork

```text
coworker_task(
  action="fork",
  target="opencode"
)
```

Verify:

- [ ] Returns both `parentSessionId` and new `sessionId`
- [ ] Viewer syncs to new session
- [ ] Subsequent `send` operations use forked session

### Status

```text
coworker_task(action="status")
```

Verify:

- [ ] `name` (`"opencode"`)
- [ ] `status` (`"running"` / `"stopped"`)
- [ ] `sessionId`, `model`
- [ ] `viewerAvailable` / `viewerAttached`
- [ ] `approvalPolicy`
- [ ] `signalState` (`"idle"` / `"starting"` / `"thinking"` / `"streaming"` / `"complete"` /
      `"error"`)
- [ ] `activeTaskCount`
- [ ] `lastActivityAt` timestamp

OpenCode-specific fields:

- [ ] `agent` / `requestedAgent` / `agentNative`
- [ ] `provider` / `model`

```bash
omc doctor
```

Verify installation is healthy.

---

## Phase 5: Recent Activity

```text
coworker_task(action="recent_activity")
```

Verify:

- [ ] Returns activity sorted by timestamp (newest first)
- [ ] Each entry includes `ts`, `target`, `type`, `content`
- [ ] Event types include: `session_started`, `task_started`, `task_completed`, `tool_activity`
- [ ] Filtering by target works: `coworker_task(action="recent_activity", target="opencode")`

---

## Phase 6: Shell Resolution (Windows)

Verify `resolveNativeBash()` finds the correct bash on Windows:

```bash
bun -e 'import { resolveNativeBash } from "./src/coworker/viewer"; console.log(resolveNativeBash());'
```

Expected: a path like `C:/Program Files/Git/bin/bash.exe` or `D:/Applications/Git/bin/bash.exe`.

Edge cases:

- [ ] Non-standard Git install paths (e.g., `D:\Applications\Git\`) resolve correctly
- [ ] Result is cached (second call returns same value instantly)
- [ ] `_resetNativeBashCache()` clears the cache for re-resolution

---

## Failure Symptoms Reference

| Symptom                                  | Platform    | Likely cause                          | Fix                                                                        |
| ---------------------------------------- | ----------- | ------------------------------------- | -------------------------------------------------------------------------- |
| OpenCode TUI blank/frozen                | Windows     | cmd.exe lacks PTY for TUI apps        | Use Git Bash `-lc`                                                         |
| Terminal.app window doesn't open         | macOS       | AppleScript permissions denied        | Grant Terminal access in System Settings > Privacy > Automation             |
| tmux split doesn't appear                | macOS/Linux | Not inside a tmux session             | Run inside tmux or set `TMUX` env var                                      |
| tmux pane renders garbled TUI            | macOS/Linux | Terminal doesn't support 256 colors   | Set `TERM=xterm-256color`                                                  |
| Viewer pane doesn't appear               | Windows     | `TMUX` not set                        | Must run inside tmux (psmux), not plain terminal                           |
| Task times out unexpectedly              | All         | Insufficient `timeout_ms`             | Use 120s minimum for sends, 120-300s for reviews                           |
| OpenCode agent not found                 | All         | Invalid agent name                    | Check available agents via `GET /agent`; use fuzzy name (case-insensitive) |
| "requires both provider_id and model_id" | All         | Only one override specified           | Pass both `provider_id` and `model_id` together, or neither                |
| `viewerAvailable: false`                 | All         | No supported viewer environment       | Check env vars (`TMUX`, `DISPLAY`)                                         |
