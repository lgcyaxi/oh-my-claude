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
 * Output includes metadata.newLine = "3" to signal third-row rendering.
 */

import type { Segment, SegmentData, SegmentContext, SegmentConfig, StyleConfig } from "../types";
import { SEMANTIC_COLORS } from "../index";
import { PROVIDER_ABBREV } from "./types";
import { readCache, writeCache, isCacheValid } from "./cache";
import { fetchLocalUsage } from "./local";
import { fetchDeepSeekBalance } from "./deepseek";
import { fetchZhiPuQuota } from "./zhipu";
import { fetchMiniMaxQuota } from "./minimax";
import { fetchKimiQuota } from "./kimi";
import { fetchAliyunQuota } from "./aliyun";
import { fetchOpenAIUsage, isOpenAIConfigured } from "./openai";
import { hasKimiCredential } from "../../../../shared/auth/kimi";
import { hasAliyunCredential } from "../../../../shared/auth/aliyun";
import { hasMiniMaxCredential } from "../../../../shared/auth/minimax";

/**
 * Collect usage data from all configured providers
 */
/** Per-provider fetch timeout (ms) */
const PROVIDER_TIMEOUT_MS = 3000;

/** Wrap a promise with a timeout */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Provider timeout after ${ms}ms`)), ms)
    ),
  ]);
}

type PartResult = { abbrev: string; display: string; color: "good" | "warning" | "critical" };
type ProviderCacheKey = "deepseek" | "zhipu" | "minimax" | "kimi" | "aliyun" | "openai";

async function collectUsageData(_context: SegmentContext): Promise<SegmentData | null> {
  try {
    const cache = readCache();
    let cacheModified = false;

    // Detect which providers are configured
    const dsKey = process.env.DEEPSEEK_API_KEY;
    const zpKey = process.env.ZHIPU_API_KEY;
    const zaiKey = process.env.ZAI_API_KEY;
    const mmKey = process.env.MINIMAX_API_KEY;
    const mmCnKey = process.env.MINIMAX_CN_API_KEY;
    const kmKey = process.env.KIMI_API_KEY;
    const ayKey = process.env.ALIYUN_API_KEY;

    const hasKimi = !!kmKey || hasKimiCredential();
    const hasOpenAI = isOpenAIConfigured();
    const hasAliyun = !!ayKey || hasAliyunCredential();
    const hasMiniMax = !!(mmCnKey || mmKey) || hasMiniMaxCredential();

    // Build parallel fetch tasks for providers that need API calls (cache miss)
    // Each task returns: { key, abbrev, order, result } or null
    type FetchTask = Promise<{ key: ProviderCacheKey | null; abbrev: string; order: number; result: PartResult }>;
    const tasks: FetchTask[] = [];
    // Track all results with their display order for consistent ordering
    const allParts: Array<PartResult & { order: number }> = [];
    let providerOrder = 0;

    // --- DeepSeek ---
    if (dsKey) {
      const order = providerOrder++;
      if (isCacheValid(cache.deepseek)) {
        allParts.push({ abbrev: PROVIDER_ABBREV.deepseek!, display: cache.deepseek.display, color: cache.deepseek.color, order });
      } else {
        tasks.push(
          withTimeout(fetchDeepSeekBalance(dsKey), PROVIDER_TIMEOUT_MS).then((result) => {
            const abbrev = PROVIDER_ABBREV.deepseek!;
            if (result) return { key: "deepseek" as ProviderCacheKey, abbrev, order, result: { abbrev, display: result.display, color: result.color } };
            return { key: null, abbrev, order, result: { abbrev, display: "?", color: "warning" as const } };
          }).catch(() => ({ key: null, abbrev: PROVIDER_ABBREV.deepseek!, order, result: { abbrev: PROVIDER_ABBREV.deepseek!, display: "?", color: "warning" as const } }))
        );
      }
    }

    // --- ZhiPu ---
    if (zpKey) {
      const order = providerOrder++;
      if (isCacheValid(cache.zhipu)) {
        allParts.push({ abbrev: PROVIDER_ABBREV.zhipu!, display: cache.zhipu.display, color: cache.zhipu.color, order });
      } else {
        tasks.push(
          withTimeout(fetchZhiPuQuota(zpKey), PROVIDER_TIMEOUT_MS).then((result) => {
            const abbrev = PROVIDER_ABBREV.zhipu!;
            if (result) return { key: "zhipu" as ProviderCacheKey, abbrev, order, result: { abbrev, display: result.display, color: result.color } };
            return { key: null, abbrev, order, result: { abbrev, display: "?", color: "warning" as const } };
          }).catch(() => ({ key: null, abbrev: PROVIDER_ABBREV.zhipu!, order, result: { abbrev: PROVIDER_ABBREV.zhipu!, display: "?", color: "warning" as const } }))
        );
      }
    }

    // --- ZhiPu Global (Z.ai) ---
    if (zaiKey) {
      const order = providerOrder++;
      tasks.push(
        fetchLocalUsage().then((localUsage) => {
          const abbrev = PROVIDER_ABBREV["zhipu-global"]!;
          return { key: null, abbrev, order, result: { abbrev, display: `${localUsage?.["zhipu-global"] ?? 0}req`, color: "neutral" as any } };
        })
      );
    }

    // --- MiniMax (unified: show quota when API key OR saved credentials exist) ---
    if (hasMiniMax) {
      const order = providerOrder++;
      if (isCacheValid(cache.minimax)) {
        allParts.push({ abbrev: PROVIDER_ABBREV.minimax!, display: cache.minimax.display, color: cache.minimax.color, order });
      } else {
        tasks.push(
          withTimeout(fetchMiniMaxQuota(), PROVIDER_TIMEOUT_MS).then(async (result) => {
            const abbrev = PROVIDER_ABBREV.minimax!;
            if (result) return { key: "minimax" as ProviderCacheKey, abbrev, order, result: { abbrev, display: result.display, color: result.color } };
            const localUsage = await fetchLocalUsage();
            const reqCount = (localUsage?.["minimax-cn"] ?? 0) + (localUsage?.minimax ?? 0);
            return { key: null, abbrev, order, result: { abbrev, display: `${reqCount}req`, color: "neutral" as any } };
          }).catch(async () => {
            const abbrev = PROVIDER_ABBREV.minimax!;
            const localUsage = await fetchLocalUsage();
            const reqCount = (localUsage?.["minimax-cn"] ?? 0) + (localUsage?.minimax ?? 0);
            return { key: null, abbrev, order, result: { abbrev, display: `${reqCount}req`, color: "neutral" as any } };
          })
        );
      }
    }

    // --- Kimi ---
    if (kmKey || hasKimi) {
      const order = providerOrder++;
      if (isCacheValid(cache.kimi)) {
        allParts.push({ abbrev: PROVIDER_ABBREV.kimi!, display: cache.kimi.display, color: cache.kimi.color, order });
      } else {
        const fetchFn = hasKimi
          ? () => withTimeout(fetchKimiQuota(), PROVIDER_TIMEOUT_MS)
          : () => Promise.resolve(null);
        tasks.push(
          fetchFn().then(async (result) => {
            const abbrev = PROVIDER_ABBREV.kimi!;
            if (result) return { key: "kimi" as ProviderCacheKey, abbrev, order, result: { abbrev, display: result.display, color: result.color } };
            const localUsage = await fetchLocalUsage();
            return { key: null, abbrev, order, result: { abbrev, display: `${localUsage?.kimi ?? 0}req`, color: "neutral" as any } };
          }).catch(async () => {
            const abbrev = PROVIDER_ABBREV.kimi!;
            const localUsage = await fetchLocalUsage();
            return { key: null, abbrev, order, result: { abbrev, display: `${localUsage?.kimi ?? 0}req`, color: "neutral" as any } };
          })
        );
      }
    }

    // --- Aliyun ---
    if (ayKey || hasAliyun) {
      const order = providerOrder++;
      if (isCacheValid(cache.aliyun)) {
        allParts.push({ abbrev: PROVIDER_ABBREV.aliyun!, display: cache.aliyun.display, color: cache.aliyun.color, order });
      } else {
        const fetchFn = hasAliyun
          ? () => withTimeout(fetchAliyunQuota(), PROVIDER_TIMEOUT_MS)
          : () => Promise.resolve(null);
        tasks.push(
          fetchFn().then(async (result) => {
            const abbrev = PROVIDER_ABBREV.aliyun!;
            if (result) return { key: "aliyun" as ProviderCacheKey, abbrev, order, result: { abbrev, display: result.display, color: result.color } };
            const localUsage = await fetchLocalUsage();
            return { key: null, abbrev, order, result: { abbrev, display: `${localUsage?.aliyun ?? 0}req`, color: "neutral" as any } };
          }).catch(async () => {
            const abbrev = PROVIDER_ABBREV.aliyun!;
            const localUsage = await fetchLocalUsage();
            return { key: null, abbrev, order, result: { abbrev, display: `${localUsage?.aliyun ?? 0}req`, color: "neutral" as any } };
          })
        );
      }
    }

    // --- Ollama (local only, no API fetch) ---
    const ollamaConfigured = !!process.env.OLLAMA_API_KEY || !!process.env.OLLAMA_HOST || !!process.env.OLLAMA_API_BASE;
    if (ollamaConfigured) {
      const order = providerOrder++;
      tasks.push(
        fetchLocalUsage().then((localUsage) => {
          const abbrev = PROVIDER_ABBREV.ollama!;
          return { key: null, abbrev, order, result: { abbrev, display: `${localUsage?.ollama ?? 0}req`, color: "neutral" as any } };
        })
      );
    }

    // --- OpenAI / Codex ---
    if (hasOpenAI) {
      const order = providerOrder++;
      if (isCacheValid(cache.openai)) {
        allParts.push({ abbrev: PROVIDER_ABBREV.openai!, display: cache.openai.display, color: cache.openai.color, order });
      } else {
        tasks.push(
          withTimeout(fetchOpenAIUsage(), PROVIDER_TIMEOUT_MS).then(async (result) => {
            const abbrev = PROVIDER_ABBREV.openai!;
            if (result) return { key: "openai" as ProviderCacheKey, abbrev, order, result: { abbrev, display: result.display, color: result.color } };
            const localUsage = await fetchLocalUsage();
            return { key: null, abbrev, order, result: { abbrev, display: `${localUsage?.openai ?? 0}req`, color: "neutral" as any } };
          }).catch(async () => {
            const abbrev = PROVIDER_ABBREV.openai!;
            const localUsage = await fetchLocalUsage();
            return { key: null, abbrev, order, result: { abbrev, display: `${localUsage?.openai ?? 0}req`, color: "neutral" as any } };
          })
        );
      }
    }

    // Run all API fetches in parallel
    const settled = await Promise.allSettled(tasks);

    // Collect fetched results and merge with cached parts
    for (const s of settled) {
      if (s.status !== "fulfilled") continue;
      const { key, order, result } = s.value;
      allParts.push({ ...result, order });
      // Update cache for successful API fetches
      if (key) {
        (cache as any)[key] = { display: result.display, color: result.color, timestamp: Date.now() };
        cacheModified = true;
      }
    }

    // Sort by registration order to maintain consistent provider display order
    // (DS first, then ZP, MM, KM, AY, OL, OA — regardless of cache/fetch timing)
    allParts.sort((a, b) => a.order - b.order);
    const parts = allParts;

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
      newLine: "3",
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

    // Bold white abbreviation for visibility, colored value for status
    const styledAbbrev = `\x1b[1;37m${abbrev}\x1b[0m`; // bold bright white
    if (partColor && partColor in SEMANTIC_COLORS) {
      const colorCode = SEMANTIC_COLORS[partColor as keyof typeof SEMANTIC_COLORS];
      coloredParts.push(`${styledAbbrev}:${colorCode}${value}${SEMANTIC_COLORS.reset}`);
    } else {
      // Neutral/unknown — use cyan
      coloredParts.push(`${styledAbbrev}:${SEMANTIC_COLORS.neutral}${value}${SEMANTIC_COLORS.reset}`);
    }
  }

  return coloredParts.join(" | ");
}

export const usageSegment: Segment = {
  id: "usage",
  collect: collectUsageData,
  format: formatUsageSegment,
};
