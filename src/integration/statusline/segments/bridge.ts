/**
 * Bridge segment — live view of active bridge workers.
 *
 * Reads bridge-state.json to list running workers. For codex workers,
 * also reads codex-status.json to show live activity state.
 *
 * Format:  ⬆2 ⚙codex · ◈cc:2
 *   - ⚙ = codex daemon, ◈ = cc / other workers
 *   - ⟳ prefix = worker is thinking, ✗ prefix = error
 *   - · separator between workers
 *
 * Renders on row 3 (Infrastructure), no brackets — the segment
 * reads as a presence indicator rather than a status box.
 *
 * Stale-entry pruning: entries whose PID is no longer alive are filtered out.
 * Hidden when no live workers are running.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Segment, SegmentData, SegmentContext, SegmentConfig, StyleConfig } from "./types";
import { applyColor } from "./index";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AIEntry {
  name: string;
  paneId?: string;
  pid?: number;
}

interface BridgeState {
  ais: AIEntry[];
}

interface CodexStatusSignal {
  state: "idle" | "thinking" | "complete" | "error";
  updatedAt: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Canonical path matching state.ts STATE_FILE
const BRIDGE_STATE_FILE = join(homedir(), ".claude", "oh-my-claude", "bridge-state.json");
const CODEX_STATUS_FILE = join(homedir(), ".claude", "oh-my-claude", "run", "codex-status.json");

/** Resolve per-worker-type icon: ⚙ for codex, ◈ for cc and others */
function resolveWorkerIcon(baseName: string): string {
  return baseName === "codex" ? "⚙" : "◈";
}

/**
 * Check if a PID is still alive.
 * Returns true if alive or unknown (no PID, or EPERM).
 * Returns false only on ESRCH (no such process).
 */
function isAlive(pid: number | undefined): boolean {
  if (pid === undefined) return true; // no PID tracked — assume alive
  try {
    process.kill(pid, 0); // signal 0 = existence check
    return true;
  } catch (err) {
    // ESRCH = no such process → dead; EPERM = exists but no permission → alive
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function readBridgeState(): BridgeState {
  try {
    const raw = readFileSync(BRIDGE_STATE_FILE, "utf-8");
    return JSON.parse(raw) as BridgeState;
  } catch {
    return { ais: [] };
  }
}

function readCodexStatus(): CodexStatusSignal | null {
  try {
    const raw = readFileSync(CODEX_STATUS_FILE, "utf-8");
    return JSON.parse(raw) as CodexStatusSignal;
  } catch {
    return null;
  }
}

// ─── Collect ──────────────────────────────────────────────────────────────────

async function collectBridgeData(_context: SegmentContext): Promise<SegmentData | null> {
  // Bridge workers show their own identity instead of the main session's bridge overview
  if (process.env.OMC_BRIDGE_PANE === "1") {
    const workerId = process.env.OMC_BRIDGE_WORKER_ID;
    const sessionId = process.env.OMC_SESSION_ID;
    if (workerId) {
      const shortSession = sessionId ? sessionId.slice(0, 8) : null;
      const primary = shortSession
        ? `worker: ${workerId} [s:${shortSession}]`
        : `worker: ${workerId}`;
      return {
        primary,
        metadata: {},
        color: "neutral",
      };
    }
    return {
      primary: `worker`,
      metadata: {},
      color: "neutral",
    };
  }

  const state = readBridgeState();
  if (!state.ais || state.ais.length === 0) return null;

  // Prune stale entries (process died without bridge down)
  const liveAis = state.ais.filter((ai) => isAlive(ai.pid));
  if (liveAis.length === 0) return null;

  const count = liveAis.length;
  let anyThinking = false;
  let anyError = false;

  const workerParts: string[] = [];
  const codexStatus = readCodexStatus();
  const codexStatusFresh = codexStatus !== null && Date.now() - (codexStatus.updatedAt ?? 0) < 30_000;

  for (const ai of liveAis) {
    const baseName = ai.name.replace(/:.*$/, ""); // strip :2, :3 suffixes
    const icon = resolveWorkerIcon(baseName);

    if (baseName === "codex" && codexStatusFresh) {
      if (codexStatus!.state === "thinking") {
        workerParts.push(`⟳${icon}${ai.name}`);
        anyThinking = true;
      } else if (codexStatus!.state === "error") {
        workerParts.push(`✗${icon}${ai.name}`);
        anyError = true;
      } else {
        workerParts.push(`${icon}${ai.name}`);
      }
    } else {
      workerParts.push(`${icon}${ai.name}`);
    }
  }

  const primary = `⬆ ${count} ${workerParts.join(" · ")}`;
  const color = anyError ? "critical" : anyThinking ? "warning" : "good";

  return {
    primary,
    metadata: {},
    color,
  };
}

// ─── Format ───────────────────────────────────────────────────────────────────

function formatBridgeSegment(
  data: SegmentData,
  _config: SegmentConfig,
  style: StyleConfig,
): string {
  // NO wrapBrackets — bridge reads as a presence indicator, not a status box
  return applyColor(data.primary, data.color, style);
}

// ─── Export ───────────────────────────────────────────────────────────────────

export const bridgeSegment: Segment = {
  id: "bridge",
  collect: collectBridgeData,
  format: formatBridgeSegment,
};
