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

/** Proxy PID file path */
export const PID_FILE = join(INSTALL_DIR, "proxy.pid");

/** Claude settings.json path */
export const SETTINGS_PATH = join(CLAUDE_DIR, "settings.json");

/** oh-my-claude config path */
export const CONFIG_PATH = join(INSTALL_DIR, "config.json");

/** Sessions directory */
export const SESSIONS_DIR = join(INSTALL_DIR, "sessions");

/** Proxy session registry for GUI discovery */
export const PROXY_REGISTRY = join(INSTALL_DIR, "proxy-sessions.json");

/** Bundled WezTerm directory (Windows only) */
export const BUNDLED_WEZTERM_DIR = join(INSTALL_DIR, "apps", "wezterm", "windows-x64");

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
