/**
 * Control API switch endpoints
 *
 * Handles: /switch, /revert, /stop
 */

import { writeSwitchState, resetSwitchState } from '../state/switch';
import { writeSessionState, resetSessionState } from '../state/session';
import { loadConfig, isProviderConfigured } from '../../shared/config';
import type { ProxySwitchState } from '../state/types';
import { jsonResponse } from './helpers';

/** Shutdown function set by server.ts */
let shutdownProxy: (() => void) | null = null;

/** Register shutdown function from server */
export function registerShutdown(fn: () => void) {
	shutdownProxy = fn;
}

export async function handleSwitch(
	req: Request,
	sessionId: string | undefined,
	sessionTag: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	if (req.method !== 'POST') {
		return jsonResponse(
			{ error: 'Method not allowed. Use POST.' },
			405,
			corsHeaders,
		);
	}

	const body = (await req.json()) as {
		provider?: string;
		model?: string;
	};

	if (!body.provider || !body.model) {
		return jsonResponse(
			{ error: 'provider and model are required' },
			400,
			corsHeaders,
		);
	}

	const config = loadConfig();
	const providerConfig = config.providers[body.provider];

	if (!providerConfig) {
		return jsonResponse(
			{
				error: `Unknown provider: "${body.provider}"`,
				available: Object.keys(config.providers),
			},
			400,
			corsHeaders,
		);
	}

	if (providerConfig.type === 'claude-subscription') {
		return jsonResponse(
			{
				error: `Cannot switch to "${body.provider}" — it uses Claude subscription.`,
			},
			400,
			corsHeaders,
		);
	}

	const providerConfigured = isProviderConfigured(config, body.provider);

	const state: ProxySwitchState = {
		switched: true,
		provider: body.provider,
		model: body.model,
		switchedAt: Date.now(),
	};

	if (sessionId) {
		writeSessionState(sessionId, state);
	} else {
		writeSwitchState(state);
	}

	const warning = !providerConfigured
		? `Warning: ${body.provider} API key not set. Requests will fallback to native Claude.`
		: undefined;

	console.error(
		`[control]${sessionTag} Switched to ${body.provider}/${body.model}` +
			(warning ? ` [${warning}]` : ''),
	);

	return jsonResponse(
		{ ...state, sessionId: sessionId ?? null, ...(warning && { warning }) },
		200,
		corsHeaders,
	);
}

export async function handleRevert(
	req: Request,
	sessionId: string | undefined,
	sessionTag: string,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	if (req.method !== 'POST') {
		return jsonResponse(
			{ error: 'Method not allowed. Use POST.' },
			405,
			corsHeaders,
		);
	}

	if (sessionId) {
		resetSessionState(sessionId);
	} else {
		resetSwitchState();
	}

	console.error(`[control]${sessionTag} Reverted to passthrough`);

	return jsonResponse(
		{
			switched: false,
			sessionId: sessionId ?? null,
			message: 'Reverted to passthrough',
		},
		200,
		corsHeaders,
	);
}

export async function handleStop(
	req: Request,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	if (req.method !== 'POST') {
		return jsonResponse(
			{ error: 'Method not allowed. Use POST.' },
			405,
			corsHeaders,
		);
	}

	console.error('[control] Stopping proxy server...');

	const response = jsonResponse(
		{ message: 'Proxy server stopping' },
		200,
		corsHeaders,
	);

	setTimeout(() => {
		if (shutdownProxy) {
			shutdownProxy();
		} else {
			console.error('[control] Warning: No shutdown handler registered');
			process.exit(0);
		}
	}, 100);

	return response;
}
