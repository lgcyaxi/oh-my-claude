/**
 * Tiny PATH-resolution utility used by the viewer spawner.
 * Kept separate to avoid polluting the main viewer file.
 */

import { execSync } from "node:child_process";

/**
 * Resolve the absolute path of a binary on PATH.
 * Returns null if not found — never throws.
 */
export function which(bin: string): string | null {
  try {
    const cmd = process.platform === "win32" ? `where ${bin}` : `which ${bin}`;
    const result = execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    const first = result.split("\n")[0]?.trim();
    return first || null;
  } catch {
    return null;
  }
}
