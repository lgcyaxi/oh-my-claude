/**
 * Usage/quota API for the web dashboard
 *
 * Fetches provider balances and quota usage using the same logic
 * as the statusline usage segment. Results are cached for 60 seconds.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { jsonResponse } from './helpers';

// Lazy-load env vars from ~/.zshrc.api (dashboard may not inherit shell profile)
let envLoaded = false;
function ensureApiEnv(): void {
	if (envLoaded) return;
	envLoaded = true;
	try {
		const envFile = join(homedir(), '.zshrc.api');
		if (!existsSync(envFile)) return;
		const content = readFileSync(envFile, 'utf-8');
		for (const line of content.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;
			const match = trimmed.match(/^export\s+([A-Z_][A-Z0-9_]*)=(.*)$/);
			if (!match) continue;
			const key = match[1]!;
			let value = match[2]!;
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			}
			if (!process.env[key]) {
				process.env[key] = value;
			}
		}
	} catch {
		// silent
	}
}

interface ProviderUsage {
	key: string;
	abbrev: string;
	display: string;
	color: 'good' | 'warning' | 'critical';
	configured: boolean;
}

// In-memory cache with 60s TTL
let cachedResult: { data: ProviderUsage[]; timestamp: number } | null = null;
const CACHE_TTL = 60_000;

async function fetchProviderUsage(): Promise<ProviderUsage[]> {
	ensureApiEnv();

	// Dynamic import to share code with statusline
	const { buildProviderRegistry } = await import(
		'../../statusline/segments/usage/provider-registry'
	);

	const registry = buildProviderRegistry();
	const results: ProviderUsage[] = [];

	// Fetch all providers in parallel with 5s timeout
	const promises = registry.map(async (provider) => {
		const configured = provider.isConfigured();
		if (!configured) {
			return {
				key: provider.key,
				abbrev: provider.abbrev,
				display: '',
				color: 'good' as const,
				configured: false,
			};
		}

		try {
			const entry = await Promise.race([
				provider.fetch(),
				new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
			]);

			return {
				key: provider.key,
				abbrev: provider.abbrev,
				display: entry?.display ?? '',
				color: entry?.color ?? ('good' as const),
				configured: true,
			};
		} catch {
			return {
				key: provider.key,
				abbrev: provider.abbrev,
				display: 'error',
				color: 'critical' as const,
				configured: true,
			};
		}
	});

	const settled = await Promise.allSettled(promises);
	for (const result of settled) {
		if (result.status === 'fulfilled') {
			results.push(result.value);
		}
	}

	return results;
}

export async function handleUsageRequest(
	corsHeaders: Record<string, string>,
): Promise<Response> {
	// Return cached if fresh
	if (cachedResult && Date.now() - cachedResult.timestamp < CACHE_TTL) {
		return jsonResponse(
			{ providers: cachedResult.data, cached: true },
			200,
			corsHeaders,
		);
	}

	const data = await fetchProviderUsage();
	cachedResult = { data, timestamp: Date.now() };

	return jsonResponse(
		{ providers: data, cached: false },
		200,
		corsHeaders,
	);
}
