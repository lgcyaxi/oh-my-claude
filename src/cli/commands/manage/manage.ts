/**
 * manage command — oh-my-claude manager (alias: m)
 *
 * Groups management-oriented subcommands under a single parent:
 *   oh-my-claude manage pref            # Manage preferences
 *   oh-my-claude manage memory          # Manage memory system
 *   oh-my-claude manage config          # Manage configuration
 *   oh-my-claude manage statusline      # Manage statusline
 *   oh-my-claude manage tc              # Write terminal configuration (alias: tc)
 *
 * Shortcuts (omc = oh-my-claude binary alias):
 *   omc m pref        # same as oh-my-claude manage pref
 *   omc m tc tmux     # same as oh-my-claude manage tc tmux
 */

import type { Command } from 'commander';
import { createFormatters } from '../../utils/colors';
import { registerPreferenceCommand } from './preference';
import { registerMemoryCommand } from './memory';
import { registerConfigCommand } from './config';
import { registerStatuslineCommand } from './statusline';
import { registerTerminalConfigCommand } from './terminal-config';
import { registerStyleCommand } from './style';
import { registerOllamaCommand } from './ollama';
import { registerCleanupCommand } from './cleanup';
import { registerOpenCodeLogCommand } from './opencode-log';

export function registerManageCommand(program: Command) {
	const { c } = createFormatters();

	const manageCmd = program
		.command('manage')
		.alias('m')
		.description(
			'oh-my-claude manager — pref, memory, config, statusline, terminal-config',
		)
		.action(() => {
			console.log(
				`${c.bold}oh-my-claude Manager${c.reset}  ${c.dim}(shortcut: omc m)${c.reset}\n`,
			);
			console.log(
				`  omc m pref        ${c.dim}# Manage preferences${c.reset}`,
			);
			console.log(
				`  omc m memory      ${c.dim}# Manage memory system${c.reset}`,
			);
			console.log(
				`  omc m config      ${c.dim}# Manage configuration${c.reset}`,
			);
			console.log(
				`  omc m statusline  ${c.dim}# Manage statusline${c.reset}`,
			);
			console.log(
				`  omc m style       ${c.dim}# Manage output styles${c.reset}`,
			);
			console.log(
				`  omc m ollama      ${c.dim}# Manage Ollama embedding models for memory${c.reset}`,
			);
			console.log(
				`  omc m tc          ${c.dim}# Write terminal configuration (tmux)${c.reset}`,
			);
			console.log(
				`  omc m cleanup     ${c.dim}# Clean stale session data and temp files${c.reset}`,
			);
			console.log(
			);
			console.log(
				`  omc m opencode log ${c.dim}# View OpenCode coworker activity log${c.reset}`,
			);
			console.log(
				`  omc m opencode viewer ${c.dim}# Re-open OpenCode coworker viewer${c.reset}`,
			);
			console.log();
			console.log(
				`Run ${c.cyan}omc m <subcommand> --help${c.reset} for details.`,
			);
		});

	// Attach existing command modules as children of manageCmd
	registerPreferenceCommand(manageCmd); // manage pref + add, list, show, remove, enable, disable, status, test
	registerMemoryCommand(manageCmd); // manage memory + status, search, list, show, delete, compact
	registerConfigCommand(manageCmd); // manage config + --get, --set, --unset, --list
	registerStatuslineCommand(manageCmd); // manage statusline + preset, toggle
	registerStyleCommand(manageCmd); // manage style + list, set, show, reset, create
	registerOllamaCommand(manageCmd); // manage ollama + status, pull, use
	registerTerminalConfigCommand(manageCmd); // manage terminal-config (tc) + tmux
	registerCleanupCommand(manageCmd); // manage cleanup + --dry-run, --force
	registerOpenCodeLogCommand(manageCmd); // manage opencode log + --print, --follow, --clear
}
