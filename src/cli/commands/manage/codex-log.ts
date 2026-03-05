/**
 * manage codex log — View the Codex daemon activity log.
 *
 * The CodexAppServerDaemon writes a structured JSONL activity log to
 * ~/.claude/oh-my-claude/logs/codex-activity.jsonl whenever it processes
 * turns (user messages, agent replies, tool calls, errors).
 *
 * Usage:
 *   omc m codex log           # tail log in current terminal (live)
 *   omc m codex log --print   # print last 50 entries and exit
 *   omc m codex log --clear   # truncate the log file
 */

import { readFileSync, writeFileSync, existsSync, watchFile, unwatchFile } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Command } from "commander";
import { createFormatters } from "../../utils/colors";

const LOG_PATH = join(homedir(), ".claude", "oh-my-claude", "logs", "codex-activity.jsonl");
const STATUS_PATH = join(homedir(), ".claude", "oh-my-claude", "run", "codex-status.json");
const STALENESS_THRESHOLD_MS = 90_000; // 90 seconds
const PRINT_LINES = 50;
const PRINT_TRUNCATE = 500; // chars per message in --print mode

// ─── Entry types ─────────────────────────────────────────────────────────────

interface ActivityEntry {
  ts: string;
  type: "session_start" | "user_turn" | "agent_message" | "task_complete" | "error";
  content: string;
  model?: string;
}

// ─── Formatting ──────────────────────────────────────────────────────────────

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  bold: "\x1b[1m",
  blue: "\x1b[34m",
};

/** Format a timestamp as a relative string (e.g., "2m ago", "just now"). */
function relativeTime(isoTs: string): string {
  const diffMs = Date.now() - new Date(isoTs).getTime();
  const diffS = Math.floor(diffMs / 1000);
  if (diffS < 5) return "just now";
  if (diffS < 60) return `${diffS}s ago`;
  const diffM = Math.floor(diffS / 60);
  if (diffM < 60) return `${diffM}m ago`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return new Date(isoTs).toLocaleDateString();
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + ANSI.dim + "…" + ANSI.reset;
}

function formatEntry(entry: ActivityEntry, truncateContent = false): string {
  const rel = relativeTime(entry.ts);
  const dim = `${ANSI.dim}[${rel}]${ANSI.reset}`;
  const content = truncateContent ? truncate(entry.content, PRINT_TRUNCATE) : entry.content;

  switch (entry.type) {
    case "session_start":
      return (
        `\n${ANSI.dim}${"─".repeat(40)}${ANSI.reset}\n` +
        `${ANSI.bold}${ANSI.blue}● New Session${ANSI.reset}` +
        (entry.model ? ` ${ANSI.dim}(${entry.model})${ANSI.reset}` : "") +
        `  ${ANSI.dim}${new Date(entry.ts).toLocaleString()}${ANSI.reset}\n` +
        `${ANSI.dim}  ${entry.content}${ANSI.reset}`
      );
    case "user_turn":
      return `${dim} ${ANSI.cyan}${ANSI.bold}YOU:${ANSI.reset}   ${content}`;
    case "agent_message":
      return `${dim} ${ANSI.white}CODEX:${ANSI.reset} ${content}`;
    case "task_complete":
      return `${dim} ${ANSI.green}✓ DONE:${ANSI.reset} ${content}`;
    case "error":
      return `${dim} ${ANSI.red}✗ ERROR:${ANSI.reset} ${content}`;
    default:
      return `${dim} ${(entry as ActivityEntry).type}: ${content}`;
  }
}

function parseEntries(raw: string): ActivityEntry[] {
  return raw
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line) as ActivityEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is ActivityEntry => e !== null);
}

// ─── Actions ─────────────────────────────────────────────────────────────────

function doPrint(): void {
  const { c } = createFormatters();

  if (!existsSync(LOG_PATH)) {
    console.log(`${c.dim}No Codex activity log found.${c.reset}`);
    console.log(`${c.dim}Start the Codex daemon with: oh-my-claude bridge up codex${c.reset}`);
    return;
  }

  const raw = readFileSync(LOG_PATH, "utf-8");
  const entries = parseEntries(raw).slice(-PRINT_LINES);

  if (entries.length === 0) {
    console.log(`${c.dim}Activity log is empty.${c.reset}`);
    return;
  }

  console.log(`${ANSI.bold}Codex Conversation Log${ANSI.reset} ${ANSI.dim}(last ${entries.length} entries)${ANSI.reset}`);
  for (const entry of entries) {
    console.log(formatEntry(entry, /* truncateContent= */ true));
  }
}

function doClear(): void {
  const { c } = createFormatters();
  try {
    writeFileSync(LOG_PATH, "", "utf-8");
    console.log(`${c.green}✓${c.reset} Codex activity log cleared.`);
  } catch (err) {
    console.error(`${c.red}✗${c.reset} Failed to clear log: ${err}`);
    process.exit(1);
  }
}

function doFollow(): void {
  const { c } = createFormatters();

  if (!existsSync(LOG_PATH)) {
    console.log(`${c.dim}Waiting for Codex activity log to be created...${c.reset}`);
    console.log(`${c.dim}Start the Codex daemon with: oh-my-claude bridge up codex${c.reset}`);
    console.log(`${c.dim}Press Ctrl+C to exit.${c.reset}\n`);
  } else {
    // Print recent history first (last 20 entries for context)
    const raw = readFileSync(LOG_PATH, "utf-8");
    const entries = parseEntries(raw).slice(-20);
    if (entries.length > 0) {
      console.log(`${ANSI.dim}─── recent history ───${ANSI.reset}`);
      for (const entry of entries) {
        console.log(formatEntry(entry, false));
      }
    }
  }

  console.log(`\n${ANSI.dim}─── live (Ctrl+C to stop) ───${ANSI.reset}\n`);

  // Track file size to detect new content
  let lastSize = existsSync(LOG_PATH)
    ? readFileSync(LOG_PATH, "utf-8").length
    : 0;

  watchFile(LOG_PATH, { interval: 300 }, () => {
    // Staleness check: if codex-status.json exists and updatedAt is >90s ago, daemon is gone
    if (existsSync(STATUS_PATH)) {
      try {
        const statusRaw = readFileSync(STATUS_PATH, "utf-8");
        const statusJson = JSON.parse(statusRaw) as { updatedAt?: number };
        if (statusJson.updatedAt && Date.now() - statusJson.updatedAt > STALENESS_THRESHOLD_MS) {
          unwatchFile(LOG_PATH);
          console.log(`\n${ANSI.dim}Codex daemon stopped. Exiting viewer.${ANSI.reset}`);
          process.exit(0);
        }
      } catch {
        // Status file unreadable — ignore, keep watching
      }
    }

    try {
      const content = readFileSync(LOG_PATH, "utf-8");
      if (content.length <= lastSize) {
        lastSize = content.length;
        return;
      }
      const newContent = content.slice(lastSize);
      lastSize = content.length;

      const newEntries = parseEntries(newContent);
      for (const entry of newEntries) {
        console.log(formatEntry(entry, false));
      }
    } catch {
      lastSize = 0;
    }
  });

  process.on("SIGINT", () => {
    unwatchFile(LOG_PATH);
    console.log(`\n${ANSI.dim}Stopped.${ANSI.reset}`);
    process.exit(0);
  });
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerCodexLogCommand(parent: Command): void {
  const codexCmd = parent
    .command("codex")
    .description("Manage Codex daemon and view activity");

  codexCmd
    .command("log")
    .description("View Codex daemon conversation log")
    .option("--print", "print last 50 entries and exit")
    .option("--clear", "truncate the log file")
    .action((opts: { print?: boolean; clear?: boolean }) => {
      if (opts.clear) {
        doClear();
      } else if (opts.print) {
        doPrint();
      } else {
        doFollow();
      }
    });
}
