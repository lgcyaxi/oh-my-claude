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

// Cache the node path to avoid repeated execSync calls
let _cachedNodePath: string | null = null;

/**
 * Get the full path to the Node.js executable
 * On Windows, this is critical for proper execution
 * Returns null if detection fails
 */
function getNodePath(): string | null {
  if (_cachedNodePath !== null) {
    return _cachedNodePath;
  }

  if (platform() !== "win32") {
    _cachedNodePath = "node";
    return _cachedNodePath;
  }

  // Try multiple methods to find node.exe on Windows
  const methods = [
    // Method 1: Use process.execPath directly if we're running in Node
    () => {
      if (typeof process !== "undefined" && process.execPath) {
        // Verify the path exists
        if (existsSync(process.execPath)) {
          return process.execPath;
        }
      }
      return null;
    },
    // Method 2: Use execSync to query node
    () => {
      try {
        const result = execSync('node -e "console.log(process.execPath)"', {
          encoding: "utf-8",
          timeout: 5000,
          windowsHide: true,
        }).trim();
        if (result && existsSync(result)) {
          return result;
        }
      } catch {
        // Ignore
      }
      return null;
    },
    // Method 3: Use 'where' command on Windows
    () => {
      try {
        const whereResult = execSync("where node", {
          encoding: "utf-8",
          timeout: 5000,
          windowsHide: true,
        }).trim().split("\n");
        const firstResult = whereResult[0]?.trim();
        if (firstResult && existsSync(firstResult)) {
          return firstResult;
        }
      } catch {
        // Ignore
      }
      return null;
    },
    // Method 4: Check common Windows locations
    () => {
      const commonPaths = [
        join(process.env.ProgramFiles || "C:\\Program Files", "nodejs", "node.exe"),
        join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "nodejs", "node.exe"),
        join(homedir(), "AppData", "Roaming", "nvm", "current", "node.exe"),
        join(homedir(), ".nvm", "current", "node.exe"),
      ];
      for (const p of commonPaths) {
        if (existsSync(p)) {
          return p;
        }
      }
      return null;
    },
  ];

  for (const method of methods) {
    const result = method();
    if (result) {
      _cachedNodePath = result;
      return _cachedNodePath;
    }
  }

  // Last resort fallback - just use 'node' and hope it's in PATH
  console.warn("[statusline] Warning: Could not detect Node.js path. Using 'node' from PATH.");
  _cachedNodePath = "node";
  return _cachedNodePath;
}

/**
 * Build a command string for running a Node.js script
 * Handles Windows path quoting correctly
 */
function buildNodeCommand(scriptPath: string): string {
  const isWindows = platform() === "win32";

  if (!isWindows) {
    return scriptPath;
  }

  const nodePath = getNodePath();
  if (!nodePath || nodePath === "node") {
    // Fallback: use node from PATH with proper quoting
    return `node "${scriptPath}"`;
  }

  // Use full path with proper quoting
  return `"${nodePath}" "${scriptPath}"`;
}

/**
 * Get the full node command for executing the wrapper script
 * On Windows, uses full path to node.exe to avoid file association issues
 */
function getWrapperCommand(): string {
  return buildNodeCommand(WRAPPER_SCRIPT_PATH);
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
import { platform, homedir } from "node:os";
import { existsSync, appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const existingCommand = ${JSON.stringify(existingCommand)};
const omcStatusline = ${JSON.stringify(OMC_STATUSLINE_COMMAND)};

// Debug logging when DEBUG_STATUSLINE=1
const DEBUG = process.env.DEBUG_STATUSLINE === "1";
function debugLog(msg) {
  if (!DEBUG) return;
  try {
    const logDir = join(homedir(), ".config", "oh-my-claude", "logs");
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
    const logPath = join(logDir, "statusline-wrapper.log");
    appendFileSync(logPath, \`[\${new Date().toISOString()}] \${msg}\\n\`);
  } catch {}
}

try {
  // Read input from stdin - handle both piped and empty stdin
  let input = "";

  // On Windows with Bun, we need to be more careful about stdin
  // Check if stdin has data before trying to read
  const isWindows = platform() === "win32";
  debugLog(\`Platform: \${platform()}, isTTY: \${process.stdin.isTTY}\`);

  if (!process.stdin.isTTY) {
    // Stdin is piped - read it
    try {
      process.stdin.setEncoding("utf-8");

      // Use a timeout to avoid blocking forever
      const chunks = [];
      const readPromise = new Promise((resolve) => {
        process.stdin.on("data", (chunk) => {
          chunks.push(chunk);
        });
        process.stdin.on("end", () => {
          resolve(chunks.join(""));
        });
        process.stdin.on("error", () => {
          resolve("");
        });
      });

      // Race against a timeout
      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(""), 1000));
      input = await Promise.race([readPromise, timeoutPromise]);

      debugLog(\`Read \${input.length} chars from stdin\`);
      if (input.length > 0 && input.length < 500) {
        debugLog(\`stdin content: \${input}\`);
      }
    } catch (e) {
      debugLog(\`Stdin read error: \${e}\`);
    }
  } else {
    debugLog("stdin is TTY - no piped input");
  }

  // Call existing statusline
  let existingOutput = "";
  try {
    existingOutput = execSync(existingCommand, {
      input,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
      timeout: 3000,
    }).trim();
    debugLog(\`Existing statusline output: \${existingOutput}\`);
  } catch (e) {
    debugLog(\`Existing statusline error: \${e}\`);
  }

  // Call oh-my-claude statusline
  let omcOutput = "";
  try {
    // On Windows, use the full path to the runtime to avoid file association issues
    const runtimeCmd = isWindows
      ? \`"\${process.execPath}"\`
      : "node";
    const cmd = \`\${runtimeCmd} "\${omcStatusline}"\`;
    debugLog(\`Running omc statusline: \${cmd}\`);

    omcOutput = execSync(cmd, {
      input,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
      timeout: 3000,
    }).trim();
    debugLog(\`omc statusline output: \${omcOutput}\`);
  } catch (e) {
    debugLog(\`omc statusline error: \${e}\`);
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
  debugLog(\`Wrapper error: \${error}\`);
  console.log("omc");
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
        command: buildNodeCommand(OMC_STATUSLINE_COMMAND),
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
      return {
        config: {
          type: "command",
          command: buildNodeCommand(OMC_STATUSLINE_COMMAND),
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

/**
 * Get the full command string for running our statusline
 * Exported for use in validation
 */
export function getStatusLineFullCommand(): string {
  return buildNodeCommand(OMC_STATUSLINE_COMMAND);
}

/**
 * Validate that the statusline setup is working
 * Returns an object with validation results and any error messages
 */
export function validateStatusLineSetup(): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  details: {
    scriptExists: boolean;
    nodePathValid: boolean;
    settingsConfigured: boolean;
    commandWorks: boolean;
  };
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const details = {
    scriptExists: false,
    nodePathValid: false,
    settingsConfigured: false,
    commandWorks: false,
  };

  // 1. Check if statusline script exists
  if (existsSync(OMC_STATUSLINE_COMMAND)) {
    details.scriptExists = true;
  } else {
    errors.push(`Statusline script not found at: ${OMC_STATUSLINE_COMMAND}`);
  }

  // 2. Check if Node.js path is valid (Windows-specific concern)
  if (platform() === "win32") {
    const nodePath = getNodePath();
    if (nodePath && nodePath !== "node" && existsSync(nodePath)) {
      details.nodePathValid = true;
    } else if (nodePath === "node") {
      // Using 'node' from PATH - this might work but is less reliable
      warnings.push("Using 'node' from PATH. Consider installing Node.js to a standard location.");
      details.nodePathValid = true; // Still valid, just with a warning
    } else {
      errors.push("Could not locate Node.js executable. Please ensure Node.js is installed.");
    }
  } else {
    // On Unix, 'node' in PATH is standard
    details.nodePathValid = true;
  }

  // 3. Check if settings.json has statusline configured
  const settingsPath = join(homedir(), ".claude", "settings.json");
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      if (settings.statusLine?.command) {
        const cmd = settings.statusLine.command;
        if (isOurStatusLine(cmd) || isOurWrapper(cmd)) {
          details.settingsConfigured = true;
        } else {
          warnings.push("settings.json has a different statusline configured");
        }
      } else {
        errors.push("statusLine not configured in settings.json");
      }
    } catch (e) {
      errors.push(`Could not parse settings.json: ${e}`);
    }
  } else {
    errors.push("settings.json not found");
  }

  // 4. Try to run the statusline command
  if (details.scriptExists && details.nodePathValid) {
    try {
      const command = buildNodeCommand(OMC_STATUSLINE_COMMAND);
      execSync(command, {
        encoding: "utf-8",
        timeout: 10000,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
      details.commandWorks = true;
    } catch (e) {
      // The statusline might output to stderr or return non-zero, check if it at least runs
      const error = e as { status?: number; stderr?: string };
      if (error.status !== undefined) {
        // Command ran but exited with error - this is often okay for statusline
        details.commandWorks = true;
        warnings.push("Statusline command ran but returned non-zero exit code");
      } else {
        errors.push(`Statusline command failed to execute: ${e}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    details,
  };
}
