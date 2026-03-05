/**
 * Bridge Dispatch — main-side handler for dispatching tasks to workers via bus.
 */

import type { ToolContext, CallToolResult } from "../shared/types";
import type { Mandate } from "../../workers/bridge/bus/types";
import { BUS_DEFAULT_PORT } from "../../workers/bridge/bus/types";
import { ensureBusRunning } from "../../workers/bridge/bus/lifecycle";

export async function handleBridgeDispatch(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<CallToolResult> {
  const { worker, mandate } = args as {
    worker?: string;
    mandate?: Mandate;
  };

  if (!worker) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "Missing required field: worker" }) }],
      isError: true,
    };
  }

  if (!mandate || !mandate.role || !mandate.scope || !mandate.goal || !mandate.acceptance) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "Mandate must include: role, scope, goal, acceptance" }) }],
      isError: true,
    };
  }

  try {
    // Ensure bus is running
    const busPort = parseInt(process.env.OMC_BUS_PORT ?? String(BUS_DEFAULT_PORT), 10);
    await ensureBusRunning(busPort);

    // POST /tasks to bus (session-scoped for multi-session isolation)
    const sessionId = ctx.getSessionId();
    const resp = await fetch(`http://localhost:${busPort}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ worker, mandate, session: sessionId }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      return {
        content: [{ type: "text", text: JSON.stringify({ error: `Bus rejected task: ${(errData as { error?: string }).error ?? resp.statusText}` }) }],
        isError: true,
      };
    }

    const data = (await resp.json()) as { taskId: string; worker: string; status: string };

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          dispatched: true,
          taskId: data.taskId,
          worker: data.worker,
          status: data.status,
          bus_port: busPort,
        }),
      }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: `bridge_dispatch failed: ${error instanceof Error ? error.message : String(error)}` }) }],
      isError: true,
    };
  }
}
