/**
 * Control API health/status endpoints
 *
 * Handles: /health, /status, /sessions, /usage
 */

import { readSwitchState } from '../state/switch';
import {
	readSessionState,
	getActiveSessionCount,
	getActiveSessions,
} from '../state/session';
import { getProxyStats, getProviderRequestCounts } from '../handlers/stats';
import type { ProxySwitchState } from '../state/types';
import { jsonResponse, formatUptime } from './helpers';

export async function handleHealth(
	corsHeaders: Record<string, string>,
): Promise<Response> {
	const stats = getProxyStats();
	return jsonResponse(
		{
			status: 'ok',
			uptime: stats.uptime,
			uptimeHuman: formatUptime(stats.uptime),
			requestCount: stats.requestCount,
			activeSessions: getActiveSessionCount(),
		},
		200,
		corsHeaders,
	);
}

export async function handleStatus(
	sessionId: string | undefined,
	corsHeaders: Record<string, string>,
): Promise<Response> {
	let state: ProxySwitchState;
	if (sessionId) {
		state = readSessionState(sessionId);
	} else {
		const { getDefaultSwitchState } = await import('../state/session');
		const defaultState = getDefaultSwitchState();
		state = defaultState ?? readSwitchState();
	}
	return jsonResponse(
		{ ...state, sessionId: sessionId ?? null },
		200,
		corsHeaders,
	);
}

export function handleSessions(corsHeaders: Record<string, string>): Response {
	const activeSessions = getActiveSessions();
	return jsonResponse(
		{ sessions: activeSessions, count: activeSessions.length },
		200,
		corsHeaders,
	);
}

export function handleUsage(corsHeaders: Record<string, string>): Response {
	const providerCounts = getProviderRequestCounts();
	return jsonResponse({ providers: providerCounts }, 200, corsHeaders);
}
