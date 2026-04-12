/**
 * Lightweight terminal backend detection for `cc` command.
 *
 * Checks binary existence only - does NOT create panes or sessions.
 * Uses tmux as the sole multiplexer on all platforms (psmux on Windows).
 */

import { spawn } from "node:child_process";

export type DetectedTerminal = "tmux" | null;

/**
 * Check if a command binary exists and is callable.
 */
async function commandExists(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;

    try {
      child = spawn(cmd, args, {
        stdio: ["ignore", "ignore", "ignore"],
        shell: false,
        windowsHide: true,
      });
    } catch {
      resolve(false);
      return;
    }

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
 * All platforms: check for tmux (provided by psmux on Windows).
 */
export async function detectTerminal(): Promise<DetectedTerminal> {
  if (await commandExists("tmux", ["-V"])) {
    return "tmux";
  }

  return null;
}
