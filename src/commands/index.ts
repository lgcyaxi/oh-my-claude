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
  "omc-oracle",
  "omc-librarian",
  "omc-reviewer",
  "omc-scout",
  "omc-explore",
  "omc-plan",
  "omc-start-work",
  "omc-status",
] as const;

// Quick action commands (omcx- prefix)
export const actionCommands = [
  "omcx-commit",
  "omcx-implement",
  "omcx-refactor",
  "omcx-docs",
  "omcx-issue",
] as const;

// Special mode commands
export const modeCommands = [
  "ulw", // Ultrawork mode - work until done
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
