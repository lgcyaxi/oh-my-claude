#!/usr/bin/env node
/**
 * oh-my-claude StatusLine Script
 *
 * Reads MCP background task status from a status file and outputs
 * a formatted status line for Claude Code's statusLine feature.
 *
 * Usage in settings.json:
 * {
 *   "statusLine": {
 *     "type": "command",
 *     "command": "node ~/.claude/oh-my-claude/dist/statusline/statusline.js"
 *   }
 * }
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import { formatStatusLine, formatEmptyStatusLine, formatIdleStatusLine, type StatusLineData } from "./formatter";

// Status file path - MCP server writes to this
const STATUS_FILE_PATH = join(homedir(), ".claude", "oh-my-claude", "status.json");

// Timeout for the entire script (prevent blocking terminal)
const TIMEOUT_MS = 100;

/**
 * Read status from the shared status file
 */
function readStatusFile(): StatusLineData | null {
  try {
    if (!existsSync(STATUS_FILE_PATH)) {
      return null;
    }

    const content = readFileSync(STATUS_FILE_PATH, "utf-8");
    const data = JSON.parse(content) as StatusLineData;

    // Validate the data structure
    if (!data || typeof data !== "object") {
      return null;
    }

    // Check if data is stale (older than 5 minutes)
    if (data.updatedAt) {
      const updatedAt = new Date(data.updatedAt).getTime();
      const age = Date.now() - updatedAt;
      if (age > 5 * 60 * 1000) {
        // Data is stale, return empty
        return null;
      }
    }

    return data;
  } catch {
    // Silently fail - status file may not exist or be malformed
    return null;
  }
}

/**
 * Main function
 */
async function main() {
  // Set up timeout to prevent blocking
  const timeoutId = setTimeout(() => {
    // Output empty status and exit on timeout
    console.log(formatEmptyStatusLine());
    process.exit(0);
  }, TIMEOUT_MS);

  try {
    // Read Claude Code's input from stdin (may be empty or JSON)
    // We don't actually need it, but we consume it to avoid broken pipe
    let _input = "";
    try {
      _input = readFileSync(0, "utf-8");
    } catch {
      // stdin may be empty or unavailable
    }

    // Read status from file
    const statusData = readStatusFile();

    if (!statusData) {
      console.log(formatEmptyStatusLine());
    } else if (statusData.activeTasks.length === 0) {
      // No active tasks - show idle status with provider info
      console.log(formatIdleStatusLine(statusData.providers));
    } else {
      console.log(formatStatusLine(statusData));
    }
  } catch {
    // On any error, output minimal status
    console.log(formatEmptyStatusLine());
  } finally {
    clearTimeout(timeoutId);
  }
}

main();
