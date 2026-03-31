/**
 * Doctor zone: Components (--detail only)
 *
 * Detailed checks for agents, commands, MCP server, hooks, and statusline.
 */

import type { DoctorContext } from './types';
import { INSTALL_DIR, SETTINGS_PATH } from '../../../utils/paths';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export async function checkComponentsZone(ctx: DoctorContext) {
	const { ok, fail, warn, header, subheader, dimText, c } = ctx.formatters;

	// Agents
	console.log(`\n${header('Agents (detailed):')}`);
	const agentsDir = join(homedir(), '.claude', 'agents');
	const expectedAgents = [
		'sisyphus',
		'claude-reviewer',
		'claude-scout',
		'prometheus',
		'opencode',
		'ui-designer',
		'analyst',
		'librarian',
		'document-writer',
	];
	for (const agent of expectedAgents) {
		const agentPath = join(agentsDir, `${agent}.md`);
		const exists = existsSync(agentPath);
		console.log(`  ${exists ? ok(`${agent}.md`) : fail(`${agent}.md`)}`);
	}

	// Commands
	console.log(`\n${header('Commands (detailed):')}`);
	const commandsDir = join(homedir(), '.claude', 'commands');
	const expectedCommands = [
		'omc-sisyphus',
		'omc-plan',
		'omc-start-work',
		'omc-status',
		'omc-switch',
		'omc-ulw',
		'omc-opencode',
		'omc-pref',
		'omc-mem-compact',
		'omc-mem-clear',
		'omc-mem-daily',
		'omc-mem-summary',
		'omcx-commit',
		'omcx-implement',
		'omcx-refactor',
		'omcx-docs',
		'omcx-issue',
	];
	console.log(`  ${subheader('Agent commands (omc-):')}`);
	for (const cmd of expectedCommands.filter(
		(c) => c.startsWith('omc-') && !c.startsWith('omc-mem-'),
	)) {
		const cmdPath = join(commandsDir, `${cmd}.md`);
		const exists = existsSync(cmdPath);
		console.log(`    ${exists ? ok(`/${cmd}`) : fail(`/${cmd}`)}`);
	}
	console.log(`  ${subheader('Memory commands (omc-mem-):')}`);
	for (const cmd of expectedCommands.filter((c) =>
		c.startsWith('omc-mem-'),
	)) {
		const cmdPath = join(commandsDir, `${cmd}.md`);
		const exists = existsSync(cmdPath);
		console.log(`    ${exists ? ok(`/${cmd}`) : fail(`/${cmd}`)}`);
	}
	console.log(`  ${subheader('Quick action commands (omcx-):')}`);
	for (const cmd of expectedCommands.filter((c) => c.startsWith('omcx-'))) {
		const cmdPath = join(commandsDir, `${cmd}.md`);
		const exists = existsSync(cmdPath);
		console.log(`    ${exists ? ok(`/${cmd}`) : fail(`/${cmd}`)}`);
	}

	// MCP Server
	console.log(`\n${header('MCP Server (detailed):')}`);
	try {
		const settingsPath = join(homedir(), '.claude', 'settings.json');
		const settingsContent = existsSync(settingsPath)
			? JSON.parse(readFileSync(settingsPath, 'utf-8'))
			: {};
		const mcpEntry = settingsContent?.mcpServers?.['oh-my-claude'];
		if (mcpEntry) {
			console.log(`  ${ok('oh-my-claude registered')}`);
			console.log(`    Command: ${dimText(mcpEntry.command)}`);
			if (mcpEntry.args?.length) {
				const serverPath = mcpEntry.args[mcpEntry.args.length - 1];
				console.log(`    Server: ${dimText(serverPath)}`);
				const fileExists = existsSync(serverPath);
				console.log(
					`    File exists: ${fileExists ? `${c.green}Yes${c.reset}` : `${c.red}No${c.reset}`}`,
				);
			}
		} else {
			console.log(`  ${fail('oh-my-claude not registered')}`);
			console.log(
				`    ${dimText("Run 'oh-my-claude install' to register MCP server")}`,
			);
		}
	} catch (error) {
		console.log(`  ${fail('Failed to check MCP status')}`);
		console.log(`    ${dimText(String(error))}`);
	}

	// Hooks
	console.log(`\n${header('Hooks (detailed):')}`);
	const hooksDir = join(INSTALL_DIR, 'hooks');
	const expectedHooks = [
		'comment-checker.js',
		'todo-continuation.js',
		'task-notification.js',
	];
	for (const hook of expectedHooks) {
		const hookPath = join(hooksDir, hook);
		const exists = existsSync(hookPath);
		console.log(`  ${exists ? ok(hook) : fail(hook)}`);
	}

	// StatusLine
	console.log(`\n${header('StatusLine (detailed):')}`);
	try {
		const {
			validateStatusLineSetup,
		} = require('../../../installer/statusline-merger');
		const validation = validateStatusLineSetup();

		console.log(
			`  ${validation.details.scriptExists ? ok('statusline.js installed') : fail('statusline.js not installed')}`,
		);

		if (process.platform === 'win32') {
			console.log(
				`  ${validation.details.nodePathValid ? ok('Node.js path valid') : fail('Node.js path invalid')}`,
			);
		}

		console.log(
			`  ${validation.details.settingsConfigured ? ok('StatusLine configured in settings.json') : warn('StatusLine not configured in settings.json')}`,
		);

		if (existsSync(SETTINGS_PATH)) {
			const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
			if (settings.statusLine) {
				const cmd = settings.statusLine.command || '';
				const isWrapper = cmd.includes('statusline-wrapper');
				const isOurs = cmd.includes('oh-my-claude');
				if (isWrapper) {
					console.log(
						`    Mode: ${c.yellow}Merged (wrapper)${c.reset}`,
					);
				} else if (isOurs) {
					console.log(`    Mode: ${c.green}Direct${c.reset}`);
				} else {
					console.log(`    Mode: ${c.cyan}External${c.reset}`);
				}
			}
		}

		console.log(
			`  ${validation.details.commandWorks ? ok('StatusLine command works') : fail('StatusLine command failed')}`,
		);

		const configDir = join(homedir(), '.config', 'oh-my-claude');
		const configPath = join(configDir, 'statusline.json');
		const configExists = existsSync(configPath);
		console.log(
			`  ${configExists ? ok('StatusLine config exists') : warn('StatusLine config not found')}`,
		);
		if (configExists) {
			console.log(`    Path: ${dimText(configPath)}`);
		} else {
			console.log(`    ${dimText(`Expected: ${configPath}`)}`);
		}

		if (validation.warnings.length > 0) {
			console.log(`\n  ${subheader('Warnings:')}`);
			for (const w of validation.warnings) {
				console.log(`    ${warn(w)}`);
			}
		}

		if (validation.errors.length > 0) {
			console.log(`\n  ${subheader('Errors:')}`);
			for (const e of validation.errors) {
				console.log(`    ${fail(e)}`);
			}
		}

		console.log(
			`\n  Overall: ${validation.valid ? `${c.green}✓ Healthy${c.reset}` : `${c.red}✗ Issues detected${c.reset}`}`,
		);
	} catch (error) {
		console.log(`  ${fail('Failed to validate StatusLine:')} ${error}`);
	}
}
