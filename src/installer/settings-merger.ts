/**
 * Settings merger for Claude Code settings.json
 *
 * Safely merges oh-my-claude configuration into existing settings
 * without overwriting user customizations.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

interface ClaudeSettings {
  hooks?: {
    PreToolUse?: Array<{
      matcher: string;
      hooks: Array<{ type: string; command: string }>;
    }>;
    PostToolUse?: Array<{
      matcher: string;
      hooks: Array<{ type: string; command: string }>;
    }>;
    Stop?: Array<{
      matcher: string;
      hooks: Array<{ type: string; command: string }>;
    }>;
  };
  mcpServers?: Record<
    string,
    {
      command: string;
      args?: string[];
      env?: Record<string, string>;
    }
  >;
  statusLine?: {
    type: "command";
    command: string;
    padding?: number;
  };
  [key: string]: unknown;
}

/**
 * Get path to Claude Code settings.json
 */
export function getSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

/**
 * Load existing Claude Code settings
 */
export function loadSettings(): ClaudeSettings {
  const settingsPath = getSettingsPath();

  if (!existsSync(settingsPath)) {
    return {};
  }

  try {
    const content = readFileSync(settingsPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error("Failed to parse settings.json:", error);
    return {};
  }
}

/**
 * Save Claude Code settings
 */
export function saveSettings(settings: ClaudeSettings): void {
  const settingsPath = getSettingsPath();
  const dir = dirname(settingsPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
}

/**
 * Add hook to settings (if not already present)
 */
function addHook(
  settings: ClaudeSettings,
  hookType: "PreToolUse" | "PostToolUse" | "Stop",
  matcher: string,
  command: string
): boolean {
  if (!settings.hooks) {
    settings.hooks = {};
  }

  if (!settings.hooks[hookType]) {
    settings.hooks[hookType] = [];
  }

  // Check if hook already exists
  const existing = settings.hooks[hookType]!.find(
    (h) =>
      h.matcher === matcher &&
      h.hooks.some((hook) => hook.command.includes("oh-my-claude"))
  );

  if (existing) {
    return false; // Already installed
  }

  settings.hooks[hookType]!.push({
    matcher,
    hooks: [{ type: "command", command }],
  });

  return true;
}

/**
 * Remove hook from settings
 */
function removeHook(
  settings: ClaudeSettings,
  hookType: "PreToolUse" | "PostToolUse" | "Stop",
  identifier: string
): boolean {
  if (!settings.hooks?.[hookType]) {
    return false;
  }

  const original = settings.hooks[hookType]!.length;
  settings.hooks[hookType] = settings.hooks[hookType]!.filter(
    (h) => !h.hooks.some((hook) => hook.command.includes(identifier))
  );

  return settings.hooks[hookType]!.length < original;
}

/**
 * Add MCP server to settings
 */
function addMcpServer(
  settings: ClaudeSettings,
  name: string,
  config: { command: string; args?: string[]; env?: Record<string, string> }
): boolean {
  if (!settings.mcpServers) {
    settings.mcpServers = {};
  }

  if (settings.mcpServers[name]) {
    return false; // Already exists
  }

  settings.mcpServers[name] = config;
  return true;
}

/**
 * Remove MCP server from settings
 */
function removeMcpServer(settings: ClaudeSettings, name: string): boolean {
  if (!settings.mcpServers?.[name]) {
    return false;
  }

  delete settings.mcpServers[name];
  return true;
}

/**
 * Install oh-my-claude hooks into settings
 */
export function installHooks(hooksDir: string): { installed: string[]; skipped: string[] } {
  const settings = loadSettings();
  const installed: string[] = [];
  const skipped: string[] = [];

  // Comment checker hook
  if (
    addHook(
      settings,
      "PreToolUse",
      "Edit|Write",
      `node ${hooksDir}/comment-checker.js`
    )
  ) {
    installed.push("comment-checker (PreToolUse)");
  } else {
    skipped.push("comment-checker (already installed)");
  }

  // Todo continuation hook
  if (
    addHook(
      settings,
      "Stop",
      ".*",
      `node ${hooksDir}/todo-continuation.js`
    )
  ) {
    installed.push("todo-continuation (Stop)");
  } else {
    skipped.push("todo-continuation (already installed)");
  }

  // Task tracker hook (PreToolUse for Task tool)
  if (
    addHook(
      settings,
      "PreToolUse",
      "Task",
      `node ${hooksDir}/task-tracker.js`
    )
  ) {
    installed.push("task-tracker (PreToolUse:Task)");
  } else {
    skipped.push("task-tracker (already installed)");
  }

  // Task tracker hook (PostToolUse for Task tool completion)
  if (
    addHook(
      settings,
      "PostToolUse",
      "Task",
      `node ${hooksDir}/task-tracker.js`
    )
  ) {
    installed.push("task-tracker (PostToolUse:Task)");
  } else {
    skipped.push("task-tracker (already installed)");
  }

  saveSettings(settings);
  return { installed, skipped };
}

/**
 * Install oh-my-claude MCP server using claude mcp add CLI
 */
export function installMcpServer(serverPath: string): boolean {
  const { execSync } = require("node:child_process");

  try {
    // Check if already installed
    let alreadyInstalled = false;
    try {
      const list = execSync("claude mcp list", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
      alreadyInstalled = list.includes("oh-my-claude-background");
    } catch {
      // Ignore if list fails
    }

    if (alreadyInstalled) {
      // Already installed - just return success
      // Note: To update the path, user needs to run `claude mcp remove oh-my-claude-background` first
      return true;
    }

    // Add MCP server globally (--scope user)
    execSync(
      `claude mcp add --scope user oh-my-claude-background -- node "${serverPath}"`,
      { encoding: "utf-8" }
    );
    return true;
  } catch (error) {
    // Check if the error is "already exists" - that's actually success
    const errorStr = String(error);
    if (errorStr.includes("already exists")) {
      return true;
    }

    console.error("Failed to add MCP server via CLI:", error);

    // Fallback to settings.json method
    const settings = loadSettings();
    const result = addMcpServer(settings, "oh-my-claude-background", {
      command: "node",
      args: [serverPath],
    });
    if (result) {
      saveSettings(settings);
    }
    return result;
  }
}

/**
 * Uninstall oh-my-claude from settings
 */
export function uninstallFromSettings(): {
  removedHooks: string[];
  removedMcp: boolean;
} {
  const { execSync } = require("node:child_process");
  const settings = loadSettings();
  const removedHooks: string[] = [];

  // Remove hooks
  if (removeHook(settings, "PreToolUse", "oh-my-claude")) {
    removedHooks.push("PreToolUse");
  }
  if (removeHook(settings, "PostToolUse", "oh-my-claude")) {
    removedHooks.push("PostToolUse");
  }
  if (removeHook(settings, "Stop", "oh-my-claude")) {
    removedHooks.push("Stop");
  }

  saveSettings(settings);

  // Remove MCP server via CLI
  let removedMcp = false;
  try {
    execSync("claude mcp remove --scope user oh-my-claude-background", { stdio: ["pipe", "pipe", "pipe"] });
    removedMcp = true;
  } catch {
    // Try removing from settings.json as fallback
    const settingsAgain = loadSettings();
    removedMcp = removeMcpServer(settingsAgain, "oh-my-claude-background");
    if (removedMcp) {
      saveSettings(settingsAgain);
    }
  }

  return { removedHooks, removedMcp };
}

/**
 * Install oh-my-claude statusLine
 * If user has existing statusLine, creates a wrapper that calls both
 */
export function installStatusLine(statusLineScriptPath: string): {
  installed: boolean;
  wrapperCreated: boolean;
  existingBackedUp: boolean;
} {
  const { mergeStatusLine } = require("./statusline-merger");

  const settings = loadSettings();
  const existing = settings.statusLine;

  const result = mergeStatusLine(existing);

  if (result.config.command !== existing?.command) {
    settings.statusLine = result.config;
    saveSettings(settings);
  }

  return {
    installed: true,
    wrapperCreated: result.wrapperCreated,
    existingBackedUp: result.backupCreated,
  };
}

/**
 * Remove oh-my-claude statusLine and restore original if backed up
 */
export function uninstallStatusLine(): boolean {
  const { restoreStatusLine, isStatusLineConfigured } = require("./statusline-merger");

  if (!isStatusLineConfigured()) {
    return false;
  }

  const settings = loadSettings();

  // Try to restore original statusLine
  const backup = restoreStatusLine();
  if (backup) {
    settings.statusLine = backup;
  } else {
    // No backup - just remove our statusLine
    delete settings.statusLine;
  }

  saveSettings(settings);
  return true;
}
