/**
 * Preferences segment - shows active preference count
 *
 * Format: [pref:N] with color based on count.
 * Uses PreferenceStore.stats() with short-lived cache.
 */

import type { Segment, SegmentData, SegmentContext, SegmentConfig, StyleConfig, SemanticColor } from "./types";
import { wrapBrackets, applyColor } from "./index";
import { PreferenceStore } from "../../../shared/preferences/store";

const CACHE_TTL_MS = 10_000;

interface CachedStats {
  globalCount: number;
  projectCount: number;
  autoInjectCount: number;
  timestamp: number;
}

let cachedStats: CachedStats | null = null;

function getPreferenceStats(context: SegmentContext): CachedStats {
  const now = Date.now();

  if (cachedStats && now - cachedStats.timestamp < CACHE_TTL_MS) {
    return cachedStats;
  }

  try {
    const store = new PreferenceStore(context.cwd);
    const stats = store.stats();

    cachedStats = {
      globalCount: stats.byScope.global,
      projectCount: stats.byScope.project,
      autoInjectCount: stats.autoInjectCount,
      timestamp: now,
    };

    return cachedStats;
  } catch {
    return { globalCount: 0, projectCount: 0, autoInjectCount: 0, timestamp: now };
  }
}

export function getActivePreferenceCount(context: SegmentContext): number {
  return getPreferenceStats(context).autoInjectCount;
}

function countToColor(count: number): SemanticColor | undefined {
  if (count <= 0) return undefined;
  if (count <= 2) return "good";
  if (count <= 5) return "warning";
  return "critical";
}

async function collectPreferencesData(context: SegmentContext): Promise<SegmentData | null> {
  try {
    const stats = getPreferenceStats(context);
    const total = stats.autoInjectCount;

    if (total === 0) return null;

    // Show global+local breakdown: "pref:2g/1p" or "pref:2g" or "pref:1p"
    const parts: string[] = [];
    if (stats.globalCount > 0) parts.push(`${stats.globalCount}g`);
    if (stats.projectCount > 0) parts.push(`${stats.projectCount}p`);
    const breakdown = parts.join("/");

    return {
      primary: `pref:${breakdown}`,
      metadata: {
        count: String(total),
      },
      color: countToColor(total),
    };
  } catch {
    return null;
  }
}

function formatPreferencesSegment(
  data: SegmentData,
  _config: SegmentConfig,
  style: StyleConfig,
): string {
  const colored = applyColor(data.primary, data.color, style);
  return wrapBrackets(colored, style);
}

export async function renderPreferencesSegment(context: SegmentContext): Promise<string> {
  const data = await collectPreferencesData(context);
  if (!data) return "";

  const defaultConfig: SegmentConfig = { enabled: true, position: 5, row: 2 };
  const defaultStyle: StyleConfig = { separator: " ", brackets: true, colors: true };

  return formatPreferencesSegment(data, defaultConfig, defaultStyle);
}

export const preferencesSegment: Segment = {
  id: "preferences",
  collect: collectPreferencesData,
  format: formatPreferencesSegment,
};
