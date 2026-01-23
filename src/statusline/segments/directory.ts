/**
 * Directory segment - shows project name (current directory basename)
 */

import { basename } from "node:path";
import type { Segment, SegmentData, SegmentContext, SegmentConfig, StyleConfig } from "./types";
import { wrapBrackets, applyColor } from "./index";

/**
 * Collect directory information
 * Shows only the project name (basename) for compact display
 */
async function collectDirectoryData(context: SegmentContext): Promise<SegmentData | null> {
  const { cwd } = context;

  if (!cwd) {
    return null;
  }

  const projectName = basename(cwd);

  return {
    primary: projectName,
    metadata: {
      full: cwd,
      project: projectName,
    },
    color: "neutral",
  };
}

/**
 * Format directory segment for display
 */
function formatDirectorySegment(
  data: SegmentData,
  _config: SegmentConfig,
  style: StyleConfig
): string {
  const colored = applyColor(data.primary, data.color, style);
  return wrapBrackets(colored, style);
}

export const directorySegment: Segment = {
  id: "directory",
  collect: collectDirectoryData,
  format: formatDirectorySegment,
};
