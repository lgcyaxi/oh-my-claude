/**
 * CC command — Launch Claude Code with per-session proxy or direct provider connection
 *
 * Each `oh-my-claude cc` invocation spawns its own proxy on dynamic ports.
 * When a terminal multiplexer is available (WezTerm/tmux), Claude Code launches
 * in a new window and the current terminal returns immediately.
 *
 * OMC Shortcuts (single dash to differentiate from Claude's double-dash flags):
 *   -r         → --resume (resume last conversation)
 *   -skip      → --dangerously-skip-permissions
 *   -wt        → --worktree (isolated git worktree session)
 *   -rc        → launch `claude remote-control` with proxy (mobile access)
 *
 * Subcommands:
 *   cc list          — List active CC sessions
 *   cc stop [id]     — Stop a CC session (kill proxy + terminal pane)
 */

import type { Command } from 'commander';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { createFormatters } from '../../utils/colors';
import { findFreePorts } from '../../utils/proxy-lifecycle';
import {
	readProxyRegistry,
	unregisterProxySession,
	cleanupStaleEntries,
} from '../../../proxy/registry';
import { detectTerminal } from '../../utils/terminal-detect';

import { expandShortcuts, preCreateWorktree } from './cc-shortcuts';
import {
	detectTerminalBackend,
	isBridgeModeActive,
	runNativeCC,
	loadApiEnvFile,
	formatAge,
} from './cc-routing';
import { killTerminalPane } from './cc-terminals';
import { launchDetachedSession, launchInlineSession } from './cc-session';
import { spawnBridgeWorkers } from './cc-bridge';
import {
	resolveAlias,
	buildProviderMap,
} from '../../../shared/providers/aliases';

export function listSessionsAction() {
	const { c, ok, dimText } = createFormatters();
	cleanupStaleEntries();
	const entries = readProxyRegistry();
	if (entries.length === 0) {
		console.log(dimText('No active CC sessions.'));
		return;
	}
	console.log(ok(`Active CC sessions (${entries.length}):\n`));
	for (const entry of entries) {
		const age = formatAge(entry.startedAt);
		const terminal = entry.terminalBackend
			? `[${entry.terminalBackend}]`
			: '[inline]';
		const detachedLabel = entry.detached ? ' (detached)' : '';
		console.log(
			`  ${c.cyan}${entry.sessionId}${c.reset}  ` +
				`port=${entry.port}  pid=${entry.pid}  ${terminal}${detachedLabel}  ${age}`,
		);
		if (entry.cwd) {
			console.log(`    ${dimText(entry.cwd)}`);
		}
	}
}

export function registerCcCommand(program: Command) {
	const ccCmd = program
		.command('cc')
		.description(
			'Launch Claude Code with per-session proxy or direct provider connection',
		)
		.argument(
			'[claude-args...]',
			"Arguments to pass through to claude (e.g. --resume, -c 'prompt')",
		)
		.option(
			'-p, --provider <alias>',
			'Connect directly to provider (ds/zp/zai/mm/mm-cn/km/ay)',
		)
		.option(
			'-t, --terminal <mode>',
			'Terminal launch mode: none (inline), auto, wezterm, tmux',
			process.platform === 'win32' ? 'auto' : 'none',
		)
		.option(
			'-d, --debug',
			'Enable proxy debug mode (logs to ~/.claude/oh-my-claude/proxy-{session}.log)',
		)
		.addHelpText(
			'after',
			`
OMC Shortcuts (single dash):
  -r         Resume last conversation (→ --resume)
  -skip      Dangerously skip permissions (→ --dangerously-skip-permissions)
  -wt        Create git worktree for isolated session (→ --worktree)
  -rc        Launch Remote Control mode (mobile access via claude.ai/code)
  -bridge    Enable Bridge Mode (force task delegation to teammates)

Direct Provider Connection:
  oh-my-claude cc -p ds            Connect to DeepSeek (no proxy needed)
  oh-my-claude cc -p mm-cn         Connect to MiniMax CN
  oh-my-claude cc -p zai           Connect to Z.AI (ZhiPu global)
  oh-my-claude cc -p ay            Connect to Aliyun
  oh-my-claude cc -p km            Connect to Kimi

Examples:
  oh-my-claude cc -r               Resume last session with proxy
  oh-my-claude cc -skip            Skip permissions with proxy
  oh-my-claude cc -wt              Isolated git worktree session
  oh-my-claude cc -r -skip         Combine shortcuts
  oh-my-claude cc -rc              Remote Control with proxy routing`,
		)
		.allowUnknownOption(true);

	program.enablePositionalOptions(true);
	ccCmd.passThroughOptions(true);

	// --- Subcommand: cc list ---
	ccCmd
		.command('list')
		.alias('ls')
		.alias('ps')
		.description('List active CC sessions')
		.action(listSessionsAction);

	// --- Subcommand: cc stop ---
	ccCmd
		.command('stop [sessionId]')
		.description('Stop a CC session (kill proxy + terminal pane)')
		.action((sessionId?: string) => {
			const { c, ok, fail, dimText } = createFormatters();

			cleanupStaleEntries();
			const entries = readProxyRegistry();

			if (entries.length === 0) {
				console.log(dimText('No active CC sessions.'));
				return;
			}

			let target = sessionId
				? entries.find(
						(e) =>
							e.sessionId === sessionId ||
							e.sessionId.startsWith(sessionId),
					)
				: entries[entries.length - 1];

			if (!target) {
				console.log(fail(`Session "${sessionId}" not found.`));
				console.log(
					dimText(
						`Active sessions: ${entries.map((e) => e.sessionId).join(', ')}`,
					),
				);
				return;
			}

			try {
				if (process.platform === 'win32') {
					execSync(`taskkill /F /PID ${target.pid}`, {
						stdio: 'ignore',
						windowsHide: true,
					});
				} else {
					process.kill(target.pid, 'SIGTERM');
				}
				console.log(ok(`Killed proxy (PID: ${target.pid})`));
			} catch {
				console.log(dimText(`Proxy (PID: ${target.pid}) already dead`));
			}

			if (target.paneId && target.terminalBackend) {
				try {
					killTerminalPane(target.terminalBackend, target.paneId);
					console.log(
						ok(
							`Closed ${target.terminalBackend} pane (${target.paneId})`,
						),
					);
				} catch {
					console.log(dimText(`Terminal pane cleanup skipped`));
				}
			}

			// Tear down bridge workers if this session had bridge mode active
			try {
				const { readFileSync, existsSync } = require('node:fs');
				const modePath = join(
					homedir(),
					'.claude',
					'oh-my-claude',
					'sessions',
					target.sessionId,
					'mode.json',
				);
				if (existsSync(modePath)) {
					const mode = JSON.parse(readFileSync(modePath, 'utf-8'));
					if (mode.bridge) {
						console.log(dimText('Stopping bridge workers...'));
						try {
							execSync('oh-my-claude bridge down all', {
								stdio: 'ignore',
								timeout: 10_000,
								windowsHide: true,
							});
							console.log(ok('Bridge workers stopped'));
						} catch {}
					}
				}
			} catch {}

			unregisterProxySession(target.sessionId);
			console.log(
				ok(`Session ${c.cyan}${target.sessionId}${c.reset} stopped.`),
			);
		});

	// --- Main action: launch Claude Code ---
	ccCmd.action(async (rawClaudeArgs: string[], options) => {
		const { c, ok, fail, dimText } = createFormatters();

		// Load fresh API keys from ~/.zshrc.api
		loadApiEnvFile();

		// Expand OMC single-dash shortcuts
		let {
			args: claudeArgs,
			isRemoteControl,
			worktreeName,
			bridgeMode,
		} = expandShortcuts(rawClaudeArgs);

		// Pre-create worktree from current branch if -wt was used
		if (worktreeName !== null) {
			if (worktreeName.length === 0) {
				worktreeName = `session-${randomBytes(4).toString('hex')}`;
				const wtIdx = claudeArgs.indexOf('--worktree');
				if (wtIdx !== -1) {
					claudeArgs.splice(wtIdx + 1, 0, worktreeName);
				}
			}
			preCreateWorktree(worktreeName);
		}

		// --- Provider pre-switch: start proxy pre-switched to the specified provider ---
		// The proxy starts with --provider/--model args so:
		// - First request routes to the provider immediately (no second switch call)
		// - /model shows the provider's models (not Anthropic's)
		// - User can still switch to another provider mid-session via menubar or slash commands
		let switchProvider: string | undefined;
		let switchModel: string | undefined;

		if (options.provider) {
			const alias = options.provider.toLowerCase();
			const PROVIDER_MAP = buildProviderMap();
			const provider = PROVIDER_MAP[alias];

			if (!provider) {
				console.log(
					fail(`Unknown provider alias: "${options.provider}"`),
				);
				console.log(
					dimText(
						`Available: ds, zp, zai, mm, mm-cn, km, ay (or full names)`,
					),
				);
				process.exit(1);
			}

			const apiKey = process.env[provider.apiKeyEnv];
			if (!apiKey) {
				console.log(fail(`${provider.apiKeyEnv} not set`));
				console.log(
					dimText(
						`Set it in your shell: export ${provider.apiKeyEnv}=your-key`,
					),
				);
				process.exit(1);
			}

			const resolved = resolveAlias(alias);
			if (resolved) {
				switchProvider = resolved.provider;
				switchModel = resolved.model;
			}

			console.log(
				ok(
					`Provider: ${c.cyan}${provider.name}${c.reset} (pre-switched via proxy)`,
				),
			);
			if (provider.defaultModel)
				console.log(
					dimText(`  Default model: ${provider.defaultModel}`),
				);
		}

		// --- Launch routing: omc cc always spawns a per-session proxy ---
		// terminalBackend only controls WINDOW BEHAVIOR (new window vs inline), not proxy availability.
		// Bridge mode (-bridge flag) changes agent behavioral preset but does not affect proxy spawning.
		if (bridgeMode || isBridgeModeActive()) {
			bridgeMode = true;
		}

		// --- Per-session proxy path ---
		let ports: { port: number; controlPort: number };
		try {
			ports = await findFreePorts();
		} catch {
			console.log(fail('Failed to allocate ports for session proxy.'));
			process.exit(1);
		}

		const debug = !!options.debug;
		const terminalMode: string = options.terminal ?? 'auto';
		const sessionId = randomBytes(4).toString('hex');

		console.log(
			dimText(
				`  Proxy ports: ${ports.port} (proxy) / ${ports.controlPort} (control)`,
			),
		);
		if (debug) console.log(dimText(`  Debug mode: proxy logs enabled`));

		// Write mode.json for bridge mode
		if (bridgeMode) {
			const sessionDir = join(
				homedir(),
				'.claude',
				'oh-my-claude',
				'sessions',
				sessionId,
			);
			mkdirSync(sessionDir, { recursive: true });
			writeFileSync(
				join(sessionDir, 'mode.json'),
				JSON.stringify({ ulw: false, bridge: true }),
			);
			console.log(
				ok(
					`Bridge Mode: ${c.yellow}enabled${c.reset} (task delegation enforced)`,
				),
			);
		}

		// Detect terminal backend for this session
		const insideWezTerm = !!process.env.WEZTERM_PANE;
		let terminal: 'wezterm' | 'tmux' | null = null;

		if (terminalMode === 'none' || insideWezTerm || isRemoteControl) {
			terminal = null;
		} else if (terminalMode === 'wezterm') {
			terminal = 'wezterm';
		} else if (terminalMode === 'tmux') {
			terminal = 'tmux';
		} else {
			// auto-detect
			const detected = await detectTerminal();
			terminal =
				detected === 'wezterm' || detected === 'tmux' ? detected : null;
		}

		if (terminal) {
			// Detached terminal path
			const result = await launchDetachedSession({
				sessionId,
				ports,
				terminal,
				claudeArgs,
				debug,
				bridgeMode,
				switchProvider,
				switchModel,
			});

			// Auto-spawn bridge workers if bridge mode is enabled
			if (bridgeMode) {
				// Fire-and-forget worker spawning
				spawnBridgeWorkers({
					sessionId,
					projectPath: process.cwd(),
					terminalBackend: terminal,
					mainPaneId: result.paneId,
					busPort: 18912,
				}).catch((err) => {
					console.log(
						dimText(
							`  Bridge worker spawn error: ${err instanceof Error ? err.message : String(err)}`,
						),
					);
				});
			}
		} else {
			// Inline (attached) path
			await launchInlineSession({
				sessionId,
				ports,
				claudeArgs,
				debug,
				bridgeMode,
				isRemoteControl,
				terminalMode,
				insideWezTerm,
				switchProvider,
				switchModel,
			});
		}
	});
}
