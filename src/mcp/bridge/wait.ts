/**
 * Bridge Wait — main-side handler for waiting on task completion via bus.
 */

import type { ToolContext, CallToolResult } from "../shared/types";
import { BUS_DEFAULT_PORT } from "../../workers/bridge/bus/types";

export async function handleBridgeWait(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<CallToolResult> {
  const { task_ids, mode, timeout_ms } = args as {
    task_ids?: string[];
    mode?: "all" | "any";
    timeout_ms?: number;
  };

  if (!task_ids || task_ids.length === 0) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "Missing required field: task_ids (non-empty array)" }) }],
      isError: true,
    };
  }

  const waitMode = mode ?? "all";
  const timeoutMs = Math.min(timeout_ms ?? 300_000, 300_000);
  const busPort = parseInt(process.env.OMC_BUS_PORT ?? String(BUS_DEFAULT_PORT), 10);

  try {
    const params = new URLSearchParams({
      tasks: task_ids.join(","),
      mode: waitMode,
      wait: "true",
      timeout: String(timeoutMs),
    });

    const resp = await fetch(`http://localhost:${busPort}/wait?${params}`, {
      signal: AbortSignal.timeout(timeoutMs + 5000),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      return {
        content: [{ type: "text", text: JSON.stringify({ error: `Bus wait failed: ${(errData as { error?: string }).error ?? resp.statusText}` }) }],
        isError: true,
      };
    }

    const data = await resp.json();
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: `bridge_wait failed: ${error instanceof Error ? error.message : String(error)}` }) }],
      isError: true,
    };
  }
}
