import type { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createFormatters } from '../../utils/colors';
import { ALL_SEGMENT_IDS } from '../../../statusline/segments/types';

export function registerStatuslineCommand(program: Command) {
	const { c, ok, fail, warn } = createFormatters();

	const statuslineCmd = program
		.command('statusline')
		.description('Manage statusline integration')
		.option('--enable', 'Enable statusline')
		.option('--disable', 'Disable statusline')
		.option('--status', 'Show current statusline configuration')
		.action((options) => {
			const settingsPath = join(homedir(), '.claude', 'settings.json');
			const configPath = join(
				homedir(),
				'.config',
				'oh-my-claude',
				'statusline.json',
			);

			if (options.status || (!options.enable && !options.disable)) {
				// Show status
				console.log(`${c.bold}StatusLine Status${c.reset}\n`);

				if (!existsSync(settingsPath)) {
					console.log(fail('settings.json not found'));
					process.exit(1);
				}

				try {
					const settings = JSON.parse(
						readFileSync(settingsPath, 'utf-8'),
					);

					if (!settings.statusLine) {
						console.log(fail('StatusLine not configured'));
						console.log(
							`\nRun ${c.cyan}oh-my-claude omc statusline --enable${c.reset} to enable.`,
						);
					} else {
						const cmd = settings.statusLine.command || '';
						const isOurs = cmd.includes('oh-my-claude');
						const isWrapper = cmd.includes('statusline-wrapper');

						console.log(ok('StatusLine configured'));
						console.log(`  Command: ${c.dim}${cmd}${c.reset}`);

						if (isWrapper) {
							console.log(
								`  Mode: ${c.yellow}Merged (wrapper)${c.reset}`,
							);
						} else if (isOurs) {
							console.log(`  Mode: ${c.green}Direct${c.reset}`);
						} else {
							console.log(`  Mode: ${c.cyan}External${c.reset}`);
						}
					}

					// Show config details with row layout
					if (existsSync(configPath)) {
						const config = JSON.parse(
							readFileSync(configPath, 'utf-8'),
						);
						console.log(`\n${c.bold}Configuration${c.reset}`);
						console.log(
							`  Preset: ${c.cyan}${config.preset || 'standard'}${c.reset}`,
						);

						const segments = config.segments || {};
						const ROW_LABELS: Record<number, string> = {
							1: 'Session & Identity',
							2: 'Workspace & Context',
							3: 'Infrastructure',
						};

						// Group segments by row
						const byRow = new Map<
							number,
							Array<{
								id: string;
								enabled: boolean;
								position: number;
							}>
						>();
						for (const [id, seg] of Object.entries(segments)) {
							const s = seg as {
								enabled: boolean;
								position: number;
								row?: number;
							};
							const row = s.row ?? 1;
							if (!byRow.has(row)) byRow.set(row, []);
							byRow.get(row)!.push({
								id,
								enabled: s.enabled,
								position: s.position,
							});
						}

						for (const [row, items] of [...byRow.entries()].sort(
							([a], [b]) => a - b,
						)) {
							const label = ROW_LABELS[row] ?? `Row ${row}`;
							console.log(
								`\n  ${c.bold}Row ${row}: ${label}${c.reset}`,
							);
							items.sort((a, b) => a.position - b.position);
							for (const item of items) {
								const icon = item.enabled
									? `${c.green}●${c.reset}`
									: `${c.dim}○${c.reset}`;
								const pos = `${c.dim}pos:${item.position}${c.reset}`;
								console.log(`    ${icon} ${item.id} ${pos}`);
							}
						}
					}
				} catch (error) {
					console.log(fail(`Failed to read settings: ${error}`));
					process.exit(1);
				}
			} else if (options.enable) {
				// Enable statusline
				const {
					installStatusLine,
				} = require('../../installer/settings-merger');
				const { getStatusLineScriptPath } = require('../../installer');

				try {
					const result = installStatusLine(getStatusLineScriptPath());
					if (result.installed) {
						console.log(ok('StatusLine enabled'));
						if (result.wrapperCreated) {
							console.log(
								warn(
									'Wrapper created to merge with existing statusLine',
								),
							);
						}
					}
				} catch (error) {
					console.log(fail(`Failed to enable statusline: ${error}`));
					process.exit(1);
				}
			} else if (options.disable) {
				// Disable statusline
				const {
					uninstallStatusLine,
				} = require('../../installer/settings-merger');

				try {
					const result = uninstallStatusLine();
					if (result) {
						console.log(ok('StatusLine disabled'));
					} else {
						console.log(warn('StatusLine was not configured'));
					}
				} catch (error) {
					console.log(fail(`Failed to disable statusline: ${error}`));
					process.exit(1);
				}
			}
		});

	// Statusline preset subcommand
	statuslineCmd
		.command('preset <name>')
		.description('Set statusline preset (minimal, standard, full)')
		.action((name: string) => {
			const validPresets = ['minimal', 'standard', 'full'];
			if (!validPresets.includes(name)) {
				console.log(`Invalid preset: ${name}`);
				console.log(`Valid presets: ${validPresets.join(', ')}`);
				process.exit(1);
			}

			const { setPreset } = require('../../../statusline/config');

			try {
				const config = setPreset(
					name as 'minimal' | 'standard' | 'full',
				);
				console.log(`${c.green}✓${c.reset} Preset changed to: ${name}`);

				const segments = config.segments || {};
				const ROW_LABELS: Record<number, string> = {
					1: 'Session & Identity',
					2: 'Workspace & Context',
					3: 'Infrastructure',
				};

				const byRow = new Map<
					number,
					Array<{ id: string; position: number }>
				>();
				for (const [id, seg] of Object.entries(segments)) {
					const s = seg as {
						enabled: boolean;
						position: number;
						row?: number;
					};
					if (!s.enabled) continue;
					const row = s.row ?? 1;
					if (!byRow.has(row)) byRow.set(row, []);
					byRow.get(row)!.push({ id, position: s.position });
				}

				for (const [row, items] of [...byRow.entries()].sort(
					([a], [b]) => a - b,
				)) {
					const label = ROW_LABELS[row] ?? `Row ${row}`;
					console.log(`\n  ${c.bold}Row ${row}: ${label}${c.reset}`);
					items.sort((a, b) => a.position - b.position);
					for (const item of items) {
						console.log(`    ● ${item.id}`);
					}
				}
			} catch (error) {
				console.log(
					`${c.red}✗${c.reset} Failed to set preset: ${error}`,
				);
				process.exit(1);
			}
		});

	// Statusline toggle subcommand
	statuslineCmd
		.command('toggle <segment> [state]')
		.description(
			`Toggle a segment on/off (${ALL_SEGMENT_IDS.join(', ')})`,
		)
		.action((segment: string, state?: string) => {
			const validSegments: readonly string[] = ALL_SEGMENT_IDS;
			if (!validSegments.includes(segment)) {
				console.log(`Invalid segment: ${segment}`);
				console.log(`Valid segments: ${validSegments.join(', ')}`);
				process.exit(1);
			}
			const segmentId = segment as (typeof ALL_SEGMENT_IDS)[number];

			const {
				toggleSegment,
				loadConfig,
			} = require('../../../statusline/config');

			try {
				// Determine new state
				let enabled: boolean;
				if (state === 'on' || state === 'true' || state === '1') {
					enabled = true;
				} else if (
					state === 'off' ||
					state === 'false' ||
					state === '0'
				) {
					enabled = false;
				} else if (state === undefined) {
					// Toggle current state
					const currentConfig = loadConfig();
					enabled = !currentConfig.segments[segmentId]?.enabled;
				} else {
					console.log(`Invalid state: ${state}`);
					console.log(`Valid states: on, off (or omit to toggle)`);
					process.exit(1);
				}

				const config = toggleSegment(segmentId, enabled);
				const newState = config.segments[segmentId]?.enabled
					? 'enabled'
					: 'disabled';
				console.log(
					`${c.green}✓${c.reset} Segment "${segmentId}" ${newState}`,
				);
			} catch (error) {
				console.log(
					`${c.red}✗${c.reset} Failed to toggle segment: ${error}`,
				);
				process.exit(1);
			}
		});
}
