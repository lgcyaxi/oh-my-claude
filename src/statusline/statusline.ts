#!/usr/bin/env node
/**
 * oh-my-claude StatusLine Script
 *
 * A segment-based statusline system that displays:
 * - Model: Current Claude model
 * - Git: Branch and status
 * - Directory: Current working directory
 * - Context: Token usage
 * - Session: Session duration
 * - Output Style: Current output mode
 * - MCP: Background task status
 *
 * Configuration: ~/.config/oh-my-claude/statusline.json
 *
 * Usage in settings.json:
 * {
 *   "statusLine": {
 *     "type": "command",
 *     "command": "node ~/.claude/oh-my-claude/dist/statusline/statusline.js"
 *   }
 * }
 */

import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { platform, homedir } from "node:os";

// Debug mode: set DEBUG_STATUSLINE=1 to enable
const DEBUG_STATUSLINE = process.env.DEBUG_STATUSLINE === "1";

/**
 * Log debug messages when DEBUG_STATUSLINE=1
 */
function debugLog(message: string): void {
  if (!DEBUG_STATUSLINE) return;
  try {
    const logDir = join(homedir(), ".config", "oh-my-claude", "logs");
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    const logPath = join(logDir, "statusline-debug.log");
    const timestamp = new Date().toISOString();
    appendFileSync(logPath, `[${timestamp}] ${message}\n`);
  } catch {
    // Silently fail
  }
}

import { loadConfig } from "./config";
import { renderSegments } from "./segments";
import type { SegmentContext, ClaudeCodeInput } from "./segments/types";
import { getSessionId, ensureSessionDir } from "./session";
import { formatStatusLine, formatEmptyStatusLine, type StatusLineData } from "./formatter";

// Timeout for the entire script (prevent blocking terminal)
// 5 seconds allows for keychain access and API calls (cached results are much faster)
const TIMEOUT_MS = 5000;

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  ready: "\x1b[32m", // Green
};

/**
 * Parse Claude Code input from stdin (if available)
 */
function parseClaudeCodeInput(input: string): ClaudeCodeInput | undefined {
  try {
    if (!input || !input.trim()) {
      return undefined;
    }
    const parsed = JSON.parse(input);
    return {
      model: parsed.model,
      output_style: parsed.output_style,
      transcript_path: parsed.transcript_path,
      cost: parsed.cost,
      workspace: parsed.workspace,
      oauth: parsed.oauth,
    };
  } catch {
    return undefined;
  }
}

/**
 * Read MCP status from the session status file (for backward compatibility)
 */
function readMcpStatus(sessionDir: string): StatusLineData | null {
  try {
    const statusPath = join(sessionDir, "status.json");
    if (!existsSync(statusPath)) {
      return null;
    }

    const content = readFileSync(statusPath, "utf-8");
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
        return null;
      }
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Format the ready indicator (when no segments are active)
 */
/** Brand prefix — shows "omc[debug]" when OMC_DEBUG=1 */
const BRAND_PREFIX = process.env.OMC_DEBUG === "1" ? "omc[debug]" : "omc";

function formatReadyStatus(): string {
  return `${BRAND_PREFIX} ${colors.ready}●${colors.reset} ready`;
}

/**
 * Main function
 */
async function main() {
  // Set up timeout to prevent blocking
  const timeoutId = setTimeout(() => {
    // Output empty status and exit on timeout
    console.log(formatReadyStatus());
    process.exit(0);
  }, TIMEOUT_MS);

  try {
    // Read Claude Code's input from stdin (cross-platform)
    let stdinInput = "";
    try {
      // On Windows, we need to handle stdin differently
      // Use process.stdin.fd for better cross-platform support
      const fd = process.stdin.fd;
      debugLog(`Reading stdin from fd=${fd}, platform=${platform()}`);

      // Check if stdin is a TTY (no piped input)
      if (process.stdin.isTTY) {
        debugLog("stdin is TTY - no piped input available");
      } else {
        stdinInput = readFileSync(fd, "utf-8");
        debugLog(`Read ${stdinInput.length} chars from stdin`);
        if (stdinInput.length > 0) {
          debugLog(`stdin preview: ${stdinInput.slice(0, 200)}...`);
        }
      }
    } catch (error) {
      // stdin may be empty or unavailable
      debugLog(`Failed to read stdin: ${error}`);
    }

    // Load configuration
    const config = loadConfig();

    // If statusline is disabled, output empty
    if (!config.enabled) {
      console.log("");
      return;
    }

    // Parse Claude Code input for advanced segments
    const claudeCodeInput = parseClaudeCodeInput(stdinInput);
    debugLog(`claudeCodeInput parsed: model=${claudeCodeInput?.model?.id ?? "none"}, style=${claudeCodeInput?.output_style?.name ?? "none"}, transcript=${claudeCodeInput?.transcript_path ?? "none"}`);

    // Get session info
    const sessionId = getSessionId();
    const sessionDir = ensureSessionDir(sessionId);

    // Build segment context
    const context: SegmentContext = {
      cwd: process.cwd(),
      sessionDir,
      claudeCodeInput,
    };

    // Render all enabled segments
    const segmentOutput = await renderSegments(config, context);

    // Build final output
    if (segmentOutput) {
      // Prefix with brand (includes [debug] when OMC_DEBUG=1)
      console.log(`${BRAND_PREFIX} ${segmentOutput}`);
    } else {
      // No segments produced output - show ready status
      console.log(formatReadyStatus());
    }
  } catch {
    // On any error, output minimal status
    console.log(formatReadyStatus());
  } finally {
    clearTimeout(timeoutId);
  }
}

main();
