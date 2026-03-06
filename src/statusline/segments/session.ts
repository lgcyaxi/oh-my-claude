/**
 * Session/Usage segment - shows Claude subscription quota usage
 *
 * Data source: Cache file at ~/.claude/oh-my-claude/cache/api_usage.json
 * The proxy intercepts Claude Code's own /api/oauth/usage responses and
 * writes them to this cache file. The statusline never makes its own API
 * call — this avoids competing for rate limits with Claude Code.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Segment, SegmentData, SegmentContext, SegmentConfig, StyleConfig } from "./types";
import { wrapBrackets, applyColor } from "./index";
import { fetchClaudeUsage } from "../../proxy/claude-usage";

// Cache file path (written by proxy handler)
const USAGE_CACHE_FILE = join(homedir(), ".claude", "oh-my-claude", "cache", "api_usage.json");

interface UsageCache {
  timestamp: number;
  five_hour?: { utilization: number; resets_at?: string };
  seven_day?: { utilization: number; resets_at?: string };
}

/**
 * Read cached usage data from file (written by proxy).
 */
function readUsageCache(): UsageCache | null {
  try {
    if (!existsSync(USAGE_CACHE_FILE)) {
      return null;
    }
    const content = readFileSync(USAGE_CACHE_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Format utilization percentage
 */
function formatUtilization(utilization: number): string {
  const percent = Math.round(utilization * 100);
  return `${percent}%`;
}

/** Staleness threshold for cache data (5 minutes, matches CCometixLine default) */
const CACHE_STALE_MS = 300_000;

/**
 * Collect session/usage information
 *
 * Reads proxy-cached OAuth usage data. If cache is stale or missing,
 * actively fetches from Anthropic API using the OAuth token.
 */
async function collectSessionData(_context: SegmentContext): Promise<SegmentData | null> {
  let usageData = readUsageCache();

  // If cache is stale (>2 min) or missing, try direct API fetch
  const isStale = !usageData || (Date.now() - usageData.timestamp > CACHE_STALE_MS);
  if (isStale) {
    try {
      const fresh = await fetchClaudeUsage(2000);
      if (fresh?.five_hour) {
        usageData = {
          timestamp: Date.now(),
          five_hour: fresh.five_hour,
          seven_day: fresh.seven_day,
        };
        // Write back to cache for next render
        try {
          const cacheDir = join(homedir(), ".claude", "oh-my-claude", "cache");
          mkdirSync(cacheDir, { recursive: true });
          writeFileSync(
            USAGE_CACHE_FILE,
            JSON.stringify(usageData),
            "utf-8"
          );
        } catch { /* non-critical */ }
      }
    } catch { /* fetch failed, use stale cache if available */ }
  }

  if (usageData?.five_hour) {
    const fiveHour = usageData.five_hour.utilization;
    const sevenDay = usageData.seven_day?.utilization || 0;

    // Color based on utilization severity (values are 0-100)
    let color: SegmentData["color"] = "good";
    if (fiveHour > 50 || sevenDay > 50) color = "warning";
    if (fiveHour > 80 || sevenDay > 80) color = "critical";

    // Format reset time for 5h window
    const resetTime = usageData.five_hour.resets_at;
    let resetDisplay = "";
    if (resetTime) {
      try {
        const dt = new Date(resetTime);
        const h = dt.getHours();
        const m = dt.getMinutes();
        resetDisplay = ` R${h}:${m < 10 ? "0" + m : m}`;
      } catch { /* ignore invalid date */ }
    }

    return {
      primary: formatUtilization(fiveHour / 100),
      secondary: `7d:${formatUtilization(sevenDay / 100)}${resetDisplay}`,
      metadata: {
        fiveHour: String(fiveHour),
        sevenDay: String(sevenDay),
      },
      color,
    };
  }

  // No cache data — show "?" until proxy populates cache
  return {
    primary: "?",
    metadata: {},
    color: "neutral",
  };
}

/**
 * Format session segment for display
 */
function formatSessionSegment(
  data: SegmentData,
  _config: SegmentConfig,
  style: StyleConfig
): string {
  let display = data.primary;
  if (data.secondary) {
    display = `${data.primary} ${data.secondary}`;
  }
  const colored = applyColor(display, data.color, style);
  return wrapBrackets(colored, style);
}

export const sessionSegment: Segment = {
  id: "session",
  collect: collectSessionData,
  format: formatSessionSegment,
};
