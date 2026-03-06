/**
 * Shared types for the usage segment
 */

/** Fetch timeout for API calls (2 seconds) */
export const FETCH_TIMEOUT_MS = 2000;

/** Provider abbreviations */
export const PROVIDER_ABBREV: Record<string, string> = {
  deepseek: "DS",
  zhipu: "ZP",
  minimax: "MM",
  kimi: "KM",
  openai: "Codex",
  aliyun: "AY",
};

/** Per-provider cached data */
export interface ProviderCacheEntry {
  timestamp: number;
  display: string;
  color: "good" | "warning" | "critical";
}

/** Full cache structure */
export interface UsageCache {
  [provider: string]: ProviderCacheEntry;
}

/** Result from a single provider in the collect pipeline */
export interface PartResult {
  abbrev: string;
  display: string;
  color: "good" | "warning" | "critical" | "neutral";
}
