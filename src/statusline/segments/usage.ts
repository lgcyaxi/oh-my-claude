/**
 * Usage segment - shows provider balance/quota on a second statusline row
 *
 * Displays:
 * - DeepSeek: CNY balance from /user/balance API
 * - ZhiPu: token usage % and remaining calls from quota API
 * - MiniMax: quota percentage from API (when MINIMAX_GROUPID is set) or local request count
 * - Kimi: local request count from proxy /usage endpoint
 *
 * Cache: ~/.config/oh-my-claude/usage-cache.json with 60s TTL per provider.
 * Only queries providers that have API keys configured.
 *
 * Color coding:
 * - Green: healthy (balance > threshold or usage < 50%)
 * - Yellow: warning (balance low or usage 50-80%)
 * - Red: critical (balance near-zero or usage > 80%)
 *
 * Output includes metadata.newLine = "true" to signal second-row rendering.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Segment, SegmentData, SegmentContext, SegmentConfig, StyleConfig } from "./types";
import { SEMANTIC_COLORS } from "./index";
import { DEFAULT_PROXY_CONFIG } from "../../proxy/types";

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

/** Cache file location */
const CACHE_DIR = join(homedir(), ".config", "oh-my-claude");
const CACHE_PATH = join(CACHE_DIR, "usage-cache.json");

/** Cache TTL in milliseconds (60 seconds) */
const CACHE_TTL_MS = 60_000;

/** Fetch timeout for API calls (2 seconds) */
const FETCH_TIMEOUT_MS = 2000;

/** Provider abbreviations */
const PROVIDER_ABBREV: Record<string, string> = {
  deepseek: "DS",
  zhipu: "ZP",
  minimax: "MM",
  kimi: "KM",
  openai: "AI",
};

/** Per-provider cached data */
interface ProviderCacheEntry {
  timestamp: number;
  display: string;
  color: "good" | "warning" | "critical";
}

/** Full cache structure */
interface UsageCache {
  [provider: string]: ProviderCacheEntry;
}

// ─── DeepSeek Balance API ────────────────────────────────────────────────────

interface DeepSeekBalanceInfo {
  currency: string;
  total_balance: string;
  granted_balance: string;
  topped_up_balance: string;
}

interface DeepSeekBalanceResponse {
  is_available: boolean;
  balance_infos: DeepSeekBalanceInfo[];
}

async function fetchDeepSeekBalance(apiKey: string): Promise<ProviderCacheEntry | null> {
  try {
    const resp = await fetch("https://api.deepseek.com/user/balance", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) return null;

    const data = (await resp.json()) as DeepSeekBalanceResponse;
    if (!data.balance_infos?.length) return null;

    // Prefer CNY, fallback to first available
    const cny = data.balance_infos.find((b) => b.currency === "CNY");
    const info = cny ?? data.balance_infos[0]!;
    const balance = parseFloat(info.total_balance);
    const symbol = info.currency === "CNY" ? "\u00a5" : "$";

    // Format: compact number
    let displayBalance: string;
    if (balance >= 1000) {
      displayBalance = `${symbol}${Math.round(balance)}`;
    } else if (balance >= 100) {
      displayBalance = `${symbol}${Math.round(balance)}`;
    } else {
      displayBalance = `${symbol}${balance.toFixed(1)}`;
    }

    // Color thresholds (CNY)
    let color: "good" | "warning" | "critical";
    if (balance > 100) {
      color = "good";
    } else if (balance > 10) {
      color = "warning";
    } else {
      color = "critical";
    }

    return { timestamp: Date.now(), display: displayBalance, color };
  } catch {
    return null;
  }
}

// ─── ZhiPu Quota API ────────────────────────────────────────────────────────

interface ZhiPuLimit {
  type: string;
  unit?: number;        // 3 = short window, 6 = weekly
  usage: number;
  remaining: number;
  percentage: number;
  nextResetTime: string;
}

interface ZhiPuQuotaResponse {
  data: {
    limits: ZhiPuLimit[];
    level: string;
  };
}

async function fetchZhiPuQuota(apiKey: string): Promise<ProviderCacheEntry | null> {
  try {
    const resp = await fetch("https://open.bigmodel.cn/api/monitor/usage/quota/limit", {
      headers: { Authorization: apiKey }, // ZhiPu: no "Bearer" prefix
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) return null;

    const data = (await resp.json()) as ZhiPuQuotaResponse;
    if (!data.data?.limits?.length) return null;

    // unit 6 = weekly token limit, unit 3 = shorter window
    const weeklyTokenLimit = data.data.limits.find((l) => l.type === "TOKENS_LIMIT" && l.unit === 6);
    const shortTokenLimit = data.data.limits.find((l) => l.type === "TOKENS_LIMIT" && l.unit !== 6);
    const timeLimit = data.data.limits.find((l) => l.type === "TIME_LIMIT");

    const parts: string[] = [];

    // Show short-window token % and calls remaining
    if (shortTokenLimit) {
      parts.push(`${Math.round(shortTokenLimit.percentage)}%`);
    }
    if (timeLimit) {
      parts.push(`${timeLimit.remaining}c`); // "c" for calls remaining
    }
    // Append weekly token usage %
    if (weeklyTokenLimit) {
      parts.push(`w:${Math.round(weeklyTokenLimit.percentage)}%`);
    }

    if (parts.length === 0) return null;
    const display = parts.join("/");

    // Color based on weekly token usage percentage (most meaningful)
    const pct = weeklyTokenLimit?.percentage ?? shortTokenLimit?.percentage ?? 0;
    let color: "good" | "warning" | "critical";
    if (pct < 50) {
      color = "good";
    } else if (pct < 80) {
      color = "warning";
    } else {
      color = "critical";
    }

    return { timestamp: Date.now(), display, color };
  } catch {
    return null;
  }
}

// ─── MiniMax Quota API ────────────────────────────────────────────────────────

interface MiniMaxModelRemain {
  start_time: number;
  end_time: number;
  remains_time: number;
  current_interval_total_count: number;
  current_interval_usage_count: number;
  model_name: string;
}

interface MiniMaxQuotaResponse {
  model_remains: MiniMaxModelRemain[];
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}

/**
 * Fetch MiniMax quota usage from the API.
 * Uses cookie from auth login for authentication.
 */
async function fetchMiniMaxQuota(): Promise<ProviderCacheEntry | null> {
  try {
    // Try to get credentials from minimax auth
    const { getMiniMaxCredential } = require("../../auth/minimax");
    const cred = getMiniMaxCredential();

    if (!cred?.cookie || !cred?.groupId) {
      return null;
    }

    const url = `https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains?GroupId=${cred.groupId}`;
    const resp = await fetch(url, {
      headers: {
        Cookie: cred.cookie,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) return null;

    const data = (await resp.json()) as MiniMaxQuotaResponse;
    if (!data.model_remains?.length) return null;

    // Get the first model (usually MiniMax-M2)
    const model = data.model_remains[0]!;
    const { current_interval_total_count: total, current_interval_usage_count: remaining } = model;

    // current_interval_usage_count is actually "remaining" count, not "used" count
    const used = total - remaining;
    const pct = total > 0 ? Math.round((used / total) * 100) : 0;

    // Format: "1%" (percentage used)
    const display = `${pct}%`;

    // Color based on usage percentage (higher = worse)
    let color: "good" | "warning" | "critical";
    if (pct < 50) {
      color = "good";
    } else if (pct < 80) {
      color = "warning";
    } else {
      color = "critical";
    }

    return { timestamp: Date.now(), display, color };
  } catch {
    return null;
  }
}

// ─── Kimi Quota API ─────────────────────────────────────────────────────────

interface KimiUsageResponse {
  usages?: {
    scope?: string;
    detail?: { limit?: string; used?: string; remaining?: string };
    limits?: {
      window?: { duration?: number; timeUnit?: string };
      detail?: { limit?: string; used?: string; remaining?: string };
    }[];
  }[];
}

async function fetchKimiQuota(): Promise<ProviderCacheEntry | null> {
  try {
    const { getKimiCredential } = require("../../auth/kimi");
    const cred = getKimiCredential();
    if (!cred?.token || !cred?.cookie) return null;

    const resp = await fetch(
      "https://www.kimi.com/apiv2/kimi.gateway.billing.v1.BillingService/GetUsages",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cred.token}`,
          Cookie: cred.cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scope: ["FEATURE_CODING"] }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }
    );
    if (!resp.ok) return null;

    const data = (await resp.json()) as KimiUsageResponse;
    const entry = data.usages?.find((u) => u.scope === "FEATURE_CODING") ?? data.usages?.[0];
    if (!entry?.detail) return null;

    const parts: string[] = [];

    // Window quota (short-term rate limit, e.g. 5-min window)
    const windowLimit = entry.limits?.[0];
    if (windowLimit?.detail) {
      const wUsed = parseInt(windowLimit.detail.used || "0", 10);
      const wLimit = parseInt(windowLimit.detail.limit || "100", 10);
      const wPct = wLimit > 0 ? Math.round((wUsed / wLimit) * 100) : 0;
      parts.push(`${wPct}%`);
    }

    // Weekly/overall quota
    const used = parseInt(entry.detail.used || "0", 10);
    const limit = parseInt(entry.detail.limit || "100", 10);
    const weeklyPct = limit > 0 ? Math.round((used / limit) * 100) : 0;
    parts.push(`w:${weeklyPct}%`);

    const display = parts.join("/");

    // Color based on window usage (most immediately relevant)
    const colorPct = windowLimit?.detail
      ? Math.round((parseInt(windowLimit.detail.used || "0", 10) / parseInt(windowLimit.detail.limit || "100", 10)) * 100)
      : weeklyPct;
    let color: "good" | "warning" | "critical";
    if (colorPct < 50) color = "good";
    else if (colorPct < 80) color = "warning";
    else color = "critical";

    return { timestamp: Date.now(), display, color };
  } catch {
    return null;
  }
}

// ─── Local Usage (Proxy Request Counts) ──────────────────────────────────────

async function fetchLocalUsage(): Promise<Record<string, number> | null> {
  try {
    const controlPort = getControlPort();
    const url = `http://localhost:${controlPort}/usage`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(500) });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { providers: Record<string, number> };
    return data.providers ?? null;
  } catch {
    return null;
  }
}

// ─── Cache Management ────────────────────────────────────────────────────────

function readCache(): UsageCache {
  try {
    if (!existsSync(CACHE_PATH)) return {};
    const content = readFileSync(CACHE_PATH, "utf-8");
    return JSON.parse(content) as UsageCache;
  } catch {
    return {};
  }
}

function writeCache(cache: UsageCache): void {
  try {
    if (!existsSync(CACHE_DIR)) {
      mkdirSync(CACHE_DIR, { recursive: true });
    }
    writeFileSync(CACHE_PATH, JSON.stringify(cache), "utf-8");
  } catch {
    // Silently fail
  }
}

function isCacheValid(entry: ProviderCacheEntry | undefined): entry is ProviderCacheEntry {
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_TTL_MS;
}

// ─── Collect & Format ────────────────────────────────────────────────────────

/**
 * Collect usage data from all configured providers
 */
async function collectUsageData(_context: SegmentContext): Promise<SegmentData | null> {
  try {
    const cache = readCache();
    let cacheModified = false;
    const parts: { abbrev: string; display: string; color: "good" | "warning" | "critical" }[] = [];

    // DeepSeek
    const dsKey = process.env.DEEPSEEK_API_KEY;
    if (dsKey) {
      if (isCacheValid(cache.deepseek)) {
        parts.push({ abbrev: PROVIDER_ABBREV.deepseek!, display: cache.deepseek.display, color: cache.deepseek.color });
      } else {
        const result = await fetchDeepSeekBalance(dsKey);
        if (result) {
          cache.deepseek = result;
          cacheModified = true;
          parts.push({ abbrev: PROVIDER_ABBREV.deepseek!, display: result.display, color: result.color });
        }
      }
    }

    // ZhiPu
    const zpKey = process.env.ZHIPU_API_KEY;
    if (zpKey) {
      if (isCacheValid(cache.zhipu)) {
        parts.push({ abbrev: PROVIDER_ABBREV.zhipu!, display: cache.zhipu.display, color: cache.zhipu.color });
      } else {
        const result = await fetchZhiPuQuota(zpKey);
        if (result) {
          cache.zhipu = result;
          cacheModified = true;
          parts.push({ abbrev: PROVIDER_ABBREV.zhipu!, display: result.display, color: result.color });
        }
      }
    }

    // Proxy-based providers (request counts from proxy /usage endpoint)
    // Includes: MiniMax, Kimi, OpenAI
    // Providers without API keys or OAuth are completely hidden
    const mmKey = process.env.MINIMAX_API_KEY;
    const kmKey = process.env.KIMI_API_KEY;
    let hasKimi = false;
    try {
      const { hasKimiCredential } = require("../../auth/kimi");
      hasKimi = hasKimiCredential();
    } catch {}
    let hasOpenAI = false;
    try {
      const { hasCredential } = require("../../auth/store");
      hasOpenAI = hasCredential("openai");
    } catch {}

    // MiniMax: try quota API with credentials, fall back to req count
    if (mmKey) {
      if (isCacheValid(cache.minimax)) {
        parts.push({ abbrev: PROVIDER_ABBREV.minimax!, display: cache.minimax.display, color: cache.minimax.color });
      } else {
        const result = await fetchMiniMaxQuota();
        if (result) {
          cache.minimax = result;
          cacheModified = true;
          parts.push({ abbrev: PROVIDER_ABBREV.minimax!, display: result.display, color: result.color });
        } else {
          // No auth or API failed — show local request count
          const localUsage = await fetchLocalUsage();
          parts.push({ abbrev: PROVIDER_ABBREV.minimax!, display: `${localUsage?.minimax ?? 0}req`, color: "neutral" as any });
        }
      }
    }

    // Kimi: try quota API with credentials, fall back to req count
    if (kmKey || hasKimi) {
      if (isCacheValid(cache.kimi)) {
        parts.push({ abbrev: PROVIDER_ABBREV.kimi!, display: cache.kimi.display, color: cache.kimi.color });
      } else {
        const result = hasKimi ? await fetchKimiQuota() : null;
        if (result) {
          cache.kimi = result;
          cacheModified = true;
          parts.push({ abbrev: PROVIDER_ABBREV.kimi!, display: result.display, color: result.color });
        } else {
          // No auth or API failed — show local request count
          const localUsage = await fetchLocalUsage();
          parts.push({ abbrev: PROVIDER_ABBREV.kimi!, display: `${localUsage?.kimi ?? 0}req`, color: "neutral" as any });
        }
      }
    }

    // OpenAI: only local request count (no public quota API)
    if (hasOpenAI) {
      const localUsage = await fetchLocalUsage();
      if (localUsage) {
        parts.push({ abbrev: PROVIDER_ABBREV.openai!, display: `${localUsage.openai ?? 0}req`, color: "neutral" as any });
      }
    }

    if (cacheModified) {
      writeCache(cache);
    }

    // Nothing to show if no providers configured
    if (parts.length === 0) {
      return null;
    }

    // Build primary display string — color is applied per-part in format()
    const primary = parts.map((p) => `${p.abbrev}:${p.display}`).join(" | ");

    // Determine overall color (worst across providers)
    let overallColor: "good" | "warning" | "critical" = "good";
    for (const p of parts) {
      if (p.color === "critical") {
        overallColor = "critical";
        break;
      }
      if (p.color === "warning") {
        overallColor = "warning";
      }
    }

    // Store individual parts in metadata for per-part coloring in format()
    const metadata: Record<string, string> = {
      newLine: "true",
    };
    for (const p of parts) {
      metadata[`${p.abbrev}_display`] = p.display;
      metadata[`${p.abbrev}_color`] = p.color;
    }

    return {
      primary,
      metadata,
      color: overallColor,
    };
  } catch {
    return null;
  }
}

/**
 * Format usage segment — applies per-provider colors
 */
function formatUsageSegment(
  data: SegmentData,
  _config: SegmentConfig,
  style: StyleConfig
): string {
  if (!style.colors) {
    return data.primary;
  }

  // Apply per-provider colors
  const coloredParts: string[] = [];
  const rawParts = data.primary.split(" | ");

  for (const part of rawParts) {
    const colonIdx = part.indexOf(":");
    if (colonIdx === -1) {
      coloredParts.push(part);
      continue;
    }

    const abbrev = part.slice(0, colonIdx);
    const value = part.slice(colonIdx + 1);
    const partColor = data.metadata[`${abbrev}_color`];

    if (partColor && partColor in SEMANTIC_COLORS) {
      const colorCode = SEMANTIC_COLORS[partColor as keyof typeof SEMANTIC_COLORS];
      coloredParts.push(`${abbrev}:${colorCode}${value}${SEMANTIC_COLORS.reset}`);
    } else {
      // Neutral/unknown — use cyan
      coloredParts.push(`${abbrev}:${SEMANTIC_COLORS.neutral}${value}${SEMANTIC_COLORS.reset}`);
    }
  }

  return coloredParts.join(" | ");
}

export const usageSegment: Segment = {
  id: "usage",
  collect: collectUsageData,
  format: formatUsageSegment,
};
