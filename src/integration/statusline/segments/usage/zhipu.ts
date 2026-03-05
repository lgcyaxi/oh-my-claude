import type { ProviderCacheEntry } from "./types";
import { FETCH_TIMEOUT_MS } from "./types";

interface ZhiPuLimit {
  type: string;
  unit?: number;        // 3 = short window, 5 = monthly, 6 = weekly
  number?: number;      // quota limit number
  usage: number;        // total quota
  currentValue?: number; // used count
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
      headers: { Authorization: apiKey }, // ZhiPu: no "Bearer" prefix
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) return null;

    const data = (await resp.json()) as ZhiPuQuotaResponse;
    if (!data.data?.limits?.length) return null;

    // unit 3 = short-window token limit, unit 6 = weekly token limit
    const weeklyTokenLimit = data.data.limits.find((l) => l.type === "TOKENS_LIMIT" && l.unit === 6);
    const shortTokenLimit = data.data.limits.find((l) => l.type === "TOKENS_LIMIT" && l.unit !== 6);
    // unit 5 = monthly call limit (TIME_LIMIT)
    const monthlyCallLimit = data.data.limits.find((l) => l.type === "TIME_LIMIT" && l.unit === 5);

    const parts: string[] = [];

    // Show short-window token %
    if (shortTokenLimit) {
      parts.push(`${Math.round(shortTokenLimit.percentage)}%`);
    }
    // Append weekly token usage %
    if (weeklyTokenLimit) {
      parts.push(`w:${Math.round(weeklyTokenLimit.percentage)}%`);
    }
    // Append monthly call usage % with remaining count for MCP awareness
    if (monthlyCallLimit) {
      const remaining = monthlyCallLimit.remaining ?? 0;
      parts.push(`m:${Math.round(monthlyCallLimit.percentage)}%/${remaining}`);
    }

    if (parts.length === 0) return null;
    const display = parts.join("/");

    // Color based on weekly token usage percentage (most meaningful), then monthly
    const pct = weeklyTokenLimit?.percentage ?? monthlyCallLimit?.percentage ?? shortTokenLimit?.percentage ?? 0;
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
