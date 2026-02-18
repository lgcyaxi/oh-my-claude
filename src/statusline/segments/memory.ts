/**
 * Memory segment - shows memory store count
 *
 * Displays the total number of stored memories.
 * Uses getMemoryStats() from the memory module.
 */

import type { Segment, SegmentData, SegmentContext, SegmentConfig, StyleConfig } from "./types";
import { wrapBrackets, applyColor } from "./index";
import { getMemoryStats } from "../../memory";

/**
 * Collect memory data
 */
async function collectMemoryData(_context: SegmentContext): Promise<SegmentData | null> {
  try {
    const stats = getMemoryStats();
    const total = stats.total;

    return {
      primary: `mem:${total}`,
      metadata: {
        total: String(total),
        notes: String(stats.byType.note),
        sessions: String(stats.byType.session),
        newLine: "true",
      },
      color: total > 0 ? "good" : "neutral",
    };
  } catch {
    return null;
  }
}

/**
 * Format memory segment for display
 */
function formatMemorySegment(
  data: SegmentData,
  _config: SegmentConfig,
  style: StyleConfig
): string {
  const colored = applyColor(data.primary, data.color, style);
  return wrapBrackets(colored, style);
}

export const memorySegment: Segment = {
  id: "memory",
  collect: collectMemoryData,
  format: formatMemorySegment,
};
