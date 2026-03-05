/**
 * Orchestrator — generic fetch-all-providers loop.
 *
 * Replaces the 230-line body of collectUsageData() with a registry-driven
 * pipeline: check cache → fetch misses in parallel → merge results.
 *
 * Used by both:
 * - statusline (inline, with 2s timeout)
 * - proxy daemon (background, with 5s timeout)
 */

import type { ProviderDefinition } from "./provider-registry";
import type { UsageCache, PartResult } from "./types";
import { isCacheValid } from "./cache";

/** Timeout wrapper using AbortSignal */
async function withTimeout<T>(
  fn: () => Promise<T>,
  ms: number
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
 * 4. For local-only providers, query proxy /usage endpoint
 * 5. Merge results in registration order
 */
export async function fetchAllProviders(
  registry: ProviderDefinition[],
  cache: UsageCache,
  timeoutMs: number
): Promise<FetchAllResult> {
  const configured = registry.filter((def) => def.isConfigured());
  const parts: (PartResult | null)[] = new Array(configured.length).fill(null);
  const updatedCache = { ...cache };
  let cacheModified = false;

  // Separate into cache hits and misses
  const fetchJobs: { index: number; def: ProviderDefinition }[] = [];
  const localJobs: { index: number; def: ProviderDefinition }[] = [];

  for (let i = 0; i < configured.length; i++) {
    const def = configured[i]!;

    if (def.localOnly) {
      localJobs.push({ index: i, def });
      continue;
    }

    // Check cache for remote providers
    const cached = cache[def.key];
    if (isCacheValid(cached)) {
      parts[i] = { abbrev: def.abbrev, display: cached.display, color: cached.color };
    } else {
      fetchJobs.push({ index: i, def });
    }
  }

  // Fetch all cache misses in parallel
  if (fetchJobs.length > 0) {
    const results = await Promise.allSettled(
      fetchJobs.map(({ def }) => withTimeout(() => def.fetch(), timeoutMs))
    );

    for (let j = 0; j < fetchJobs.length; j++) {
      const { index, def } = fetchJobs[j]!;
      const outcome = results[j]!;

      if (outcome.status === "fulfilled" && outcome.value) {
        const result = outcome.value;
        updatedCache[def.key] = result;
        cacheModified = true;
        parts[index] = { abbrev: def.abbrev, display: result.display, color: result.color };
      } else {
        // API failed — try local usage as fallback
        const { fetchLocalUsage } = await import("./provider-registry");
        const localUsage = await fetchLocalUsage();
        if (localUsage && localUsage[def.key] !== undefined) {
          parts[index] = { abbrev: def.abbrev, display: `${localUsage[def.key]}req`, color: "neutral" };
        }
      }
    }
  }

  // Handle local-only providers (proxy request counts)
  if (localJobs.length > 0) {
    const { fetchLocalUsage } = await import("./provider-registry");
    const localUsage = await fetchLocalUsage();

    for (const { index, def } of localJobs) {
      const count = localUsage?.[def.key] ?? 0;
      parts[index] = { abbrev: def.abbrev, display: `${count}req`, color: "neutral" };
    }
  }

  // Filter nulls (providers that failed with no fallback)
  const validParts = parts.filter((p): p is PartResult => p !== null);

  return { parts: validParts, cacheModified, updatedCache };
}
