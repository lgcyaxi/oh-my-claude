/**
 * Session segment - shows session duration
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Segment, SegmentData, SegmentContext, SegmentConfig, StyleConfig } from "./types";
import { wrapBrackets, applyColor } from "./index";

/**
 * Format duration for display
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h${remainingMinutes > 0 ? ` ${remainingMinutes}m` : ""}`;
  }

  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m${remainingSeconds > 0 ? ` ${remainingSeconds}s` : ""}`;
  }

  return `${seconds}s`;
}

/**
 * Get session start time from session directory
 * Uses the creation time of the session directory or status file
 */
function getSessionStartTime(sessionDir: string): number | null {
  try {
    // Try to read from a session marker file if it exists
    const markerPath = join(sessionDir, "session-start.txt");
    if (existsSync(markerPath)) {
      const content = readFileSync(markerPath, "utf-8").trim();
      const timestamp = parseInt(content, 10);
      if (!isNaN(timestamp)) {
        return timestamp;
      }
    }

    // Fall back to directory creation time
    const stats = statSync(sessionDir);
    return stats.birthtimeMs || stats.ctimeMs;
  } catch {
    return null;
  }
}

/**
 * Collect session duration information
 */
async function collectSessionData(context: SegmentContext): Promise<SegmentData | null> {
  const { sessionDir } = context;

  if (!sessionDir || !existsSync(sessionDir)) {
    return null;
  }

  const startTime = getSessionStartTime(sessionDir);
  if (!startTime) {
    return null;
  }

  const now = Date.now();
  const duration = now - startTime;
  const formatted = formatDuration(duration);

  // Determine color based on session length
  let color: SegmentData["color"] = "neutral";
  const minutes = duration / 60000;

  if (minutes > 60) {
    color = "warning"; // Long session
  }
  if (minutes > 120) {
    color = "critical"; // Very long session
  }

  return {
    primary: formatted,
    metadata: {
      startTime: String(startTime),
      durationMs: String(duration),
    },
    color,
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
  const colored = applyColor(data.primary, data.color, style);
  return wrapBrackets(colored, style);
}

export const sessionSegment: Segment = {
  id: "session",
  collect: collectSessionData,
  format: formatSessionSegment,
};
