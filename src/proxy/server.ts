#!/usr/bin/env bun
/**
 * oh-my-claude Proxy Server
 *
 * Intercepts Claude Code's API calls and routes them to either
 * Anthropic (passthrough) or external providers (switched).
 *
 * Two servers:
 * - Proxy (default: 18910) — Claude Code connects here via ANTHROPIC_BASE_URL
 * - Control (default: 18911) — health/status/switch/revert endpoints
 *
 * Session isolation:
 * - URLs like /s/{sessionId}/v1/messages use per-session in-memory state
 * - URLs like /v1/messages use global file-based state (backward compat)
 *
 * Usage:
 *   bun run src/proxy/server.ts
 *   bun run src/proxy/server.ts --port 18910 --control-port 18911
 *   bun run src/proxy/server.ts --port 59069 --control-port 59070 --provider minimax-cn --model MiniMax-M2.7
 */

import {
	handleMessages,
	handleOtherRequest,
	handleModelsRequest,
} from './handlers';
import { handleControl } from './control';
import { registerShutdown } from './control/switch';
import {
	readSwitchState,
	resetSwitchState,
	writeSwitchState,
} from './state/switch';
import {
	parseSessionFromPath,
	cleanupStaleSessions,
	getCleanupIntervalMs,
	setDefaultSwitchState,
	getDefaultSwitchState,
} from './state/session';
import { initializeAuth } from './auth/auth';
import { DEFAULT_PROXY_CONFIG } from './state/types';
import { resolveProviderName } from '../shared/providers/aliases';
import {
	registerInstance,
	deregisterInstance,
	startHeartbeat,
} from './state/instance-registry';

interface ParsedArgs {
	port: number;
	controlPort: number;
	provider?: string;
	model?: string;
}

function parseArgs(): ParsedArgs {
	const args = process.argv.slice(2);
	let port = DEFAULT_PROXY_CONFIG.port;
	let controlPort = DEFAULT_PROXY_CONFIG.controlPort;
	let provider: string | undefined;
	let model: string | undefined;

	for (let i = 0; i < args.length; i++) {
		const next = args[i + 1];
		if (args[i] === '--port' && next) {
			port = parseInt(next, 10);
			i++;
		} else if (args[i] === '--control-port' && next) {
			controlPort = parseInt(next, 10);
			i++;
		} else if (args[i] === '--provider' && next) {
			provider = next;
			i++;
		} else if (args[i] === '--model' && next) {
			model = next;
			i++;
		}
	}

	return { port, controlPort, provider, model };
}

/**
 * Start the proxy and control servers
 */
async function main() {
	const { port, controlPort, provider: rawProvider, model } = parseArgs();

	// Ensure auth config exists (auto-detects api-key vs oauth mode)
	const authConfig = initializeAuth();
	const authModeLabel =
		authConfig.authMode === 'oauth' ? 'oauth (subscription)' : 'api-key';

	// Initialize switch state from CLI args (--provider/--model) or env vars (legacy)
	const switchProviderRaw =
		rawProvider || process.env.OMC_PROXY_SWITCH_PROVIDER;
	const switchModel = model || process.env.OMC_PROXY_SWITCH_MODEL;

	if (switchProviderRaw && switchModel) {
		const switchProvider = resolveProviderName(switchProviderRaw);
		const switchState = {
			switched: true as const,
			provider: switchProvider,
			model: switchModel,
			switchedAt: Date.now(),
		};
		setDefaultSwitchState(switchState);
		writeSwitchState(switchState);
	} else {
		resetSwitchState();
	}

	// Start proxy server
	const proxy = Bun.serve({
		port,
		// SSE streaming responses from Claude API can take 30-120+ seconds.
		// Bun's default idleTimeout is 10s which causes premature disconnects.
		idleTimeout: 255, // max allowed by Bun (seconds)
		fetch(req: Request): Promise<Response> | Response {
			const url = new URL(req.url);
			let pathname = url.pathname;
			let sessionId: string | undefined;

			// Check for session prefix: /s/{sessionId}/...
			const sessionInfo = parseSessionFromPath(pathname);
			if (sessionInfo) {
				sessionId = sessionInfo.sessionId;
				pathname = sessionInfo.strippedPath;
			}

			// Route /v1/messages to the switching handler
			if (pathname === '/v1/messages') {
				return handleMessages(req, sessionId);
			}

			// Intercept GET /v1/models — return provider-specific model list when switched
			if (pathname === '/v1/models' && req.method === 'GET') {
				return handleModelsRequest(req, sessionId);
			}

			// All other paths — passthrough to Anthropic
			return handleOtherRequest(req, sessionId);
		},
		error(error: Error): Response {
			console.error(`[proxy] Server error: ${error.message}`);
			return new Response(
				JSON.stringify({
					error: { type: 'proxy_error', message: error.message },
				}),
				{
					status: 500,
					headers: { 'content-type': 'application/json' },
				},
			);
		},
	});

	// Start control server
	const control = Bun.serve({
		port: controlPort,
		fetch: handleControl,
		error(error: Error): Response {
			console.error(`[control] Server error: ${error.message}`);
			return new Response(JSON.stringify({ error: error.message }), {
				status: 500,
				headers: { 'content-type': 'application/json' },
			});
		},
	});

	console.error('oh-my-claude Proxy Server');
	console.error(`  Proxy:   http://localhost:${proxy.port}`);
	console.error(`  Control: http://localhost:${control.port}`);
	console.error('');
	console.error('Set in your shell:');
	console.error(`  export ANTHROPIC_BASE_URL=http://localhost:${proxy.port}`);
	console.error('');

	const state = getDefaultSwitchState() ?? readSwitchState();
	console.error(`  Auth:  ${authModeLabel}`);
	console.error(
		`  Mode: ${state.switched ? `switched → ${state.provider}/${state.model}` : 'passthrough → Anthropic'}`,
	);
	console.error('  Session isolation: enabled (path-based /s/{id}/...)');
	if (process.env.OMC_PROXY_DEBUG === '1') {
		console.error('  Debug: ON (verbose logging for all endpoints)');
	}

	// Register this instance in the shared registry for dashboard discovery
	// Skip registration for the standalone dashboard proxy (default ports) —
	// it's the viewer, not a participant. Only per-session proxies register.
	const isDefaultPorts =
		port === DEFAULT_PROXY_CONFIG.port &&
		controlPort === DEFAULT_PROXY_CONFIG.controlPort;
	const instanceId = `${controlPort}`;
	let stopHeartbeat: (() => void) | undefined;
	if (!isDefaultPorts) {
		registerInstance({
			sessionId: instanceId,
			port,
			controlPort,
			pid: process.pid,
			startedAt: new Date().toISOString(),
			cwd: process.cwd(),
			provider: state.switched ? state.provider : undefined,
			model: state.switched ? state.model : undefined,
		});
		stopHeartbeat = startHeartbeat(instanceId);
	}

	// Periodic cleanup of stale sessions
	const cleanupTimer = setInterval(
		cleanupStaleSessions,
		getCleanupIntervalMs(),
	);

	// Handle graceful shutdown
	const shutdown = () => {
		console.error('\n[proxy] Shutting down...');
		if (stopHeartbeat) stopHeartbeat();
		if (!isDefaultPorts) deregisterInstance(instanceId);
		clearInterval(cleanupTimer);
		resetSwitchState();
		proxy.stop();
		control.stop();
		process.exit(0);
	};

	// Register shutdown for /stop endpoint
	registerShutdown(shutdown);

	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);
}

main().catch((error) => {
	console.error('Failed to start proxy server:', error);
	process.exit(1);
});
