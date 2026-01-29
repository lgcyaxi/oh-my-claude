/**
 * Session/Usage segment - shows API quota usage
 *
 * Displays the API quota utilization from Claude's OAuth usage endpoint.
 * Reads OAuth credentials from Claude Code's credential storage:
 * - macOS: Keychain via `security` command
 * - Other OS: ~/.claude/.credentials.json
 *
 * Data source: Claude OAuth API (/api/oauth/usage)
 */

import { existsSync, readFileSync, writeFileSync, statSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import { execSync } from "node:child_process";
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

interface OAuthCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string[];
  subscriptionType?: string;
}

interface CredentialsFile {
  claudeAiOauth?: OAuthCredentials;
}

/**
 * Get OAuth token from macOS Keychain
 */
function getOAuthTokenMacOS(): string | null {
  try {
    const user = process.env.USER || "user";
    const result = execSync(
      `security find-generic-password -a "${user}" -w -s "Claude Code-credentials"`,
      { encoding: "utf-8", timeout: 2000, stdio: ["pipe", "pipe", "pipe"] }
    ).trim();

    if (result) {
      const creds = JSON.parse(result) as CredentialsFile;
      return creds.claudeAiOauth?.accessToken ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get OAuth token from credentials file
 */
function getOAuthTokenFromFile(): string | null {
  try {
    const credentialsPath = join(homedir(), ".claude", ".credentials.json");
    if (!existsSync(credentialsPath)) {
      return null;
    }
    const content = readFileSync(credentialsPath, "utf-8");
    const creds = JSON.parse(content) as CredentialsFile;
    return creds.claudeAiOauth?.accessToken ?? null;
  } catch {
    return null;
  }
}

/**
 * Get OAuth token from Claude Code's credential storage
 * - macOS: Keychain
 * - Other OS: File-based
 */
function getOAuthToken(): string | null {
  if (platform() === "darwin") {
    const token = getOAuthTokenMacOS();
    if (token) return token;
  }
  // Fallback to file-based credentials
  return getOAuthTokenFromFile();
}

/**
 * Format utilization percentage
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
 *
 * Shows API quota usage (5-hour and 7-day utilization) from Claude's OAuth API.
 * For non-Claude APIs (custom base URL), shows "0%" as fallback.
 */
async function collectSessionData(context: SegmentContext): Promise<SegmentData | null> {
  const { claudeCodeInput } = context;

  // Priority 1: Try to fetch API quota usage from Claude OAuth API
  const accessToken = getOAuthToken();

  if (accessToken) {
    // Check cache first
    let usageData = readUsageCache();

    if (!usageData) {
      // Use custom API base if provided via stdin, otherwise default to Anthropic
      const apiBaseUrl = claudeCodeInput?.oauth?.api_base_url || "https://api.anthropic.com";
      const apiResponse = await fetchApiUsage(apiBaseUrl, accessToken);

      if (apiResponse) {
        usageData = {
          timestamp: Date.now(),
          five_hour: apiResponse.five_hour,
          seven_day: apiResponse.seven_day,
        };
        writeUsageCache(usageData);
      }
    }

    if (usageData?.five_hour) {
      // Display 5-hour utilization as primary (like CCometixLine)
      const fiveHour = usageData.five_hour.utilization;
      const sevenDay = usageData.seven_day?.utilization || 0;

      // Determine color based on utilization (values are 0-100)
      let color: SegmentData["color"] = "good";
      if (fiveHour > 50 || sevenDay > 50) color = "warning";
      if (fiveHour > 80 || sevenDay > 80) color = "critical";

      return {
        primary: formatUtilization(fiveHour / 100),
        secondary: `7d:${formatUtilization(sevenDay / 100)}`,
        metadata: {
          fiveHour: String(fiveHour),
          sevenDay: String(sevenDay),
        },
        color,
      };
    }
  }

  // Priority 2: For non-Claude models (API overrides), show "0%"
  if (claudeCodeInput?.oauth?.api_base_url &&
      !claudeCodeInput.oauth.api_base_url.includes("anthropic.com")) {
    return {
      primary: "0%",
      metadata: { note: "custom-api" },
      color: "good",
    };
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
