/**
 * Slash commands for oh-my-claude
 *
 * These commands are installed to ~/.claude/commands/
 * and can be invoked with /command-name in Claude Code
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

// Agent activation commands (omc- prefix)
export const agentCommands = [
  "omc-sisyphus",
  "omc-plan",
  "omc-start-work",
  "omc-status",
  "omc-switch",
  "omc-mem-compact",
  "omc-mem-clear",
  "omc-mem-daily",
  "omc-mem-summary",
  "omc-ulw",
  "omc-opencode",
  "omc-pref",
] as const;

// Quick action commands (omcx- prefix)
export const actionCommands = [
  "omcx-commit",
  "omcx-implement",
  "omcx-refactor",
  "omcx-docs",
  "omcx-issue",
] as const;

// Special mode commands (kept for backward compat, but primary names are in agentCommands)
export const modeCommands = [
] as const;

// --- Grouped command arrays ---

/** Orchestration & workflow commands */
export const orchestrationCommands = [
  "omc-sisyphus",
  "omc-plan",
  "omc-start-work",
  "omc-ulw",
] as const;

/** Memory management commands */
export const memoryCommands = [
  "omc-mem-clear",
  "omc-mem-compact",
  "omc-mem-daily",
  "omc-mem-summary",
] as const;

/** Runtime & infrastructure commands */
export const runtimeCommands = [
  "omc-status",
  "omc-switch",
  "omc-opencode",
  "omc-pref",
] as const;

// All commands
export const commands = [...agentCommands, ...actionCommands, ...modeCommands] as const;

export type CommandName = typeof commands[number];

/** Subfolder search order for command .md files */
const commandSubfolders = ["orchestration", "memory", "runtime", "actions"];

/**
 * Get command file content (searches root and subfolders)
 */
export function getCommandContent(name: CommandName): string {
  const baseDir = dirname(__filename);
  // Check root first
  const rootPath = join(baseDir, `${name}.md`);
  if (existsSync(rootPath)) {
    return readFileSync(rootPath, "utf-8");
  }
  // Search subfolders
  for (const sub of commandSubfolders) {
    const subPath = join(baseDir, sub, `${name}.md`);
    if (existsSync(subPath)) {
      return readFileSync(subPath, "utf-8");
    }
  }
  throw new Error(`Command file not found: ${name}.md`);
}
