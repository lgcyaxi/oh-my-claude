/**
 * Proxy segment - shows proxy switch status
 *
 * Hidden when not switched (no visual noise).
 * When switched: [→DeepSeek/DeepSeek R] (arrow prefix = redirected, full provider/model)
 * Color: yellow when switched (attention-grabbing)
 *
 * Session-aware: extracts session ID from ANTHROPIC_BASE_URL and queries
 * the control API for session-scoped status (accurate per-session state).
 * Falls back to global file state if control API is unreachable.
 */

import type {
	Segment,
	SegmentData,
	SegmentContext,
	SegmentConfig,
	StyleConfig,
} from './types';
import { wrapBrackets, applyColor } from './index';
import { readSwitchState } from '../../proxy/state/switch';
import type { ProxySwitchState } from '../../proxy/state/types';
import { DEFAULT_PROXY_CONFIG } from '../../proxy/state/types';

/**
 * Get the control port from environment variable OMC_PROXY_CONTROL_PORT,
 * or fall back to the default port.
 */
function getControlPort(): number {
	const envPort = process.env.OMC_PROXY_CONTROL_PORT;
	if (envPort) {
		const parsed = parseInt(envPort, 10);
		if (!isNaN(parsed)) return parsed;
	}
	return DEFAULT_PROXY_CONFIG.controlPort;
}

/** Full provider display names */
const PROVIDER_DISPLAY: Record<string, string> = {
	deepseek: 'DeepSeek',
	zhipu: 'ZhiPu',
	zai: 'Z.AI',
	minimax: 'MiniMax',
	'minimax-cn': 'MiniMax CN',
	kimi: 'Kimi',
	openai: 'OpenAI',
	aliyun: 'Aliyun',
};

/** Full model display names */
function getModelDisplay(model: string): string {
	const displayMap: Record<string, string> = {
		// DeepSeek
		'deepseek-reasoner': 'DeepSeek R',
		'deepseek-chat': 'DeepSeek Chat',
		// ZhiPu / Z.AI
		'glm-5.1': 'GLM-5.1',
		'glm-5': 'GLM-5',
		'GLM-5': 'GLM-5',
		'glm-4.7': 'GLM-4.7',
		// MiniMax
		'MiniMax-M2.7': 'MiniMax-M2.7',
		'minimax-m2.7': 'MiniMax-M2.7',
		'MiniMax-M2.5': 'MiniMax-M2.5',
		'minimax-m2.5': 'MiniMax-M2.5',
		// Kimi
		'kimi-for-coding': 'Kimi K2.5',
		'kimi-k2.5': 'Kimi K2.5',
		kimi2p5: 'Kimi K2.5',
		'k2.5': 'Kimi K2.5',
		'K2.5': 'Kimi K2.5',
		// Aliyun / Qwen
		'qwen3.6-plus': 'Qwen 3.6+',
		'qwen3.5-plus': 'Qwen 3.5+',
		'qwen3.5': 'Qwen 3.5+',
		'qwen3-max-2026-01-23': 'Qwen 3 Max',
		'qwen3-coder-next': 'Qwen Coder Next',
		'qwen3-coder-plus': 'Qwen Coder+',
		// OpenAI / Codex
		'gpt-5.2': 'GPT-5.2',
		'gpt-5.3-codex': 'GPT-5.3 Codex',
		'o3-mini': 'o3-mini',
	};

	return displayMap[model] ?? model;
}

/**
 * Extract session ID from ANTHROPIC_BASE_URL.
 * Matches paths like /s/{sessionId} at the end of the URL.
 */
function extractSessionId(): string | undefined {
	const baseUrl = process.env.ANTHROPIC_BASE_URL;
	if (!baseUrl) return undefined;

	try {
		const url = new URL(baseUrl);
		const match = url.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)\/?$/);
		return match ? match[1] : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Try to get switch state from the control API (session-scoped).
 * Returns null if the control API is unreachable.
 */
async function fetchStatusFromControlApi(
	sessionId?: string,
): Promise<ProxySwitchState | null> {
	try {
		const controlPort = getControlPort();
		const url = sessionId
			? `http://localhost:${controlPort}/status?session=${sessionId}`
			: `http://localhost:${controlPort}/status`;

		const resp = await fetch(url, { signal: AbortSignal.timeout(500) });
		if (!resp.ok) return null;
		return (await resp.json()) as ProxySwitchState;
	} catch {
		return null;
	}
}

/**
 * Check if this is an auto-spawned memory-only proxy (no session URL).
 */
function isAutoSpawnedProxy(): boolean {
	try {
		const { existsSync, readFileSync, readdirSync } =
			require('node:fs') as typeof import('node:fs');
		const { join } = require('node:path') as typeof import('node:path');
		const { homedir } = require('node:os') as typeof import('node:os');

		const sessionsDir = join(
			homedir(),
			'.claude',
			'oh-my-claude',
			'sessions',
		);
		if (!existsSync(sessionsDir)) return false;

		for (const entry of readdirSync(sessionsDir)) {
			const autoProxyFile = join(sessionsDir, entry, 'auto-proxy.json');
			if (existsSync(autoProxyFile)) {
				const data = JSON.parse(readFileSync(autoProxyFile, 'utf-8'));
				if (data.autoSpawned && data.pid) {
					try {
						process.kill(data.pid, 0);
						return true;
					} catch {
						// Process not running
					}
				}
			}
		}
		return false;
	} catch {
		return false;
	}
}

/**
 * Collect proxy switch data
 */
async function collectProxyData(
	_context: SegmentContext,
): Promise<SegmentData | null> {
	try {
		const sessionId = extractSessionId();
		const hasProxySession = !!(sessionId || process.env.OMC_PROXY_CONTROL_PORT);

		// Prefer control API for session-accurate status
		let state: ProxySwitchState | null = null;
		if (sessionId) {
			state = await fetchStatusFromControlApi(sessionId);
		}

		// Only fall back to file state when a proxy is active.
		// Without an active proxy, the file is stale from a previous session.
		if (!state && hasProxySession) {
			state = readSwitchState();
		}

		const isSwitched = state?.switched ?? false;

		// Check for auto-spawned memory-only proxy
		if (!isSwitched && !sessionId) {
			if (isAutoSpawnedProxy()) {
				return {
					primary: 'proxy:mem',
					metadata: { mode: 'memory-only' },
					color: 'neutral',
				};
			}
			return null;
		}

		if (sessionId) {
			if (isSwitched && state?.provider) {
				const providerLabel =
					PROVIDER_DISPLAY[state.provider] ?? state.provider;

				return {
					primary: `s:${sessionId.slice(0, 8)} →${providerLabel}`,
					metadata: {},
					color: 'warning',
				};
			}

			return {
				primary: `s:${sessionId.slice(0, 8)} ⇄ proxy`,
				metadata: { wrapped: 'true' },
				color: 'good',
			};
		}

		return null;
	} catch {
		return null;
	}
}

/**
 * Format proxy segment for display
 */
function formatProxySegment(
	data: SegmentData,
	_config: SegmentConfig,
	style: StyleConfig,
): string {
	const colored = applyColor(data.primary, data.color, style);
	return wrapBrackets(colored, style);
}

export const proxySegment: Segment = {
	id: 'proxy',
	collect: collectProxyData,
	format: formatProxySegment,
};
