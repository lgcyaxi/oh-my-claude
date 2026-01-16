/**
 * StatusLine Merger
 *
 * Handles merging oh-my-claude's statusLine with existing user statusLine configuration.
 * If user already has a statusLine (like CCometixLine), we create a wrapper that calls both.
 */

import { writeFileSync, chmodSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface StatusLineConfig {
  type: "command";
  command: string;
  padding?: number;
}

// Our statusline command
const OMC_STATUSLINE_COMMAND = "node ~/.claude/oh-my-claude/dist/statusline/statusline.js";

// Wrapper script path
const WRAPPER_SCRIPT_PATH = join(homedir(), ".claude", "oh-my-claude", "statusline-wrapper.sh");

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
 * Puts omc status on second line for better visibility
 */
function generateWrapperScript(existingCommand: string): string {
  return `#!/bin/bash
# oh-my-claude StatusLine Wrapper
# Calls both the original statusLine and oh-my-claude's statusline
# Auto-generated - do not edit manually

input=$(cat)

# Call existing statusline
existing_output=$(echo "$input" | ${existingCommand} 2>/dev/null || echo "")

# Call oh-my-claude statusline
omc_output=$(echo "$input" | ${OMC_STATUSLINE_COMMAND} 2>/dev/null || echo "omc")

# Combine outputs - put omc on second line for better visibility
if [ -n "$existing_output" ] && [ -n "$omc_output" ]; then
  printf "%s\\n%s\\n" "$existing_output" "$omc_output"
elif [ -n "$existing_output" ]; then
  printf "%s\\n" "$existing_output"
elif [ -n "$omc_output" ]; then
  printf "%s\\n" "$omc_output"
else
  echo ""
fi
`;
}

/**
 * Merge statusLine configuration
 *
 * Returns the new config and whether a wrapper was created
 */
export function mergeStatusLine(
  existing: StatusLineConfig | undefined
): {
  config: StatusLineConfig;
  wrapperCreated: boolean;
  backupCreated: boolean;
} {
  // If no existing statusline, just use ours
  if (!existing) {
    return {
      config: {
        type: "command",
        command: OMC_STATUSLINE_COMMAND,
      },
      wrapperCreated: false,
      backupCreated: false,
    };
  }

  // If existing is already ours or wrapper, don't change anything
  if (isOurStatusLine(existing.command)) {
    return {
      config: existing,
      wrapperCreated: false,
      backupCreated: false,
    };
  }

  // Check if existing is already our wrapper
  if (existing.command.includes("statusline-wrapper.sh")) {
    return {
      config: existing,
      wrapperCreated: false,
      backupCreated: false,
    };
  }

  // Create wrapper script
  const wrapperContent = generateWrapperScript(existing.command);
  writeFileSync(WRAPPER_SCRIPT_PATH, wrapperContent);
  chmodSync(WRAPPER_SCRIPT_PATH, 0o755);

  // Backup existing config
  writeFileSync(BACKUP_FILE_PATH, JSON.stringify(existing, null, 2));

  return {
    config: {
      type: "command",
      command: WRAPPER_SCRIPT_PATH,
      padding: existing.padding,
    },
    wrapperCreated: true,
    backupCreated: true,
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
    return isOurStatusLine(command) || command.includes("statusline-wrapper.sh");
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
