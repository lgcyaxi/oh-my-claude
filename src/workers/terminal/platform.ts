/**
 * Platform-specific terminal helpers.
 *
 * Single source of truth for OS detection used across bridge, daemon, and CLI.
 * Import from here rather than scattering `process.platform === "win32"` checks.
 */

/** Returns "wezterm" on Windows, "tmux" on macOS/Linux. */
export function getSystemTerminalBackend(): "tmux" | "wezterm" {
  return process.platform === "win32" ? "wezterm" : "tmux";
}

/**
 * Returns the shell wrapper args for spawning a bridge worker command in a pane.
 * - Windows: ["cmd.exe", "/k", command] — avoids WSL2's old Node.js v12
 * - Unix:    ["bash", "-c", "<command>; exec bash"]
 */
export function getBridgeWorkerShellCommand(command: string): string[] {
  if (process.platform === "win32") {
    return ["cmd.exe", "/k", command];
  }
  return ["bash", "-c", `${command}; exec bash`];
}
