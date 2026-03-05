/**
 * Bridge Event — worker-side handler for posting events to the bus.
 * Only available to bridge workers (OMC_BRIDGE_PANE=1).
 */

import type { ToolContext, CallToolResult } from "../shared/types";
import { BUS_DEFAULT_PORT } from "../../workers/bridge/bus/types";
import type { BridgeEventType } from "../../workers/bridge/bus/types";

export async function handleBridgeEvent(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<CallToolResult> {
  // Guard: only available inside bridge workers
  if (process.env.OMC_BRIDGE_PANE !== "1") {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "bridge_event is only available inside bridge workers (OMC_BRIDGE_PANE=1)" }) }],
      isError: true,
    };
  }

  const { task_id, type, payload } = args as {
    task_id?: string;
    type?: BridgeEventType;
    payload?: Record<string, unknown>;
  };

  if (!task_id || !type) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "Missing required fields: task_id, type" }) }],
      isError: true,
    };
  }

  const validTypes: BridgeEventType[] = ["accepted", "progress", "completed", "failed", "log"];
  if (!validTypes.includes(type)) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: `Invalid event type: ${type}. Must be one of: ${validTypes.join(", ")}` }) }],
      isError: true,
    };
  }

  const busPort = parseInt(process.env.OMC_BUS_PORT ?? String(BUS_DEFAULT_PORT), 10);
  const workerId = process.env.OMC_BRIDGE_WORKER_ID ?? "unknown";

  try {
    const resp = await fetch(`http://localhost:${busPort}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        taskId: task_id,
        worker: workerId,
        type,
        payload: payload ?? {},
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      return {
        content: [{ type: "text", text: JSON.stringify({ error: `Bus rejected event: ${(errData as { error?: string }).error ?? resp.statusText}` }) }],
        isError: true,
      };
    }

    const data = (await resp.json()) as { seq: number; acknowledged: boolean };

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          seq: data.seq,
          acknowledged: data.acknowledged,
          task_id,
          type,
        }),
      }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: `bridge_event failed: ${error instanceof Error ? error.message : String(error)}` }) }],
      isError: true,
    };
  }
}
