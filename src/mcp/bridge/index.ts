import type { ToolContext, CallToolResult } from '../shared/types';
import { handleBridgeSend } from './send';
import { handleBridgeDispatch } from './dispatch';
import { handleBridgeWait } from './wait';
import { handleBridgeEvent } from './event';

export async function handleBridgeTool(
	name: string,
	args: Record<string, unknown>,
	ctx: ToolContext,
): Promise<CallToolResult | undefined> {
	const cachedProjectRoot = ctx.getProjectRoot();

	switch (name) {
		case 'bridge_up': {
			if (process.env.OMC_BRIDGE_PANE === '1') {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								error: 'bridge_up is not available inside bridge workers. Complete the task directly.',
							}),
						},
					],
					isError: true,
				};
			}
			const { name: workerName, switch_alias } = args as {
				name: string;
				switch_alias?: string;
			};

			if (!workerName || !workerName.startsWith('cc')) {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								error: "name is required and must start with 'cc'",
							}),
						},
					],
					isError: true,
				};
			}

			try {
				const { addAIToStateSafe } =
					await import('../../workers/bridge/state');

				// Detect terminal backend
				let backend: 'tmux' | 'wezterm' = 'tmux';
				try {
					const { execSync: execSyncCheck } =
						await import('node:child_process');
					execSyncCheck('tmux info', { stdio: 'pipe' });
				} catch {
					backend = 'wezterm';
				}

				// Build the CC launch command with session-scoped env vars
				const projectPath = cachedProjectRoot ?? process.cwd();
				const sessionId = ctx.getSessionId();
				const sessionEnv = sessionId
					? `OMC_SESSION_ID=${sessionId} `
					: '';

				// Auto-derive provider from predefined config (cc:zp → zhipu, cc:ds → deepseek, etc.)
				let providerFlag = '';
				try {
					const { DEFAULT_BRIDGE_AI_CONFIGS } =
						await import('./config');
					const { getBridgeBaseAIName } = await import('./config');
					const cfg =
						DEFAULT_BRIDGE_AI_CONFIGS[workerName] ??
						DEFAULT_BRIDGE_AI_CONFIGS[
							getBridgeBaseAIName(workerName)
						];
					if (cfg?.switchProvider) {
						providerFlag = ` -p ${cfg.switchProvider}`;
					}
				} catch {
					/* non-critical */
				}

				const bridgeEnv = `OMC_BRIDGE_PANE=1 OMC_BRIDGE_WORKER_ID=${workerName} OMC_BUS_PORT=${process.env.OMC_BUS_PORT ?? '18912'} `;
				const launchCmd = `${bridgeEnv}${sessionEnv}oh-my-claude cc${providerFlag} -t none -skip`;

				let paneId: string;
				const { execSync } = await import('node:child_process');

				if (backend === 'tmux') {
					// Try to detect the current pane so we can split inline (right panel)
					let targetPane: string | null = null;
					try {
						const paneResult = execSync(
							"tmux display-message -p '#D'",
							{
								encoding: 'utf-8',
								stdio: ['pipe', 'pipe', 'pipe'],
							},
						).trim();
						if (paneResult.startsWith('%')) targetPane = paneResult;
					} catch {
						/* no current pane — fall back to bridge session */
					}

					if (targetPane) {
						// Split right from the current pane — worker visible in same window
						const raw = execSync(
							`tmux split-window -h -t ${targetPane} -p 50 -P -F '#D' 'cd "${projectPath}" && ${launchCmd}'`,
							{
								encoding: 'utf-8',
								stdio: ['pipe', 'pipe', 'pipe'],
							},
						).trim();
						paneId = raw;
					} else {
						// Fallback: create pane in dedicated bridge session
						const bridgeSession = 'oh-my-claude-bridge';
						try {
							execSync(`tmux has-session -t ${bridgeSession}`, {
								stdio: 'pipe',
							});
						} catch {
							execSync(
								`tmux new-session -d -s ${bridgeSession} -n bridge`,
								{ stdio: 'pipe' },
							);
						}
						const raw = execSync(
							`tmux split-window -t ${bridgeSession} -h -P -F '#D' 'cd "${projectPath}" && ${launchCmd}'`,
							{
								encoding: 'utf-8',
								stdio: ['pipe', 'pipe', 'pipe'],
							},
						).trim();
						paneId = raw;
					}
				} else {
					const raw = execSync(
						`wezterm cli split-pane --right -- bash -c 'cd "${projectPath}" && ${launchCmd}'`,
						{ encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
					).trim();
					paneId = raw;
				}

				// Atomically register in bridge state (check-then-write inside lock)
				const lockResult = await addAIToStateSafe({
					name: workerName,
					cliCommand: launchCmd,
					startedAt: new Date().toISOString(),
					paneId,
					terminalBackend: backend,
					projectPath,
				});

				if (!lockResult.added) {
					// Race detected — another call registered this name first. Kill the spawned pane.
					try {
						if (backend === 'tmux') {
							execSync(`tmux kill-pane -t ${paneId}`, {
								stdio: 'pipe',
							});
						}
					} catch {
						/* best-effort cleanup */
					}
					return {
						content: [
							{
								type: 'text',
								text: JSON.stringify({
									error: lockResult.error,
									hint: 'Concurrent bridge_up detected — duplicate pane killed',
								}),
							},
						],
						isError: true,
					};
				}

				// Handle auto-switch: explicit switch_alias, or auto-derived from predefined config
				let switchResult: string | undefined;
				let effectiveSwitchAlias = switch_alias;

				// Auto-derive switch from predefined config when not explicitly provided
				if (!effectiveSwitchAlias) {
					try {
						const {
							DEFAULT_BRIDGE_AI_CONFIGS,
							getBridgeBaseAIName,
						} = await import('./config');
						const cfg =
							DEFAULT_BRIDGE_AI_CONFIGS[workerName] ??
							DEFAULT_BRIDGE_AI_CONFIGS[
								getBridgeBaseAIName(workerName)
							];
						if (cfg?.switchProvider) {
							effectiveSwitchAlias = cfg.switchProvider;
						}
					} catch {
						/* non-critical */
					}
				}

				if (effectiveSwitchAlias) {
					// Switch alias map (mirrors bridge.ts SWITCH_ALIAS_MAP)
					const SWITCH_ALIAS_MAP: Record<
						string,
						{ provider: string; model: string }
					> = {
						ds: { provider: 'deepseek', model: 'deepseek-chat' },
						deepseek: {
							provider: 'deepseek',
							model: 'deepseek-chat',
						},
						'ds-r': {
							provider: 'deepseek',
							model: 'deepseek-reasoner',
						},
						'deepseek-reasoner': {
							provider: 'deepseek',
							model: 'deepseek-reasoner',
						},
						zp: { provider: 'zhipu', model: 'glm-5' },
						zhipu: { provider: 'zhipu', model: 'glm-5' },
						zai: { provider: 'zai', model: 'glm-5' },
						'zp-g': { provider: 'zai', model: 'glm-5' },
						mm: { provider: 'minimax', model: 'MiniMax-M2.5' },
						minimax: { provider: 'minimax', model: 'MiniMax-M2.5' },
						'mm-cn': {
							provider: 'minimax-cn',
							model: 'MiniMax-M2.5',
						},
						'minimax-cn': {
							provider: 'minimax-cn',
							model: 'MiniMax-M2.5',
						},
						kimi: { provider: 'kimi', model: 'kimi-for-coding' },
						km: { provider: 'kimi', model: 'kimi-for-coding' },
						ay: { provider: 'aliyun', model: 'qwen3.5-plus' },
						ali: { provider: 'aliyun', model: 'qwen3.5-plus' },
						aliyun: { provider: 'aliyun', model: 'qwen3.5-plus' },
					};

					const switchTarget =
						SWITCH_ALIAS_MAP[effectiveSwitchAlias!];

					if (switchTarget) {
						// Wait for proxy to register, then switch
						const { readProxyRegistry, cleanupStaleEntries } =
							await import('../../proxy/registry');
						const maxWaitMs = 15000;
						const startTime = Date.now();
						let controlPort: number | null = null;
						let sessionId: string | null = null;

						while (Date.now() - startTime < maxWaitMs) {
							await new Promise((r) => setTimeout(r, 1000));
							cleanupStaleEntries();
							const entries = readProxyRegistry();
							const recent = entries
								.filter((e) => e.startedAt >= startTime - 5000)
								.sort((a, b) => b.startedAt - a.startedAt);
							if (recent.length > 0 && recent[0]) {
								controlPort = recent[0].controlPort;
								sessionId = recent[0].sessionId;
								break;
							}
						}

						if (controlPort && sessionId) {
							try {
								const resp = await fetch(
									`http://localhost:${controlPort}/switch?session=${sessionId}`,
									{
										method: 'POST',
										headers: {
											'content-type': 'application/json',
										},
										body: JSON.stringify(switchTarget),
										signal: AbortSignal.timeout(5000),
									},
								);
								if (resp.ok) {
									switchResult = `Switched to ${switchTarget.provider}/${switchTarget.model}`;

									// Persist proxy info
									const {
										readBridgeState: reread,
										writeBridgeState,
									} =
										await import('../../workers/bridge/state');
									const updated = reread();
									const aiEntry = updated.ais.find(
										(a) => a.name === workerName,
									);
									if (aiEntry) {
										aiEntry.proxySessionId = sessionId;
										aiEntry.proxyControlPort = controlPort;
										writeBridgeState(updated);
									}
								} else {
									switchResult = `Switch failed: ${resp.statusText}`;
								}
							} catch (e) {
								switchResult = `Switch failed: ${e instanceof Error ? e.message : String(e)}`;
							}
						} else {
							switchResult =
								'Proxy not found after 15s, skipping auto-switch';
						}
					} else {
						switchResult = `Unknown switch alias: ${effectiveSwitchAlias}`;
					}
				}

				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								started: true,
								name: workerName,
								pane_id: paneId,
								backend,
								switch: switchResult ?? 'no switch requested',
							}),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								error: `Failed to start ${workerName}: ${error instanceof Error ? error.message : String(error)}`,
							}),
						},
					],
					isError: true,
				};
			}
		}

		case 'bridge_down': {
			if (process.env.OMC_BRIDGE_PANE === '1') {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								error: 'bridge_down is not available inside bridge workers. Complete the task directly.',
							}),
						},
					],
					isError: true,
				};
			}
			const { name: workerName } = args as { name: string };

			if (!workerName) {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({ error: 'name is required' }),
						},
					],
					isError: true,
				};
			}

			try {
				const { readBridgeState, removeAIFromState } =
					await import('../../workers/bridge/state');
				const state = readBridgeState();
				const entry = state.ais.find((a) => a.name === workerName);

				if (!entry) {
					return {
						content: [
							{
								type: 'text',
								text: JSON.stringify({
									error: `${workerName} is not running`,
									running_ais: state.ais.map((a) => a.name),
								}),
							},
						],
						isError: true,
					};
				}

				// Kill the pane
				if (entry.paneId) {
					try {
						const { execSync } = await import('node:child_process');
						if (entry.terminalBackend === 'tmux') {
							execSync(`tmux kill-pane -t ${entry.paneId}`, {
								stdio: 'pipe',
							});
						} else if (entry.terminalBackend === 'wezterm') {
							execSync(
								`wezterm cli kill-pane --pane-id ${entry.paneId}`,
								{ stdio: 'pipe' },
							);
						}
					} catch {
						// Pane may already be gone
					}
				}

				removeAIFromState(workerName);

				// Also unregister from the in-memory orchestrator so bridge_send can re-spawn
				try {
					const { getBridgeOrchestrator } =
						await import('../../workers/bridge');
					const orch = getBridgeOrchestrator();
					if (orch.listAIs().some((ai) => ai.name === workerName)) {
						await orch.unregisterAI(workerName);
					}
				} catch {
					/* non-critical */
				}

				// Check if any workers remain
				const remaining = readBridgeState();
				const workersRemain = remaining.ais.length > 0;

				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								stopped: true,
								name: workerName,
								workers_remaining: remaining.ais.map(
									(a) => a.name,
								),
								bridge_mode_active: workersRemain,
							}),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								error: `Failed to stop ${workerName}: ${error instanceof Error ? error.message : String(error)}`,
							}),
						},
					],
					isError: true,
				};
			}
		}

		case 'bridge_status': {
			try {
				const { readBridgeState, removeAIFromState } =
					await import('../../workers/bridge/state');
				const { existsSync, readFileSync } = await import('node:fs');
				const { execSync: execSyncStatus } =
					await import('node:child_process');
				const { join } = await import('node:path');
				const { homedir } = await import('node:os');

				const state = readBridgeState();
				const codexStatusPath = join(
					homedir(),
					'.claude',
					'oh-my-claude',
					'run',
					'codex-status.json',
				);

				// Liveness check helper: verify tmux/wezterm pane still exists
				function isPaneAlive(
					paneId: string,
					backend?: string,
				): boolean {
					try {
						if (backend === 'tmux') {
							// list-panes on a specific pane target fails with exit code 1 if pane is dead
							execSyncStatus(`tmux list-panes -t "${paneId}"`, {
								stdio: 'pipe',
								timeout: 3000,
							});
							return true;
						} else if (backend === 'wezterm') {
							const out = execSyncStatus(
								`wezterm cli list --format json`,
								{
									encoding: 'utf-8',
									stdio: ['pipe', 'pipe', 'pipe'],
									timeout: 3000,
								},
							);
							return out.includes(paneId);
						}
					} catch {
						/* pane not found */
					}
					return false;
				}

				// Prune dead workers and collect live ones
				const staleNames: string[] = [];
				const workers = [];

				for (const ai of state.ais) {
					const isProcBased = !ai.paneId;
					let status = 'running';

					// Pane-based liveness check
					if (!isProcBased && ai.paneId) {
						if (!isPaneAlive(ai.paneId, ai.terminalBackend)) {
							staleNames.push(ai.name);
							continue; // skip dead workers
						}
					}

					if (isProcBased && ai.name === 'codex') {
						try {
							if (existsSync(codexStatusPath)) {
								const sig = JSON.parse(
									readFileSync(codexStatusPath, 'utf-8'),
								) as { state?: string; updatedAt?: number };
								if (
									sig.updatedAt &&
									Date.now() - sig.updatedAt < 30_000
								) {
									status = sig.state ?? 'idle';
								} else {
									status = 'idle';
								}
							} else {
								status = 'idle';
							}
						} catch {
							status = 'unknown';
						}
					}

					workers.push({
						name: ai.name,
						type: isProcBased ? 'proc' : 'pane',
						status,
						startedAt: ai.startedAt,
						projectPath: ai.projectPath ?? null,
						terminalBackend: ai.terminalBackend ?? null,
					});
				}

				// Auto-prune stale entries from state file
				for (const name of staleNames) {
					try {
						removeAIFromState(name);
					} catch {
						/* best-effort */
					}
				}

				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								workers,
								count: workers.length,
								...(staleNames.length > 0
									? { pruned: staleNames }
									: {}),
							}),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								error: `bridge_status failed: ${error instanceof Error ? error.message : String(error)}`,
							}),
						},
					],
					isError: true,
				};
			}
		}

		case 'bridge_send': {
			if (process.env.OMC_BRIDGE_PANE === '1') {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								error: 'bridge_send is not available inside bridge workers. Complete the task directly.',
							}),
						},
					],
					isError: true,
				};
			}
			return handleBridgeSend(args, ctx, cachedProjectRoot);
		}

		case 'bridge_dispatch': {
			if (process.env.OMC_BRIDGE_PANE === '1') {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								error: 'bridge_dispatch is not available inside bridge workers. Complete the task directly.',
							}),
						},
					],
					isError: true,
				};
			}
			return handleBridgeDispatch(args, ctx);
		}

		case 'bridge_wait': {
			if (process.env.OMC_BRIDGE_PANE === '1') {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								error: 'bridge_wait is not available inside bridge workers. Complete the task directly.',
							}),
						},
					],
					isError: true,
				};
			}
			return handleBridgeWait(args, ctx);
		}

		case 'bridge_event': {
			return handleBridgeEvent(args, ctx);
		}

		default:
			return undefined;
	}
}
