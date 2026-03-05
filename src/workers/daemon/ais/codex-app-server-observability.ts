/**
 * Observability for codex app-server daemon.
 *
 * Two outputs:
 *   1. Activity log  — JSONL append-only file, human-readable via `omc m codex log`
 *   2. Status signal — Atomic JSON file read by the statusline codex segment
 *
 * Both writes are fire-and-forget: errors are silently swallowed so the daemon
 * is never interrupted by I/O failures on observability paths.
 */

import { appendFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActivityEntryType = "session_start" | "user_turn" | "agent_message" | "task_complete" | "error";
type SignalState = "idle" | "thinking" | "complete" | "error";

// ─── Observability ────────────────────────────────────────────────────────────

/**
 * Provides activity logging and live status signalling for a codex daemon instance.
 *
 * Both paths are resolved in the daemon constructor and injected here so this
 * class has no knowledge of the home directory layout.
 */
export class CodexObservability {
  constructor(
    private readonly activityLogPath: string,
    private readonly statusSignalPath: string,
  ) {}

  /**
   * Append a structured entry to the JSONL activity log.
   * The `model` field is optional — callers pass undefined when unknown.
   * Never throws.
   */
  writeActivityLog(type: ActivityEntryType, content: string, model?: string): void {
    try {
      const entry: Record<string, unknown> = {
        ts: new Date().toISOString(),
        type,
        content,
      };
      if (model) entry.model = model;
      mkdirSync(dirname(this.activityLogPath), { recursive: true });
      appendFileSync(this.activityLogPath, JSON.stringify(entry) + "\n", "utf8");
    } catch {
      // Never throw from logging
    }
  }

  /**
   * Atomically write the current daemon state to the status signal file (tmp + rename).
   * The statusline segment reads this file on every render cycle.
   * Never throws.
   */
  writeStatusSignal(state: SignalState, tool?: string, model?: string): void {
    try {
      const signal: Record<string, unknown> = {
        state,
        updatedAt: Date.now(),
      };
      if (tool) signal.tool = tool;
      if (model) signal.model = model;
      const tmp = this.statusSignalPath + ".tmp";
      mkdirSync(dirname(this.statusSignalPath), { recursive: true });
      writeFileSync(tmp, JSON.stringify(signal), "utf8");
      renameSync(tmp, this.statusSignalPath);
    } catch {
      // Never throw from signal writes
    }
  }
}
