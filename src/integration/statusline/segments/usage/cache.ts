import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { UsageCache, ProviderCacheEntry } from "./types";

/** Cache file location */
const CACHE_DIR = join(homedir(), ".config", "oh-my-claude");
const CACHE_PATH = join(CACHE_DIR, "usage-cache.json");

/** Cache TTL in milliseconds (60 seconds) */
const CACHE_TTL_MS = 60_000;

/**
 * Build-time hash injected by `bun build --define`.
 * Any rebuild produces a new value, invalidating stale cache.
 * Falls back to "dev" when running from source (not bundled).
 */
declare const __OMC_BUILD_HASH__: string | undefined;
const BUILD_HASH: string = typeof __OMC_BUILD_HASH__ !== "undefined" ? __OMC_BUILD_HASH__ : "dev";

interface UsageCacheFile {
  version?: string;
  data?: UsageCache;
}

export function readCache(): UsageCache {
  try {
    if (!existsSync(CACHE_PATH)) return {};
    const content = readFileSync(CACHE_PATH, "utf-8");
    const parsed = JSON.parse(content) as UsageCacheFile | UsageCache;

    const isNewFormat = typeof parsed === "object" && parsed !== null && "data" in parsed;
    const cachedVersion = isNewFormat ? (parsed as UsageCacheFile).version : undefined;
    const cacheData = isNewFormat ? ((parsed as UsageCacheFile).data ?? {}) : (parsed as UsageCache);

    if (cachedVersion !== BUILD_HASH) {
      writeCache({});
      return {};
    }

    return cacheData;
  } catch {
    return {};
  }
}

export function writeCache(cache: UsageCache): void {
  try {
    if (!existsSync(CACHE_DIR)) {
      mkdirSync(CACHE_DIR, { recursive: true });
    }
    const payload: UsageCacheFile = { version: BUILD_HASH, data: cache };
    writeFileSync(CACHE_PATH, JSON.stringify(payload), "utf-8");
  } catch {
    // Silently fail
  }
}

export function isCacheValid(entry: ProviderCacheEntry | undefined): entry is ProviderCacheEntry {
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_TTL_MS;
}
