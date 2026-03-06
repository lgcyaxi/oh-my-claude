/**
 * Orchestrator — generic fetch-all-providers loop.
 *
 * Registry-driven pipeline: check cache → fetch misses in parallel → merge results.
 * The statusline is the sole owner of the usage cache; the proxy daemon does NOT
 * write to it.
 */

import type { ProviderDefinition } from './provider-registry';
import type { UsageCache, PartResult } from './types';
import { isCacheValid } from './cache';

/** Timeout wrapper using AbortSignal */
async function withTimeout<T>(
	fn: () => Promise<T>,
	ms: number,
): Promise<T | null> {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), ms);
		const result = await fn();
		clearTimeout(timer);
		return result;
	} catch {
		return null;
	}
}

export interface FetchAllResult {
	parts: PartResult[];
	cacheModified: boolean;
	updatedCache: UsageCache;
}

/**
 * Fetch data from all configured providers, using cache where valid.
 *
 * Pipeline:
 * 1. Filter to configured providers
 * 2. Separate into cache-hit vs cache-miss
 * 3. Fetch all misses in parallel with timeout
 * 4. Merge results in registration order
 */
export async function fetchAllProviders(
	registry: ProviderDefinition[],
	cache: UsageCache,
	timeoutMs: number,
): Promise<FetchAllResult> {
	const configured = registry.filter((def) => def.isConfigured());
	const parts: (PartResult | null)[] = new Array(configured.length).fill(
		null,
	);
	const updatedCache = { ...cache };
	let cacheModified = false;

	const fetchJobs: { index: number; def: ProviderDefinition }[] = [];

	for (let i = 0; i < configured.length; i++) {
		const def = configured[i]!;
		const cached = cache[def.key];
		if (isCacheValid(cached)) {
			parts[i] = {
				abbrev: def.abbrev,
				display: cached.display,
				color: cached.color,
			};
		} else {
			fetchJobs.push({ index: i, def });
		}
	}

	if (fetchJobs.length > 0) {
		const results = await Promise.allSettled(
			fetchJobs.map(({ def }) =>
				withTimeout(() => def.fetch(), timeoutMs),
			),
		);

		for (let j = 0; j < fetchJobs.length; j++) {
			const { index, def } = fetchJobs[j]!;
			const outcome = results[j]!;

			if (outcome.status === 'fulfilled' && outcome.value) {
				const result = outcome.value;
				updatedCache[def.key] = result;
				cacheModified = true;
				parts[index] = {
					abbrev: def.abbrev,
					display: result.display,
					color: result.color,
				};
			}
			// API failed → provider is simply omitted (no proxy fallback)
		}
	}

	const validParts = parts.filter((p): p is PartResult => p !== null);

	return { parts: validParts, cacheModified, updatedCache };
}
