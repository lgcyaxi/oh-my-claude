/**
 * Provider fetch functions — each queries a provider's quota/balance API.
 *
 * These are pure fetch wrappers: they make the HTTP call, parse the response,
 * and return a ProviderCacheEntry with display string and color classification.
 *
 * All functions handle their own errors and return null on failure.
 */

import type { ProviderCacheEntry } from "./types";
import { DEFAULT_PROXY_CONFIG } from "../../../../proxy/types";
import { getMiniMaxCredential } from "../../../../shared/auth/minimax";
import { getKimiCredential } from "../../../../shared/auth/kimi";

/** Fetch timeout for API calls (2 seconds) */
const FETCH_TIMEOUT_MS = 2000;

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

export async function fetchDeepSeekBalance(apiKey: string): Promise<ProviderCacheEntry | null> {
  try {
    const resp = await fetch("https://api.deepseek.com/user/balance", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) return null;

    const data = (await resp.json()) as DeepSeekBalanceResponse;
    if (!data.balance_infos?.length) return null;

    const cny = data.balance_infos.find((b) => b.currency === "CNY");
    const info = cny ?? data.balance_infos[0]!;
    const balance = parseFloat(info.total_balance);
    const symbol = info.currency === "CNY" ? "\u00a5" : "$";

    let displayBalance: string;
    if (balance >= 100) {
      displayBalance = `${symbol}${Math.round(balance)}`;
    } else {
      displayBalance = `${symbol}${balance.toFixed(1)}`;
    }

    let color: "good" | "warning" | "critical";
    if (balance > 100) color = "good";
    else if (balance > 10) color = "warning";
    else color = "critical";

    return { timestamp: Date.now(), display: displayBalance, color };
  } catch {
    return null;
  }
}

// ─── ZhiPu Quota API ────────────────────────────────────────────────────────

interface ZhiPuLimit {
  type: string;
  unit?: number;
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

export async function fetchZhiPuQuota(apiKey: string): Promise<ProviderCacheEntry | null> {
  try {
    const resp = await fetch("https://open.bigmodel.cn/api/monitor/usage/quota/limit", {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) return null;

    const data = (await resp.json()) as ZhiPuQuotaResponse;
    if (!data.data?.limits?.length) return null;

    const weeklyTokenLimit = data.data.limits.find((l) => l.type === "TOKENS_LIMIT" && l.unit === 6);
    const shortTokenLimit = data.data.limits.find((l) => l.type === "TOKENS_LIMIT" && l.unit !== 6);
    const timeLimit = data.data.limits.find((l) => l.type === "TIME_LIMIT");

    const parts: string[] = [];
    if (shortTokenLimit) parts.push(`${Math.round(shortTokenLimit.percentage)}%`);
    if (timeLimit) parts.push(`${timeLimit.remaining}c`);
    if (weeklyTokenLimit) parts.push(`w:${Math.round(weeklyTokenLimit.percentage)}%`);

    if (parts.length === 0) return null;
    const display = parts.join("/");

    const pct = weeklyTokenLimit?.percentage ?? shortTokenLimit?.percentage ?? 0;
    let color: "good" | "warning" | "critical";
    if (pct < 50) color = "good";
    else if (pct < 80) color = "warning";
    else color = "critical";

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
  base_resp: { status_code: number; status_msg: string };
}

export async function fetchMiniMaxQuota(): Promise<ProviderCacheEntry | null> {
  try {
    const apiKey = process.env.MINIMAX_CN_API_KEY || process.env.MINIMAX_API_KEY;

    // Strategy 1: API key only (works without GroupId)
    if (apiKey) {
      try {
        const resp = await fetch(
          "https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains",
          {
            headers: { "Accept": "application/json", "Authorization": `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          }
        );
        if (resp.ok) {
          const data = (await resp.json()) as MiniMaxQuotaResponse;
          if (data.model_remains?.length) {
            const model = data.model_remains[0]!;
            const { current_interval_total_count: total, current_interval_usage_count: remaining } = model;
            const used = total - remaining;
            const pct = total > 0 ? Math.round((used / total) * 100) : 0;
            let color: "good" | "warning" | "critical";
            if (pct < 50) color = "good";
            else if (pct < 80) color = "warning";
            else color = "critical";
            return { timestamp: Date.now(), display: `${pct}%`, color };
          }
        }
      } catch {
        // Fall through
      }
    }

    // Strategy 2: Cookie + GroupId (from saved credentials)
    const cred = getMiniMaxCredential();
    if (!cred?.cookie || !cred?.groupId) return null;

    const url = `https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains?GroupId=${cred.groupId}`;
    const resp = await fetch(url, {
      headers: { Cookie: cred.cookie },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) return null;

    const data = (await resp.json()) as MiniMaxQuotaResponse;
    if (!data.model_remains?.length) return null;

    const model = data.model_remains[0]!;
    const { current_interval_total_count: total, current_interval_usage_count: remaining } = model;
    const used = total - remaining;
    const pct = total > 0 ? Math.round((used / total) * 100) : 0;
    const display = `${pct}%`;

    let color: "good" | "warning" | "critical";
    if (pct < 50) color = "good";
    else if (pct < 80) color = "warning";
    else color = "critical";

    return { timestamp: Date.now(), display, color };
  } catch {
    return null;
  }
}

// ─── Kimi Quota API ─────────────────────────────────────────────────────────

interface KimiUsageResponse {
  usages?: {
    scope?: string;
    detail?: { limit?: string; used?: string; remaining?: string; resetTime?: string };
    limits?: {
      window?: { duration?: number; timeUnit?: string };
      detail?: { limit?: string; used?: string; remaining?: string; resetTime?: string };
    }[];
  }[];
}

export async function fetchKimiQuota(): Promise<ProviderCacheEntry | null> {
  try {
    const cred = getKimiCredential();
    if (!cred?.token || !cred?.cookie) return null;

    const fetchUsages = async (body: Record<string, unknown>): Promise<KimiUsageResponse | null> => {
      const resp = await fetch(
        "https://www.kimi.com/apiv2/kimi.gateway.billing.v1.BillingService/GetUsages",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cred.token}`,
            Cookie: cred.cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        }
      );

      if (resp.status === 401 || resp.status === 403) return null;
      if (!resp.ok) return null;
      return (await resp.json()) as KimiUsageResponse;
    };

    let data = await fetchUsages({ scope: ["FEATURE_CODING"] });
    let entry = data?.usages?.find((u) => u.scope === "FEATURE_CODING")
      ?? data?.usages?.find((u) => !!u.detail)
      ?? data?.usages?.[0];

    if (!entry?.detail) {
      data = await fetchUsages({});
      entry = data?.usages?.find((u) => u.scope === "FEATURE_CODING")
        ?? data?.usages?.find((u) => !!u.detail)
        ?? data?.usages?.[0];
    }
    if (!entry?.detail) return null;

    const parts: string[] = [];

    const windowLimit = entry.limits?.[0];
    let windowPct = 0;
    if (windowLimit?.detail) {
      const wLimit = parseInt(windowLimit.detail.limit || "100", 10);
      const wUsed = windowLimit.detail.used !== undefined
        ? parseInt(windowLimit.detail.used, 10)
        : wLimit - parseInt(windowLimit.detail.remaining || "0", 10);
      windowPct = wLimit > 0 ? Math.round((wUsed / wLimit) * 100) : 0;
      parts.push(`${windowPct}%`);
    }

    const overallLimit = parseInt(entry.detail.limit || "100", 10);
    const overallUsed = entry.detail.used !== undefined
      ? parseInt(entry.detail.used, 10)
      : overallLimit - parseInt(entry.detail.remaining || "0", 10);
    const weeklyPct = overallLimit > 0 ? Math.round((overallUsed / overallLimit) * 100) : 0;
    parts.push(`w:${weeklyPct}%`);

    const display = parts.join("/");

    const colorPct = windowLimit?.detail ? windowPct : weeklyPct;
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

export async function fetchLocalUsage(): Promise<Record<string, number> | null> {
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
