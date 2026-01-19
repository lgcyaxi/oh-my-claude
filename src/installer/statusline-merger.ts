/**
 * StatusLine Merger
 *
 * Handles merging oh-my-claude's statusLine with existing user statusLine configuration.
 * If user already has a statusLine (like CCometixLine), we create a wrapper that calls both.
 */

import { writeFileSync, chmodSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import { chmod } from "node:fs/promises";
import { execSync } from "node:child_process";

export interface StatusLineConfig {
  type: "command";
  command: string;
  padding?: number;
}

// Our statusline command - expanded for cross-platform compatibility
const OMC_STATUSLINE_COMMAND = join(homedir(), ".claude", "oh-my-claude", "dist", "statusline", "statusline.js");

// Wrapper script path - use .mjs for ES modules (supports top-level await)
const WRAPPER_SCRIPT_PATH = join(homedir(), ".claude", "oh-my-claude", "statusline-wrapper.mjs");

/**
 * Get the full node command for executing the wrapper script
 * On Windows, uses full path to node.exe to avoid file association issues
 */
function getWrapperCommand(): string {
  if (platform() === "win32") {
    try {
      const nodePath = execSync('node -e "console.log(process.execPath)"', { encoding: "utf-8" }).trim();
      return `"${nodePath}" "${WRAPPER_SCRIPT_PATH}"`;
    } catch {
      // Fallback
      return `node "${WRAPPER_SCRIPT_PATH}"`;
    }
  }
  return WRAPPER_SCRIPT_PATH;
}

// Backup file for original statusline config
const BACKUP_FILE_PATH = join(homedir(), ".claude", "oh-my-claude", "statusline-backup.json");

/**
 * Check if a statusline command is our own
 */
function isOurStatusLine(command: string): boolean {
  return command.includes("oh-my-claude") && command.includes("statusline");
}

/**
 * Generate a wrapper script that calls both statuslines
 * Uses ES modules for cross-platform compatibility with top-level await
 * Puts omc status on second line for better visibility
 */
function generateWrapperScript(existingCommand: string): string {
  return `#!/usr/bin/env node
/**
 * oh-my-claude StatusLine Wrapper
 * Calls both the original statusLine and oh-my-claude's statusline
 * Auto-generated - do not edit manually
 */

import { execSync } from "node:child_process";
import { platform } from "node:os";

const existingCommand = ${JSON.stringify(existingCommand)};
const omcStatusline = ${JSON.stringify(OMC_STATUSLINE_COMMAND)};

try {
  // Read input from stdin
  let input = "";
  process.stdin.setEncoding("utf-8");
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  // Call existing statusline
  let existingOutput = "";
  try {
    existingOutput = execSync(existingCommand, {
      input,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    }).trim();
  } catch {
    // Ignore errors
  }

  // Call oh-my-claude statusline
  let omcOutput = "";
  try {
    // On Windows, use the full path to node.exe to avoid file association issues
    const nodeCmd = platform() === "win32"
      ? \`"\${process.execPath}"\`
      : "node";
    omcOutput = execSync(\`\${nodeCmd} "\${omcStatusline}"\`, {
      input,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    }).trim();
  } catch {
    omcOutput = "omc";
  }

  // Combine outputs - put omc on second line for better visibility
  if (existingOutput && omcOutput) {
    console.log(existingOutput);
    console.log(omcOutput);
  } else if (existingOutput) {
    console.log(existingOutput);
  } else if (omcOutput) {
    console.log(omcOutput);
  }
} catch (error) {
  // Silently fail
  console.error(error);
}
`;
}

/**
 * Check if this is our wrapper script (not just any of our statusline)
 */
function isOurWrapper(command: string): boolean {
  return command.includes("statusline-wrapper.mjs") || command.includes("statusline-wrapper.cjs") || command.includes("statusline-wrapper.js") || command.includes("statusline-wrapper.sh");
}

/**
 * Merge statusLine configuration
 *
 * Returns the new config and whether a wrapper was created
 */
export function mergeStatusLine(
  existing: StatusLineConfig | undefined,
  force = false
): {
  config: StatusLineConfig;
  wrapperCreated: boolean;
  backupCreated: boolean;
  updated: boolean;
} {
  // If no existing statusline, just use ours
  if (!existing) {
    return {
      config: {
        type: "command",
        command: platform() === "win32" ? `"${execSync('node -e "console.log(process.execPath)"', { encoding: "utf-8" }).trim()}" "${OMC_STATUSLINE_COMMAND}"` : OMC_STATUSLINE_COMMAND,
      },
      wrapperCreated: false,
      backupCreated: false,
      updated: false,
    };
  }

  // IMPORTANT: Check for wrapper FIRST (before isOurStatusLine)
  // The wrapper path contains "oh-my-claude" and "statusline" so isOurStatusLine would match it
  if (isOurWrapper(existing.command)) {
    if (force) {
      // Regenerate wrapper with current paths, preserving the original user's statusline
      let originalCommand = "";
      if (existsSync(BACKUP_FILE_PATH)) {
        try {
          const backup = JSON.parse(readFileSync(BACKUP_FILE_PATH, "utf-8"));
          originalCommand = backup.command || "";
        } catch {
          // If backup is invalid, we can't regenerate properly
        }
      }

      if (originalCommand) {
        // Regenerate wrapper with current omc statusline command
        const wrapperContent = generateWrapperScript(originalCommand);
        writeFileSync(WRAPPER_SCRIPT_PATH, wrapperContent);
        chmodSync(WRAPPER_SCRIPT_PATH, 0o755);
      }

      return {
        config: {
          type: "command",
          command: getWrapperCommand(),
          padding: existing.padding,
        },
        wrapperCreated: false,
        backupCreated: false,
        updated: true,
      };
    }
    return {
      config: existing,
      wrapperCreated: false,
      backupCreated: false,
      updated: false,
    };
  }

  // If existing is our direct statusline (not wrapper)
  if (isOurStatusLine(existing.command)) {
    if (force) {
      // Force update - ensure the command path is current
      const nodeCmd = platform() === "win32"
        ? `"${execSync('node -e "console.log(process.execPath)"', { encoding: "utf-8" }).trim()}" "${OMC_STATUSLINE_COMMAND}"`
        : OMC_STATUSLINE_COMMAND;
      return {
        config: {
          type: "command",
          command: nodeCmd,
          padding: existing.padding,
        },
        wrapperCreated: false,
        backupCreated: false,
        updated: true,
      };
    }
    return {
      config: existing,
      wrapperCreated: false,
      backupCreated: false,
      updated: false,
    };
  }

  // Existing is a third-party statusline (e.g., CCometixLine)
  // Create wrapper script that calls both
  const wrapperContent = generateWrapperScript(existing.command);
  writeFileSync(WRAPPER_SCRIPT_PATH, wrapperContent);
  chmodSync(WRAPPER_SCRIPT_PATH, 0o755);

  // Backup existing config so we can restore it on uninstall
  writeFileSync(BACKUP_FILE_PATH, JSON.stringify(existing, null, 2));

  return {
    config: {
      type: "command",
      command: getWrapperCommand(),
      padding: existing.padding,
    },
    wrapperCreated: true,
    backupCreated: true,
    updated: false,
  };
}

/**
 * Restore original statusLine configuration (for uninstall)
 */
export function restoreStatusLine(): StatusLineConfig | null {
  if (!existsSync(BACKUP_FILE_PATH)) {
    return null;
  }

  try {
    const backup = JSON.parse(readFileSync(BACKUP_FILE_PATH, "utf-8"));
    return backup as StatusLineConfig;
  } catch {
    return null;
  }
}

/**
 * Check if statusline is configured
 */
export function isStatusLineConfigured(): boolean {
  const settingsPath = join(homedir(), ".claude", "settings.json");
  if (!existsSync(settingsPath)) {
    return false;
  }

  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    if (!settings.statusLine) {
      return false;
    }

    const command = settings.statusLine.command || "";
    return isOurStatusLine(command) ||
           command.includes("statusline-wrapper.mjs") ||
           command.includes("statusline-wrapper.cjs") ||
           command.includes("statusline-wrapper.js") ||
           command.includes("statusline-wrapper.sh");
  } catch {
    return false;
  }
}

/**
 * Get the path to our statusline script
 */
export function getOmcStatusLineCommand(): string {
  return OMC_STATUSLINE_COMMAND;
}
