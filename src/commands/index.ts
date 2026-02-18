/**
 * Slash commands for oh-my-claude
 *
 * These commands are installed to ~/.claude/commands/
 * and can be invoked with /command-name in Claude Code
 */

import { readFileSync } from "node:fs";
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
  "omc-codex",
  "omc-pref",
  "omc-up",
  "omc-down",
  "omc-pend",
  "omc-status-bridge",
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

// All commands
export const commands = [...agentCommands, ...actionCommands, ...modeCommands] as const;

export type CommandName = typeof commands[number];

/**
 * Get command file content
 */
export function getCommandContent(name: CommandName): string {
  const commandPath = join(dirname(__filename), `${name}.md`);
  return readFileSync(commandPath, "utf-8");
}
