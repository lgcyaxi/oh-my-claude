/**
 * Shared CLI path constants
 *
 * Eliminates 7+ duplicate join(homedir(), ".claude", "oh-my-claude") calls.
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { isWSL2, getWindowsHomePath } from "./wsl";

/** Root oh-my-claude installation directory: ~/.claude/oh-my-claude */
export const INSTALL_DIR = join(homedir(), ".claude", "oh-my-claude");

/** Claude settings directory: ~/.claude */
export const CLAUDE_DIR = join(homedir(), ".claude");

/** Proxy server script path */
export const PROXY_SCRIPT = join(INSTALL_DIR, "dist", "proxy", "server.js");

/** Dashboard script path (single global web dashboard on port 18920) */
export const DASHBOARD_SCRIPT = join(INSTALL_DIR, "dist", "proxy", "dashboard.js");

/** Dashboard daemon PID file */
export const DASHBOARD_PID_FILE = join(INSTALL_DIR, "dashboard.pid");

/**
 * Dashboard origin marker. Written alongside `dashboard.pid` to record how
 * the dashboard was launched:
 *  - "auto"   — spawned implicitly by `omc cc` via `ensureDashboard()`.
 *               Eligible for ref-counted auto-teardown when the last
 *               `omc cc` session exits.
 *  - "manual" — spawned explicitly by the user (e.g. `omc proxy dashboard`)
 *               and must NEVER be torn down automatically.
 *
 * Origin is sticky: once "manual" is recorded, a later implicit
 * `ensureDashboard({ origin: "auto" })` call must not downgrade it.
 */
export const DASHBOARD_ORIGIN_FILE = join(INSTALL_DIR, "dashboard.origin");

/** Claude settings.json path */
export const SETTINGS_PATH = join(CLAUDE_DIR, "settings.json");

/** oh-my-claude config path */
export const CONFIG_PATH = join(INSTALL_DIR, "config.json");

/** Sessions directory */
export const SESSIONS_DIR = join(INSTALL_DIR, "sessions");

/** Proxy session registry for GUI discovery */
export const PROXY_REGISTRY = join(INSTALL_DIR, "proxy-sessions.json");


/**
 * Returns the Windows-side proxy registry path when running in WSL2.
 * e.g., /mnt/c/Users/leoli/.claude/oh-my-claude/proxy-sessions.json
 * Returns null if not WSL2 or detection fails.
 */
export function getWindowsProxyRegistryPath(): string | null {
  try {
    if (!isWSL2()) return null;
    const winHome = getWindowsHomePath();
    if (!winHome) return null;
    return join(winHome, ".claude", "oh-my-claude", "proxy-sessions.json");
  } catch {
    return null;
  }
}
