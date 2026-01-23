/**
 * Session/Usage segment - shows API quota usage
 *
 * Displays the session cost and API usage from Claude Code's cost data.
 * When cost data is unavailable, shows session duration as fallback.
 *
 * Data source: Claude Code stdin JSON (cost field)
 */

import { existsSync, readFileSync, writeFileSync, statSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Segment, SegmentData, SegmentContext, SegmentConfig, StyleConfig } from "./types";
import { wrapBrackets, applyColor } from "./index";

// Cache directory for API usage data
const CACHE_DIR = join(homedir(), ".claude", "oh-my-claude", "cache");
const USAGE_CACHE_FILE = join(CACHE_DIR, "api_usage.json");
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface UsageCache {
  timestamp: number;
  five_hour?: { utilization: number; resets_at?: string };
  seven_day?: { utilization: number; resets_at?: string };
}

interface ApiUsageResponse {
  five_hour?: { utilization: number; resets_at?: string };
  seven_day?: { utilization: number; resets_at?: string };
}

/**
 * Format cost in USD
 */
function formatCost(cost: number): string {
  if (cost === 0) return "$0";
  if (cost < 0.01) return "<$0.01";
  return `$${cost.toFixed(2)}`;
}

/**
 * Format duration in milliseconds to human readable
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h${remainingMinutes > 0 ? `${remainingMinutes}m` : ""}`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return `${seconds}s`;
}

/**
 * Format utilization percentage with visual indicator
 */
function formatUtilization(utilization: number): string {
  const percent = Math.round(utilization * 100);
  return `${percent}%`;
}

/**
 * Read cached usage data
 */
function readUsageCache(): UsageCache | null {
  try {
    if (!existsSync(USAGE_CACHE_FILE)) {
      return null;
    }
    const stat = statSync(USAGE_CACHE_FILE);
    const age = Date.now() - stat.mtimeMs;
    if (age > CACHE_TTL_MS) {
      return null; // Cache expired
    }
    const content = readFileSync(USAGE_CACHE_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Write usage data to cache
 */
function writeUsageCache(data: UsageCache): void {
  try {
    if (!existsSync(CACHE_DIR)) {
      mkdirSync(CACHE_DIR, { recursive: true });
    }
    writeFileSync(USAGE_CACHE_FILE, JSON.stringify(data), "utf-8");
  } catch {
    // Ignore cache write errors
  }
}

/**
 * Fetch API usage from Claude Code OAuth endpoint
 * Note: This requires OAuth token which may not be available in statusline context
 */
async function fetchApiUsage(apiBaseUrl: string, accessToken: string): Promise<ApiUsageResponse | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

    const response = await fetch(`${apiBaseUrl}/api/oauth/usage`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    return await response.json() as ApiUsageResponse;
  } catch {
    return null;
  }
}

/**
 * Collect session/usage information
 */
async function collectSessionData(context: SegmentContext): Promise<SegmentData | null> {
  const { claudeCodeInput } = context;

  // Priority 1: Show cost data if available (from Claude Code stdin)
  if (claudeCodeInput?.cost?.total_cost_usd !== undefined) {
    const cost = claudeCodeInput.cost.total_cost_usd;
    const duration = claudeCodeInput.cost.total_duration_ms || 0;
    const linesAdded = claudeCodeInput.cost.total_lines_added || 0;
    const linesRemoved = claudeCodeInput.cost.total_lines_removed || 0;

    // Determine color based on cost
    let color: SegmentData["color"] = "good";
    if (cost > 1) color = "warning";
    if (cost > 5) color = "critical";

    // Primary: cost, Secondary: duration or lines changed
    const primary = formatCost(cost);
    let secondary = "";
    if (duration > 0) {
      secondary = formatDuration(duration);
    }
    if (linesAdded > 0 || linesRemoved > 0) {
      const lineInfo = `+${linesAdded} -${linesRemoved}`;
      secondary = secondary ? `${secondary} ${lineInfo}` : lineInfo;
    }

    return {
      primary,
      secondary,
      metadata: {
        cost: String(cost),
        duration: String(duration),
        linesAdded: String(linesAdded),
        linesRemoved: String(linesRemoved),
      },
      color,
    };
  }

  // Priority 2: Try to fetch API usage (if OAuth available)
  if (claudeCodeInput?.oauth?.api_base_url && claudeCodeInput?.oauth?.access_token) {
    // Check cache first
    let usageData = readUsageCache();

    if (!usageData) {
      const apiResponse = await fetchApiUsage(
        claudeCodeInput.oauth.api_base_url,
        claudeCodeInput.oauth.access_token
      );

      if (apiResponse) {
        usageData = {
          timestamp: Date.now(),
          five_hour: apiResponse.five_hour,
          seven_day: apiResponse.seven_day,
        };
        writeUsageCache(usageData);
      }
    }

    if (usageData?.seven_day) {
      const utilization = usageData.seven_day.utilization;
      const fiveHour = usageData.five_hour?.utilization || 0;

      // Determine color based on utilization
      let color: SegmentData["color"] = "good";
      if (utilization > 0.5 || fiveHour > 0.5) color = "warning";
      if (utilization > 0.8 || fiveHour > 0.8) color = "critical";

      return {
        primary: formatUtilization(utilization),
        secondary: `5h:${formatUtilization(fiveHour)}`,
        metadata: {
          sevenDay: String(utilization),
          fiveHour: String(fiveHour),
        },
        color,
      };
    }
  }

  // Priority 3: Fallback - show "?" for graceful degradation
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
