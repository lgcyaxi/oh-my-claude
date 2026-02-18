/**
 * Kimi segment - shows usage/quota from billing API
 * Display: [kimi:85%] | [kimi:✓] | hidden (no creds)
 * API: POST kimi.gateway.billing.v1.BillingService/GetUsages (Bearer + cookie auth)
 * Cache: 60s TTL. Fails silently.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Segment, SegmentData, SegmentContext, SegmentConfig, StyleConfig } from "./types";
import { wrapBrackets, applyColor } from "./index";

const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 2000;
const CACHE_DIR = join(homedir(), ".config", "oh-my-claude");
const CACHE_PATH = join(CACHE_DIR, "kimi-usage-cache.json");

interface KimiUsageCache {
  timestamp: number;
  display: string;
  color: "good" | "warning" | "critical";
}

// ─── Kimi Billing API ────────────────────────────────────────────────────────

interface KimiUsageResponse {
  usages?: KimiUsageEntry[];
}

interface KimiUsageEntry {
  scope?: string;
  detail?: {
    limit?: string;
    used?: string;
    remaining?: string;
    resetTime?: string;
  };
  limits?: KimiLimitEntry[];
}

interface KimiLimitEntry {
  window?: {
    duration?: number;
    timeUnit?: string;
  };
  detail?: {
    limit?: string;
    used?: string;
    remaining?: string;
    resetTime?: string;
  };
}

async function fetchKimiUsage(): Promise<KimiUsageCache | null> {
  try {
    const { getKimiCredential } = require("../../auth/kimi");
    const cred = getKimiCredential();

    if (!cred?.token || !cred?.cookie) {
      return null;
    }

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

    if (!resp.ok) {
      return { timestamp: Date.now(), display: "\u2713", color: "good" };
    }

    const data = (await resp.json()) as KimiUsageResponse;

    if (!data.usages?.length) {
      return { timestamp: Date.now(), display: "\u2713", color: "good" };
    }

    const primary = data.usages.find((u) => u.scope === "FEATURE_CODING") ?? data.usages[0]!;

    const parts: string[] = [];

    // Window quota (short-term rate limit)
    const windowLimit = primary.limits?.[0];
    let windowPct = 0;
    if (windowLimit?.detail) {
      const wUsed = parseInt(windowLimit.detail.used || "0", 10);
      const wLimit = parseInt(windowLimit.detail.limit || "100", 10);
      windowPct = wLimit > 0 ? Math.round((wUsed / wLimit) * 100) : 0;
      parts.push(`${windowPct}%`);
    }

    // Weekly/overall quota
    if (primary.detail) {
      const used = parseInt(primary.detail.used || "0", 10);
      const limit = parseInt(primary.detail.limit || "100", 10);
      const weeklyPct = limit > 0 ? Math.round((used / limit) * 100) : 0;
      parts.push(`w:${weeklyPct}%`);
    }

    if (parts.length === 0) {
      return { timestamp: Date.now(), display: "\u2713", color: "good" };
    }

    // Color based on window usage
    let color: "good" | "warning" | "critical";
    if (windowPct < 50) color = "good";
    else if (windowPct < 80) color = "warning";
    else color = "critical";

    return { timestamp: Date.now(), display: parts.join("/"), color };
  } catch {
    return null;
  }
}

// ─── Cache ───────────────────────────────────────────────────────────────────

function readCache(): KimiUsageCache | null {
  try {
    if (!existsSync(CACHE_PATH)) return null;
    const content = readFileSync(CACHE_PATH, "utf-8");
    const cached = JSON.parse(content) as KimiUsageCache;
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCache(entry: KimiUsageCache): void {
  try {
    if (!existsSync(CACHE_DIR)) {
      mkdirSync(CACHE_DIR, { recursive: true });
    }
    writeFileSync(CACHE_PATH, JSON.stringify(entry), "utf-8");
  } catch {
    // silent
  }
}

// ─── Segment Implementation ──────────────────────────────────────────────────

async function collectKimiData(_context: SegmentContext): Promise<SegmentData | null> {
  try {
    const { hasKimiCredential } = require("../../auth/kimi");
    if (!hasKimiCredential()) {
      return null;
    }

    const cached = readCache();
    if (cached) {
      return {
        primary: `kimi:${cached.display}`,
        metadata: {},
        color: cached.color,
      };
    }

    const result = await fetchKimiUsage();
    if (!result) {
      return {
        primary: "kimi:--",
        metadata: {},
        color: "neutral",
      };
    }

    writeCache(result);

    return {
      primary: `kimi:${result.display}`,
      metadata: {},
      color: result.color,
    };
  } catch {
    return null;
  }
}

function formatKimiSegment(
  data: SegmentData,
  _config: SegmentConfig,
  style: StyleConfig
): string {
  const colored = applyColor(data.primary, data.color, style);
  return wrapBrackets(colored, style);
}

/**
 * Kimi statusline segment.
 * Uses "usage" as placeholder SegmentId — "kimi" SegmentId + registration are separate tasks.
 */
export const kimiSegment: Segment = {
  id: "usage" as any,
  collect: collectKimiData,
  format: formatKimiSegment,
};
