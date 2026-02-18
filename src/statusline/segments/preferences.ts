/**
 * Preferences segment - shows active preference count
 *
 * Format: [pref:N] with color based on count.
 * Uses PreferenceStore.stats() with short-lived cache.
 */

import type { Segment, SegmentData, SegmentContext, SegmentConfig, StyleConfig, SemanticColor } from "./types";
import { wrapBrackets, applyColor } from "./index";
import { PreferenceStore } from "../../preferences/store";

const CACHE_TTL_MS = 10_000;

interface CachedCount {
  count: number;
  autoInjectCount: number;
  timestamp: number;
}

let cachedCount: CachedCount | null = null;

export function getActivePreferenceCount(context: SegmentContext): number {
  const now = Date.now();

  if (cachedCount && now - cachedCount.timestamp < CACHE_TTL_MS) {
    return cachedCount.autoInjectCount;
  }

  try {
    const store = new PreferenceStore(context.cwd);
    const stats = store.stats();

    cachedCount = {
      count: stats.total,
      autoInjectCount: stats.autoInjectCount,
      timestamp: now,
    };

    return stats.autoInjectCount;
  } catch {
    return 0;
  }
}

function countToColor(count: number): SemanticColor | undefined {
  if (count <= 0) return undefined;
  if (count <= 2) return "good";
  if (count <= 5) return "warning";
  return "critical";
}

async function collectPreferencesData(context: SegmentContext): Promise<SegmentData | null> {
  try {
    const count = getActivePreferenceCount(context);

    if (count === 0) return null;

    return {
      primary: `pref:${count}`,
      metadata: {
        count: String(count),
        newLine: "true",
      },
      color: countToColor(count),
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

  const defaultConfig: SegmentConfig = { enabled: true, position: 11 };
  const defaultStyle: StyleConfig = { separator: " ", brackets: true, colors: true };

  return formatPreferencesSegment(data, defaultConfig, defaultStyle);
}

export const preferencesSegment: Segment = {
  id: "preferences",
  collect: collectPreferencesData,
  format: formatPreferencesSegment,
};
