/**
 * Lightweight terminal backend detection for `cc` command.
 *
 * Checks binary existence only — does NOT create panes or sessions.
 * Reuses the same platform-specific priority as src/terminal/factory.ts.
 */

import { spawn } from "node:child_process";

export type DetectedTerminal = "wezterm" | "tmux" | null;

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
 * - Windows (all): wezterm → tmux (WezTerm is host, always accessible)
 * - Unix: tmux → wezterm
 */
export async function detectTerminal(): Promise<DetectedTerminal> {
  const isWindows = process.platform === "win32";

  const candidates: Array<{ name: DetectedTerminal; cmd: string; args: string[] }> = isWindows
    ? [
        { name: "wezterm", cmd: "wezterm", args: ["--version"] },
        { name: "tmux", cmd: "tmux", args: ["-V"] },
      ]
    : [
        { name: "tmux", cmd: "tmux", args: ["-V"] },
        { name: "wezterm", cmd: "wezterm", args: ["--version"] },
      ];

  for (const candidate of candidates) {
    if (await commandExists(candidate.cmd, candidate.args)) {
      return candidate.name;
    }
  }

  return null;
}
