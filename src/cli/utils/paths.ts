/**
 * Shared CLI path constants
 *
 * Eliminates 7+ duplicate join(homedir(), ".claude", "oh-my-claude") calls.
 */

import { join } from "node:path";
import { homedir } from "node:os";

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
