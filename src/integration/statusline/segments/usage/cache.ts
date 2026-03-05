import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { UsageCache, ProviderCacheEntry } from "./types";

/** Cache file location */
const CACHE_DIR = join(homedir(), ".config", "oh-my-claude");
const CACHE_PATH = join(CACHE_DIR, "usage-cache.json");

/** Cache TTL in milliseconds (60 seconds) */
const CACHE_TTL_MS = 60_000;

interface UsageCacheFile {
  version?: string;
  data?: UsageCache;
}

function resolveCurrentVersion(runtimeVersion?: string): string | null {
  if (runtimeVersion) return runtimeVersion;
  const envVersion = process.env.OH_MY_CLAUDE_VERSION || process.env.OMC_VERSION || process.env.npm_package_version;
  if (envVersion) return envVersion;

  // Primary source: installed package in ~/.claude/oh-my-claude
  try {
    const installedPkgPath = join(homedir(), ".claude", "oh-my-claude", "package.json");
    if (existsSync(installedPkgPath)) {
      const installedPkg = JSON.parse(readFileSync(installedPkgPath, "utf-8")) as { version?: string };
      if (installedPkg.version) return installedPkg.version;
    }
  } catch {}

  // Local checkout fallback (for development runs)
  try {
    const localPkgPath = join(process.cwd(), "package.json");
    if (existsSync(localPkgPath)) {
      const localPkg = JSON.parse(readFileSync(localPkgPath, "utf-8")) as { version?: string };
      if (localPkg.version) return localPkg.version;
    }
  } catch {}

  return null;
}

export function readCache(runtimeVersion?: string): UsageCache {
  try {
    if (!existsSync(CACHE_PATH)) return {};
    const content = readFileSync(CACHE_PATH, "utf-8");
    const parsed = JSON.parse(content) as UsageCacheFile | UsageCache;
    const currentVersion = resolveCurrentVersion(runtimeVersion);

    const isNewFormat = typeof parsed === "object" && parsed !== null && "data" in parsed;
    const cachedVersion = isNewFormat ? (parsed as UsageCacheFile).version : undefined;
    const cacheData = isNewFormat ? ((parsed as UsageCacheFile).data ?? {}) : (parsed as UsageCache);

    if (currentVersion && cachedVersion !== currentVersion) {
      // Version changed (or old unversioned cache): invalidate all cached provider values.
      writeCache({}, currentVersion);
      return {};
    }

    return cacheData;
  } catch {
    return {};
  }
}

export function writeCache(cache: UsageCache, runtimeVersion?: string): void {
  try {
    if (!existsSync(CACHE_DIR)) {
      mkdirSync(CACHE_DIR, { recursive: true });
    }
    const version = resolveCurrentVersion(runtimeVersion) ?? undefined;
    const payload: UsageCacheFile = { version, data: cache };
    writeFileSync(CACHE_PATH, JSON.stringify(payload), "utf-8");
  } catch {
    // Silently fail
  }
}

export function isCacheValid(entry: ProviderCacheEntry | undefined): entry is ProviderCacheEntry {
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_TTL_MS;
}
