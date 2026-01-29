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
 * When force is true, replaces existing hook with new command
 */
function addHook(
  settings: ClaudeSettings,
  hookType: "PreToolUse" | "PostToolUse" | "Stop",
  matcher: string,
  command: string,
  force = false
): boolean {
  if (!settings.hooks) {
    settings.hooks = {};
  }

  if (!settings.hooks[hookType]) {
    settings.hooks[hookType] = [];
  }

  // Check if hook already exists
  const existingIndex = settings.hooks[hookType]!.findIndex(
    (h) =>
      h.matcher === matcher &&
      h.hooks.some((hook) => hook.command.includes("oh-my-claude"))
  );

  if (existingIndex !== -1) {
    if (force) {
      // Remove existing hook so we can replace it with updated command
      settings.hooks[hookType]!.splice(existingIndex, 1);
    } else {
      return false; // Already installed
    }
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
 * Get the node executable path for hook commands
 * On Windows, this helps avoid file association issues
 */
function getNodeCommand(): string {
  const { platform } = require("node:os");
  if (platform() === "win32") {
    try {
      const { execSync } = require("node:child_process");
      // Get the full path to node executable and quote it
      const nodePath = execSync('node -e "console.log(process.execPath)"', { encoding: "utf-8" }).trim();
      return `"${nodePath}"`;
    } catch {
      // Fallback to 'node' if we can't get the path
      return "node";
    }
  }
  return "node";
}

/**
 * Install oh-my-claude hooks into settings
 */
export function installHooks(hooksDir: string, force = false): {
  installed: string[];
  updated: string[];
  skipped: string[];
} {
  const settings = loadSettings();
  const installed: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];

  const nodeCmd = getNodeCommand();

  // Comment checker hook
  const commentCheckerResult = addHook(
    settings,
    "PreToolUse",
    "Edit|Write",
    `${nodeCmd} ${hooksDir}/comment-checker.js`,
    force
  );
  if (commentCheckerResult) {
    if (force) {
      // Check if this was an update or fresh install
      const wasExisting = settings.hooks?.PreToolUse?.some(
        (h) => h.matcher === "Edit|Write" && h.hooks.some((hook) => hook.command.includes("comment-checker"))
      );
      if (wasExisting && settings.hooks?.PreToolUse) {
        // After addHook with force, there's now a new entry plus the old one was removed
        // So we count this as an update
        updated.push("comment-checker (PreToolUse)");
      } else {
        installed.push("comment-checker (PreToolUse)");
      }
    } else {
      installed.push("comment-checker (PreToolUse)");
    }
  } else {
    skipped.push("comment-checker (already installed)");
  }

  // Todo continuation hook
  const todoResult = addHook(
    settings,
    "Stop",
    ".*",
    `${nodeCmd} ${hooksDir}/todo-continuation.js`,
    force
  );
  if (todoResult) {
    if (force) {
      updated.push("todo-continuation (Stop)");
    } else {
      installed.push("todo-continuation (Stop)");
    }
  } else {
    skipped.push("todo-continuation (already installed)");
  }

  // Task tracker hook (PreToolUse for Task tool)
  const taskPreResult = addHook(
    settings,
    "PreToolUse",
    "Task",
    `${nodeCmd} ${hooksDir}/task-tracker.js`,
    force
  );
  if (taskPreResult) {
    if (force) {
      updated.push("task-tracker (PreToolUse:Task)");
    } else {
      installed.push("task-tracker (PreToolUse:Task)");
    }
  } else {
    skipped.push("task-tracker (already installed)");
  }

  // Task tracker hook (PostToolUse for Task tool completion)
  const taskPostResult = addHook(
    settings,
    "PostToolUse",
    "Task",
    `${nodeCmd} ${hooksDir}/task-tracker.js`,
    force
  );
  if (taskPostResult) {
    if (force) {
      updated.push("task-tracker (PostToolUse:Task)");
    } else {
      installed.push("task-tracker (PostToolUse:Task)");
    }
  } else {
    skipped.push("task-tracker (already installed)");
  }

  saveSettings(settings);
  return { installed, updated, skipped };
}

/**
 * Get the node executable path
 * On Windows, this helps avoid file association issues
 */
function getNodeExecutable(): string {
  const { execSync } = require("node:child_process");
  try {
    // Get the path to node executable
    return execSync("node -e \"console.log(process.execPath)\"", { encoding: "utf-8" }).trim();
  } catch {
    // Fallback to 'node' if we can't get the path
    return "node";
  }
}

/**
 * Install oh-my-claude MCP server using claude mcp add CLI
 */
export function installMcpServer(serverPath: string, force = false): boolean {
  const { execSync } = require("node:child_process");
  const { platform } = require("node:os");

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
      if (force) {
        // Remove and re-add to update the path
        try {
          execSync("claude mcp remove --scope user oh-my-claude-background", { stdio: ["pipe", "pipe", "pipe"] });
        } catch {
          // Ignore remove errors
        }
      } else {
        // Already installed - just return success
        return true;
      }
    }

    // On Windows, use the full path to node.exe to avoid file association issues
    const nodePath = platform() === "win32" ? `"${getNodeExecutable()}"` : "node";

    // Add MCP server globally (--scope user)
    execSync(
      `claude mcp add --scope user oh-my-claude-background -- ${nodePath} "${serverPath}"`,
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
    const nodePath = platform() === "win32" ? getNodeExecutable() : "node";
    const result = addMcpServer(settings, "oh-my-claude-background", {
      command: nodePath,
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
export function installStatusLine(statusLineScriptPath: string, force = false): {
  installed: boolean;
  wrapperCreated: boolean;
  existingBackedUp: boolean;
  updated: boolean;
} {
  const { mergeStatusLine } = require("./statusline-merger");

  const settings = loadSettings();
  const existing = settings.statusLine;

  const result = mergeStatusLine(existing, force);

  // Update settings if config changed or force mode triggered an update
  if (result.config.command !== existing?.command || result.updated) {
    settings.statusLine = result.config;
    saveSettings(settings);
  }

  return {
    installed: true,
    wrapperCreated: result.wrapperCreated,
    existingBackedUp: result.backupCreated,
    updated: result.updated || false,
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
