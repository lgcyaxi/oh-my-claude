/**
 * Mode segment - shows active session modes (ULW, Bridge)
 *
 * Reads mode.json from the session directory to determine active modes.
 * Hidden when no modes are active (no visual noise).
 *
 * Display (no brackets — icons convey semantics):
 *   - Both active → ⚡◈ ULW+BRIDGE (red/critical)
 *   - ULW only → ⚡ ULW (red/critical)
 *   - Bridge only → ◈ BRIDGE (warning/yellow)
 *   - Neither → hidden (null)
 *
 * Session-aware: extracts session ID from ANTHROPIC_BASE_URL.
 */

import type { Segment, SegmentData, SegmentContext, SegmentConfig, StyleConfig } from "./types";
import { applyColor } from "./index";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

interface ModeState {
  ulw: boolean;
  bridge: boolean;
}

/**
 * Extract session ID from ANTHROPIC_BASE_URL.
 * Matches paths like /s/{sessionId} at the end of the URL.
 */
function extractSessionId(): string | undefined {
  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  if (!baseUrl) return undefined;

  try {
    const url = new URL(baseUrl);
    const match = url.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)\/?$/);
    return match ? match[1] : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Read mode.json from the session directory.
 */
function readModeState(sessionId: string): ModeState | null {
  try {
    const modePath = join(
      homedir(),
      ".claude",
      "oh-my-claude",
      "sessions",
      sessionId,
      "mode.json"
    );
    if (!existsSync(modePath)) return null;

    const content = readFileSync(modePath, "utf-8");
    const state = JSON.parse(content) as Partial<ModeState>;
    return {
      ulw: !!state.ulw,
      bridge: !!state.bridge,
    };
  } catch {
    return null;
  }
}

/**
 * Collect mode data
 */
async function collectModeData(_context: SegmentContext): Promise<SegmentData | null> {
  try {
    const sessionId = extractSessionId();
    if (!sessionId) return null;

    const state = readModeState(sessionId);
    if (!state) return null;

    const { ulw, bridge } = state;

    // Hidden when no modes are active
    if (!ulw && !bridge) return null;

    let label: string;
    let color: SegmentData["color"];

    if (ulw && bridge) {
      label = "⚡◈ ULW+BRIDGE";
      color = "critical";
    } else if (ulw) {
      label = "⚡ ULW";
      color = "critical";
    } else {
      label = "◈ BRIDGE";
      color = "warning";
    }

    return {
      primary: label,
      metadata: {},
      color,
    };
  } catch {
    return null;
  }
}

/**
 * Format mode segment for display
 */
function formatModeSegment(
  data: SegmentData,
  _config: SegmentConfig,
  style: StyleConfig
): string {
  // No brackets — icon prefix (⚡ / ◈) provides visual identity without wrapping
  return applyColor(data.primary, data.color, style);
}

export const modeSegment: Segment = {
  id: "mode",
  collect: collectModeData,
  format: formatModeSegment,
};
