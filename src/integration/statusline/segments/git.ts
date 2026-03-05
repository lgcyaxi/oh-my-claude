/**
 * Git segment - shows branch name and status
 */

import { execSync } from "node:child_process";
import type { Segment, SegmentData, SegmentContext, SegmentConfig, StyleConfig } from "./types";
import { wrapBrackets, applyColor } from "./index";

/**
 * Git status indicators
 */
const GIT_INDICATORS = {
  dirty: "*",
  staged: "+",
  ahead: "↑",
  behind: "↓",
  clean: "",
} as const;

/**
 * Collect git information
 */
async function collectGitData(cwd: string): Promise<SegmentData | null> {
  try {
    // Get current branch
    const branch = execSync("git branch --show-current", {
      cwd,
      encoding: "utf-8",
      timeout: 500,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    if (!branch) {
      // Detached HEAD or not in a git repo
      return null;
    }

    // Get status (porcelain for machine parsing)
    let status = "";
    try {
      status = execSync("git status --porcelain", {
        cwd,
        encoding: "utf-8",
        timeout: 500,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      // Ignore status errors
    }

    // Check for ahead/behind
    let aheadBehind = "";
    try {
      const tracking = execSync("git rev-list --left-right --count HEAD...@{upstream}", {
        cwd,
        encoding: "utf-8",
        timeout: 500,
        stdio: ["pipe", "pipe", "ignore"], // Suppress stderr cross-platform (Windows compatible)
      }).trim();

      const [aheadStr, behindStr] = tracking.split(/\s+/);
      const ahead = Number(aheadStr) || 0;
      const behind = Number(behindStr) || 0;
      if (ahead > 0) aheadBehind += `${GIT_INDICATORS.ahead}${ahead}`;
      if (behind > 0) aheadBehind += `${GIT_INDICATORS.behind}${behind}`;
    } catch {
      // No upstream or error - ignore
    }

    // Determine dirty status
    const lines = status.split("\n").filter((l) => l.trim());
    const hasStaged = lines.some((l) => /^[MADRC]/.test(l));
    const hasUnstaged = lines.some((l) => /^.[MADRC?]/.test(l));

    let indicator = "";
    if (hasStaged) indicator += GIT_INDICATORS.staged;
    if (hasUnstaged) indicator += GIT_INDICATORS.dirty;

    // Determine color based on status
    let color: SegmentData["color"] = "good";
    if (hasUnstaged) color = "warning";
    if (lines.length > 10) color = "critical"; // Lots of changes

    const primary = `${branch}${indicator}${aheadBehind}`;

    return {
      primary,
      metadata: {
        branch,
        dirty: String(hasUnstaged),
        staged: String(hasStaged),
      },
      color,
    };
  } catch {
    // Not a git repo or git not available
    return null;
  }
}

/**
 * Format git segment for display
 */
function formatGitSegment(
  data: SegmentData,
  _config: SegmentConfig,
  style: StyleConfig
): string {
  const colored = applyColor(data.primary, data.color, style);
  return wrapBrackets(colored, style);
}

export const gitSegment: Segment = {
  id: "git",
  collect: async (context: SegmentContext) => collectGitData(context.cwd),
  format: formatGitSegment,
};
