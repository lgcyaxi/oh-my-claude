# Coworker GUI Acceptance

End-to-end validation for coworker GUI behavior through `coworker_task(...)`.
Covers viewer pane spawning, log rendering, session communication, review flows,
and cross-coworker workflows on **macOS**, **Windows**, and **Linux**.

## Platform Support

| Platform | Viewer mechanism | Env var check |
|----------|-----------------|---------------|
| **macOS (tmux)** | `tmux split-window -h` | `TMUX` is set |
| **macOS (standalone)** | Terminal.app via AppleScript | `process.platform === 'darwin'` |
| **Windows (tmux/psmux)** | `tmux split-window -h` | `TMUX` is set |
| **Linux (tmux)** | `tmux split-window -h` | `TMUX` is set |
| **Linux (X11)** | xterm | `platform === 'linux'` && `DISPLAY` is set |

> **iTerm2 note:** Not currently supported. Falls back to Terminal.app on macOS.

## Prerequisites

```bash
bun test tests/coworker/viewer.test.ts
bun run build:all
bun run install-local -- --force
```

Ensure:
- `CODEX_NO_VIEWER` and `OPENCODE_NO_VIEWER` are **unset**
- **macOS (tmux):** Running inside tmux (`echo $TMUX` returns a value)
- **macOS (standalone):** Terminal.app available (default)
- **Windows:** Running inside tmux via psmux (`echo $TMUX` returns a value)
- **Linux:** Inside tmux or X11 available (`echo $DISPLAY`)

## Timeout Reference

Timeouts vary by action type. Using insufficient timeouts is the most common
cause of false test failures.

| Action | Default | Minimum | Recommended |
|--------|---------|---------|-------------|
| `send` (simple read-only) | 300s | 60s | 120s |
| `send` (with tool use) | 300s | 120s | 300s |
| `review` (Codex, uncommitted) | auto-calc | 120s | Use `meta.recommended_timeout_ms` |
| `review` (Codex, scoped paths) | auto-calc | 240s | Use `meta.recommended_timeout_ms` |
| `review` (OpenCode) | 300s | 120s | 120–300s |
| `diff` / `fork` / `status` | 10s | — | 10s |

**Codex review timeout calculation:**
- Base 120s + 15s per file + 90ms per line changed (uncommitted)
- Base 180s + 20s per file + 120ms per diff line + 45s per binary section + ~25ms per character (scoped)
- Clamped to `[120s, 480s]` (uncommitted) or `[240s, 720s]` (scoped)
- Pass `timeout_ms` as a **floor**, not a ceiling — the system takes `max(your_value, calculated)`

---

## Phase 1: Viewer Spawning

### Codex Viewer

```text
coworker_task(
  action="send",
  target="codex",
  message="List the files in src/coworker/ and briefly describe each. Read-only, no changes.",
  timeout_ms=120000
)
```

Verify:
- [ ] `viewerAvailable: true` in response meta
- [ ] `viewerAttached: true` in response meta
- [ ] **macOS (tmux):** Horizontal split appeared with Codex activity log
- [ ] **macOS (standalone):** Terminal.app window opened with Codex log
- [ ] **Windows:** tmux split pane appeared with Codex activity log
- [ ] Pane auto-closes after idle period

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

### Tool Activity Aggregation

Trigger a task that runs shell commands (generates `tool_activity` events):

```text
coworker_task(
  action="send",
  target="codex",
  message="Run `bun test tests/coworker/viewer.test.ts` and tell me if all tests pass.",
  timeout_ms=300000
)
```

Then inspect the log:

```bash
omc m codex log --print
omc m codex log --print --raw
```

Verify:
- [ ] Aggregated mode: `command output` entries collapse to `TOOL: command output ×N`
- [ ] No raw source code lines showing as individual `TOOL:` entries
- [ ] Raw mode (`--raw`): shows individual events (expected, for debugging)
- [ ] `text_delta` entries merge into readable sentences (not token fragments)

### Live Viewer Rendering

Open a manual viewer pane, then trigger a task:

```bash
# Terminal 1: open viewer
omc m codex log

# Terminal 2 (or Claude Code): trigger work
coworker_task(action="send", target="codex", message="Run `cat package.json | head -5` and show the output.", timeout_ms=120000)
```

Verify:
- [ ] Live viewer shows `TOOL: command output ×N` (collapsed), not raw lines
- [ ] `CODEX:` text entries stream in real-time
- [ ] `✓ DONE:` appears when task completes
- [ ] Viewer exits cleanly after idle timeout (or Ctrl+C)

---

## Phase 3: Review Flows

### Codex Review (Uncommitted Changes)

Make a trivial change first, then:

```text
coworker_task(
  action="review",
  target="codex",
  review_target="uncommittedChanges",
  timeout_ms=240000
)
```

Verify:
- [ ] `meta.recommended_timeout_ms` returned (auto-calculated)
- [ ] Review completes within the recommended timeout
- [ ] Response includes file-by-file review comments
- [ ] `meta.operation` is `"review"`

### Codex Review (Scoped Paths)

```text
coworker_task(
  action="review",
  target="codex",
  review_target="uncommittedChanges",
  paths=["src/coworker/viewer.ts"],
  timeout_ms=240000
)
```

Verify:
- [ ] Review scoped to specified paths only
- [ ] `meta.review_mode` is `"scoped-diff"`
- [ ] Timeout calculation accounts for diff size (240s minimum)

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
  target="codex"
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

Verify both coworkers report:
- [ ] `name` (`"codex"` / `"opencode"`)
- [ ] `status` (`"running"` / `"stopped"`)
- [ ] `sessionId`, `model`
- [ ] `viewerAvailable` / `viewerAttached`
- [ ] `approvalPolicy`
- [ ] `signalState` (`"idle"` / `"starting"` / `"thinking"` / `"streaming"` / `"complete"` / `"error"`)
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

## Phase 5: Cross-Coworker Workflow

### Sequential Review

Run Codex review, then OpenCode review on the same uncommitted changes:

```text
# Step 1: Codex review
coworker_task(
  action="review",
  target="codex",
  review_target="uncommittedChanges",
  timeout_ms=240000
)

# Step 2: OpenCode review
coworker_task(
  action="review",
  target="opencode",
  review_target="uncommittedChanges",
  timeout_ms=120000
)
```

Verify:
- [ ] Both reviews complete independently
- [ ] No session conflicts between coworkers
- [ ] Each review provides its own findings

### Recent Activity

```text
coworker_task(action="recent_activity")
```

Verify:
- [ ] Returns merged activity from both coworkers, sorted by timestamp (newest first)
- [ ] Each entry includes `ts`, `target`, `type`, `content`
- [ ] Event types include: `session_started`, `task_started`, `task_completed`, `tool_activity`
- [ ] Filtering by target works: `coworker_task(action="recent_activity", target="codex")`

### Combined Status

```text
coworker_task(action="status")
```

Verify:
- [ ] Both coworkers listed with correct metadata
- [ ] `activeTaskCount` reflects actual running tasks
- [ ] `signalState` transitions correctly (idle → starting → thinking → streaming → complete)

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

| Symptom | Platform | Likely cause | Fix |
|---------|----------|-------------|-----|
| OpenCode TUI blank/frozen | Windows | cmd.exe lacks PTY for TUI apps | Use Git Bash `-lc` |
| Terminal.app window doesn't open | macOS | AppleScript permissions denied | Grant Terminal access in System Settings → Privacy → Automation |
| tmux split doesn't appear | macOS/Linux | Not inside a tmux session | Run inside tmux or set `TMUX` env var |
| tmux pane renders garbled TUI | macOS/Linux | Terminal doesn't support 256 colors | Set `TERM=xterm-256color` |
| Viewer pane doesn't appear | Windows | `TMUX` not set | Must run inside tmux (psmux), not plain terminal |
| `TOOL: command output\n<code>` spam | All | tool_activity entries not aggregating | Check toolActivityPrefix-based merge in coworker-log.ts |
| `resolveNativeBash()` returns null | Windows | Git Bash not found | Check `where git` output, ensure Git is installed |
| Task times out unexpectedly | All | Insufficient `timeout_ms` | Use `meta.recommended_timeout_ms` for reviews; 120s minimum for sends |
| Review timeout too short | All | Auto-calc underestimated | Pass higher `timeout_ms` floor; system takes `max(yours, calculated)` |
| "timed out after Nms" error | All | Large diff or slow model | Increase `timeout_ms`; for Codex scoped reviews use 240s+ minimum |
| OpenCode agent not found | All | Invalid agent name | Check available agents via `GET /agent`; use fuzzy name (case-insensitive) |
| "requires both provider_id and model_id" | All | Only one override specified | Pass both `provider_id` and `model_id` together, or neither |
| `viewerAvailable: false` | All | No supported viewer environment | Check env vars (`TMUX`, `DISPLAY`) |
