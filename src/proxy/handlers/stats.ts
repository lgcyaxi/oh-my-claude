/**
 * Proxy statistics, counters, and shared constants for handler modules
 */

/** Startup timestamp for uptime tracking */
const startedAt = Date.now();

/** Request counter for logging */
let requestCount = 0;

/** Per-provider request counter for usage tracking */
const providerRequestCounts = new Map<string, number>();

/** Provider types that use the OpenAI Responses API (not Chat Completions) */
export const RESPONSES_API_PROVIDERS = new Set(['openai-oauth']);

/** Paths that are logged only in debug mode (too noisy for regular use) */
export const QUIET_PATHS = ['/v1/messages/count_tokens'];

/** Whether debug logging is enabled (set OMC_PROXY_DEBUG=1) */
export const isDebug = process.env.OMC_PROXY_DEBUG === '1';

/** Increment request counter and return the new ID */
export function nextRequestId(): number {
	return ++requestCount;
}

/** Track a provider request in the global counter */
export function trackProviderRequest(provider: string): void {
	providerRequestCounts.set(
		provider,
		(providerRequestCounts.get(provider) ?? 0) + 1,
	);
}

/** Get proxy uptime and request count for status reporting */
export function getProxyStats(): { uptime: number; requestCount: number } {
	return {
		uptime: Date.now() - startedAt,
		requestCount,
	};
}

/** Get per-provider request counts for usage tracking */
export function getProviderRequestCounts(): Record<string, number> {
	return Object.fromEntries(providerRequestCounts);
}

/**
 * Cache OAuth usage response for statusline consumption.
 * Writes to ~/.claude/oh-my-claude/cache/api_usage.json.
 */
export async function cacheUsageResponse(
	response: globalThis.Response,
): Promise<void> {
	try {
		const data = (await response.json()) as {
			five_hour?: { utilization: number; resets_at?: string };
			seven_day?: { utilization: number; resets_at?: string };
		};
		if (!data.five_hour) return;
		const { mkdirSync, writeFileSync } = await import('node:fs');
		const { join } = await import('node:path');
		const { homedir } = await import('node:os');
		const cacheDir = join(homedir(), '.claude', 'oh-my-claude', 'cache');
		mkdirSync(cacheDir, { recursive: true });
		writeFileSync(
			join(cacheDir, 'api_usage.json'),
			JSON.stringify({
				timestamp: Date.now(),
				five_hour: data.five_hour,
				seven_day: data.seven_day,
			}),
			'utf-8',
		);
	} catch {
		// Non-critical — ignore cache write failures
	}
}
