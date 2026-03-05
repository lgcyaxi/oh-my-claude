/**
 * Lightweight terminal backend detection for `cc` command.
 *
 * Checks binary existence only — does NOT create panes or sessions.
 * Reuses the same platform-specific priority as src/terminal/factory.ts.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { BUNDLED_WEZTERM_DIR } from "./paths";

export type DetectedTerminal = "wezterm" | "tmux" | null;

/**
 * Resolve the WezTerm binary path.
 * On Windows: returns bundled path if available, otherwise "wezterm" (system PATH).
 * On other platforms: returns "wezterm" (system PATH).
 */
export function resolveWeztermBinary(): string {
  if (process.platform === "win32") {
    const bundled = join(BUNDLED_WEZTERM_DIR, "wezterm.exe");
    if (existsSync(bundled)) {
      return bundled;
    }
  }
  return "wezterm";
}

/**
 * Resolve the WezTerm GUI binary path (wezterm-gui.exe).
 * Used for `wezterm start` which launches the GUI directly.
 */
export function resolveWeztermGuiBinary(): string {
  if (process.platform === "win32") {
    const bundled = join(BUNDLED_WEZTERM_DIR, "wezterm-gui.exe");
    if (existsSync(bundled)) {
      return bundled;
    }
  }
  return "wezterm-gui";
}

/**
 * Check if a command binary exists and is callable.
 */
async function commandExists(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "ignore", "ignore"],
      shell: false,
      windowsHide: true,
    });

    const timeout = setTimeout(() => {
      child.kill();
      resolve(false);
    }, 5_000);

    child.on("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve(code === 0);
    });
  });
}

/**
 * Detect available terminal multiplexer.
 *
 * Priority:
 * - Windows (all): wezterm (bundled first, then system) → tmux
 * - Unix: tmux → wezterm
 */
export async function detectTerminal(): Promise<DetectedTerminal> {
  const isWindows = process.platform === "win32";

  const weztermCmd = resolveWeztermBinary();
  const candidates: Array<{ name: DetectedTerminal; cmd: string; args: string[] }> = isWindows
    ? [
        { name: "wezterm", cmd: weztermCmd, args: ["--version"] },
        { name: "tmux", cmd: "tmux", args: ["-V"] },
      ]
    : [
        { name: "tmux", cmd: "tmux", args: ["-V"] },
        { name: "wezterm", cmd: weztermCmd, args: ["--version"] },
      ];

  for (const candidate of candidates) {
    if (await commandExists(candidate.cmd, candidate.args)) {
      return candidate.name;
    }
  }

  return null;
}
