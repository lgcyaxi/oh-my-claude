/**
 * Codex conversation viewer spawner.
 *
 * When CodexAppServerDaemon starts a new session, it calls `spawnCodexViewer()`
 * to open a live tail of the activity log in a terminal split or new window.
 *
 * Detection priority (first match wins):
 *   1. TMUX env var set  → tmux split-window -h
 *   2. WEZTERM_PANE set  → wezterm cli split-pane --right
 *   3. macOS             → open -a Terminal (new window)
 *   4. Linux + DISPLAY   → xterm in background
 *   5. Otherwise         → noop (no viewer, headless/CI)
 *
 * Set `CODEX_NO_VIEWER=1` to disable viewer spawn (useful for CI/automation).
 */

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { execSync } from "node:child_process";
import { which } from "./codex-app-server-viewer-utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ViewerHandle {
  /** Close/kill the viewer process or pane. Idempotent. */
  close(): void;
}

const NOOP_HANDLE: ViewerHandle = { close: () => {} };

// ─── Viewer resolution ────────────────────────────────────────────────────────

/**
 * Resolve the `oh-my-claude` CLI path to use in the viewer command.
 * Tries: PATH lookup → process.argv[0] companion → fallback literal.
 */
function resolveOmcBin(): string {
  return which("oh-my-claude") ?? which("omc") ?? "oh-my-claude";
}

/** Build the viewer shell command string. */
function viewerCommand(omcBin: string): string {
  return `${omcBin} m codex log`;
}

// ─── Spawn strategies ─────────────────────────────────────────────────────────

function spawnTmux(cmd: string): ViewerHandle {
  try {
    const paneId = execSync(
      `tmux split-window -h -P -F '#{pane_id}' '${cmd}'`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();

    return {
      close() {
        try { execSync(`tmux kill-pane -t ${paneId}`, { stdio: "pipe" }); } catch { /* gone */ }
      },
    };
  } catch {
    return NOOP_HANDLE;
  }
}

function spawnWezTerm(cmd: string): ViewerHandle {
  try {
    const paneId = execSync(
      `wezterm cli split-pane --right -- bash -c '${cmd}'`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();

    return {
      close() {
        try { execSync(`wezterm cli kill-pane --pane-id ${paneId}`, { stdio: "pipe" }); } catch { /* gone */ }
      },
    };
  } catch {
    return NOOP_HANDLE;
  }
}

function spawnMacOSTerminal(cmd: string): ViewerHandle {
  try {
    // Append `exit` so Terminal closes the tab/window when the viewer process exits.
    const commandWithExit = `${cmd}; exit`;
    const script = `tell application "Terminal" to do script "${commandWithExit.replace(/"/g, '\\"')}"`;
    execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { stdio: "pipe" });
    return NOOP_HANDLE;
  } catch {
    return NOOP_HANDLE;
  }
}

function spawnXTerm(cmd: string): ViewerHandle {
  let proc: ChildProcess | null = null;
  try {
    proc = spawn("xterm", ["-e", cmd], {
      detached: true,
      stdio: "ignore",
    });
    proc.unref();
    const captured = proc;
    return {
      close() {
        try { captured.kill(); } catch { /* gone */ }
      },
    };
  } catch {
    return NOOP_HANDLE;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Spawn a live Codex conversation viewer appropriate for the current terminal.
 * Never throws. Returns a handle to close the viewer on daemon stop.
 */
export function spawnCodexViewer(): ViewerHandle {
  // Respect opt-out flag (CI, automation, scripts)
  if (process.env.CODEX_NO_VIEWER === "1") {
    return NOOP_HANDLE;
  }

  const cmd = viewerCommand(resolveOmcBin());

  if (process.env.TMUX) {
    return spawnTmux(cmd);
  }

  if (process.env.WEZTERM_PANE) {
    return spawnWezTerm(cmd);
  }

  if (process.platform === "darwin") {
    return spawnMacOSTerminal(cmd);
  }

  if (process.platform === "linux" && process.env.DISPLAY) {
    return spawnXTerm(cmd);
  }

  // Headless — no viewer available
  return NOOP_HANDLE;
}
