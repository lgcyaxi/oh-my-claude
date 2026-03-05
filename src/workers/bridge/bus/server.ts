#!/usr/bin/env bun
/**
 * Bridge Bus Server — standalone Bun.serve HTTP server for task/event brokering.
 *
 * Acts as a reliable, terminal-agnostic alternative to pane-based bridge communication.
 * Workers poll for tasks, post events; main CC instance dispatches tasks and waits for results.
 *
 * Usage:
 *   bun run src/workers/bridge/bus/server.ts
 *   bun run src/workers/bridge/bus/server.ts --port 18912
 */

import { BusStore } from "./store";
import { BUS_DEFAULT_PORT } from "./types";
import type { BridgeEventType, Mandate } from "./types";

// ── CLI args ────────────────────────────────────────────────────────────────

function parseArgs(): { port: number } {
  const args = process.argv.slice(2);
  let port = BUS_DEFAULT_PORT;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) {
      port = parseInt(args[i + 1]!, 10);
      i++;
    }
  }

  return { port };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

function errorResponse(message: string, status = 400): Response {
  return json({ error: message }, status);
}

/**
 * Long-poll helper: polls a check function at 500ms intervals until
 * it returns a truthy value or the deadline expires.
 */
async function longPoll<T>(
  checkFn: () => T | null,
  timeoutMs: number,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  const interval = 500;

  while (Date.now() < deadline) {
    const result = checkFn();
    if (result !== null) return result;
    await new Promise((r) => setTimeout(r, interval));
  }

  return checkFn(); // final check
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { port } = parseArgs();
  const store = new BusStore();
  const startedAt = Date.now();

  let shutdownFn: (() => void) | null = null;

  const server = Bun.serve({
    port,
    idleTimeout: 255,
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);
      const pathname = url.pathname;

      // CORS preflight
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      // ── POST /tasks — dispatch a task ───────────────────────────────
      if (pathname === "/tasks" && req.method === "POST") {
        try {
          const body = (await req.json()) as { worker?: string; mandate?: Mandate; session?: string };
          if (!body.worker || !body.mandate) {
            return errorResponse("Missing required fields: worker, mandate");
          }
          if (!body.mandate.role || !body.mandate.scope || !body.mandate.goal || !body.mandate.acceptance) {
            return errorResponse("Mandate must include: role, scope, goal, acceptance");
          }
          const task = store.createTask(body.worker, body.mandate, body.session);
          return json({ taskId: task.taskId, worker: task.worker, status: task.status, session: task.sessionId });
        } catch (e) {
          return errorResponse(`Invalid request body: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // ── GET /tasks/:workerId — worker inbox ────────────────────────
      if (pathname.startsWith("/tasks/") && req.method === "GET") {
        const workerId = decodeURIComponent(pathname.slice("/tasks/".length));
        if (!workerId) {
          return errorResponse("Missing workerId in path");
        }

        const wait = url.searchParams.get("wait") === "true";
        const timeoutMs = parseInt(url.searchParams.get("timeout") ?? "30000", 10);
        const sessionFilter = url.searchParams.get("session") ?? undefined;

        if (wait) {
          const tasks = await longPoll(() => {
            const pending = store.getTasksForWorker(workerId, sessionFilter);
            return pending.length > 0 ? pending : null;
          }, Math.min(timeoutMs, 60_000));
          return json({ tasks: tasks ?? [], count: tasks?.length ?? 0 });
        }

        const tasks = store.getTasksForWorker(workerId, sessionFilter);
        return json({ tasks, count: tasks.length });
      }

      // ── POST /events — worker posts an event ───────────────────────
      if (pathname === "/events" && req.method === "POST") {
        try {
          const body = (await req.json()) as {
            taskId?: string;
            worker?: string;
            type?: BridgeEventType;
            payload?: Record<string, unknown>;
          };

          if (!body.taskId || !body.worker || !body.type) {
            return errorResponse("Missing required fields: taskId, worker, type");
          }

          const task = store.getTask(body.taskId);
          if (!task) {
            return errorResponse(`Task not found: ${body.taskId}`, 404);
          }

          const event = store.appendEvent({
            taskId: body.taskId,
            worker: body.worker,
            type: body.type,
            timestamp: new Date().toISOString(),
            payload: body.payload ?? {},
          });

          return json({ seq: event.seq, acknowledged: true });
        } catch (e) {
          return errorResponse(`Invalid request body: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // ── GET /events — main subscribes to events ────────────────────
      if (pathname === "/events" && req.method === "GET") {
        const afterSeq = parseInt(url.searchParams.get("after") ?? "0", 10);
        const taskIdsParam = url.searchParams.get("tasks");
        const taskIds = taskIdsParam ? taskIdsParam.split(",") : undefined;
        const wait = url.searchParams.get("wait") === "true";
        const timeoutMs = parseInt(url.searchParams.get("timeout") ?? "30000", 10);

        if (wait) {
          const events = await longPoll(() => {
            const found = store.getEventsAfter(afterSeq, taskIds);
            return found.length > 0 ? found : null;
          }, Math.min(timeoutMs, 60_000));
          return json({ events: events ?? [], lastSeq: store.getSeq() });
        }

        const events = store.getEventsAfter(afterSeq, taskIds);
        return json({ events, lastSeq: store.getSeq() });
      }

      // ── GET /wait — block until tasks complete ─────────────────────
      if (pathname === "/wait" && req.method === "GET") {
        const taskIdsParam = url.searchParams.get("tasks");
        if (!taskIdsParam) {
          return errorResponse("Missing required query param: tasks");
        }
        const taskIds = taskIdsParam.split(",");
        const mode = (url.searchParams.get("mode") ?? "all") as "all" | "any";
        const timeoutMs = parseInt(url.searchParams.get("timeout") ?? "300000", 10);
        const maxTimeout = Math.min(timeoutMs, 300_000);

        const result = await longPoll(() => {
          const tasks = taskIds.map((id) => store.getTask(id)).filter(Boolean);
          const terminal = tasks.filter((t) => t!.status === "completed" || t!.status === "failed");

          if (mode === "any" && terminal.length > 0) {
            return { completed: terminal, pending: tasks.length - terminal.length };
          }
          if (mode === "all" && terminal.length === taskIds.length) {
            return { completed: terminal, pending: 0 };
          }
          return null;
        }, maxTimeout);

        if (result) {
          return json({
            done: true,
            mode,
            tasks: result.completed,
            pending: result.pending,
          });
        }

        // Timeout — return current state
        const currentTasks = taskIds.map((id) => store.getTask(id)).filter(Boolean);
        return json({
          done: false,
          mode,
          tasks: currentTasks,
          pending: currentTasks.filter((t) => t!.status !== "completed" && t!.status !== "failed").length,
          timeout: true,
        });
      }

      // ── GET /health ────────────────────────────────────────────────
      if (pathname === "/health" && req.method === "GET") {
        const status = store.getStatus();
        return json({
          status: "ok",
          uptime: Math.floor((Date.now() - startedAt) / 1000),
          taskCount: status.taskCount,
          eventCount: status.eventCount,
          port,
        });
      }

      // ── GET /status — full store dump ──────────────────────────────
      if (pathname === "/status" && req.method === "GET") {
        const status = store.getStatus();
        return json({
          tasks: store.getAllTasks(),
          events: store.getEventsAfter(0),
          workers: status.workers,
        });
      }

      // ── POST /stop — graceful shutdown ─────────────────────────────
      if (pathname === "/stop" && req.method === "POST") {
        if (shutdownFn) {
          // Defer shutdown so the response is sent first
          setTimeout(shutdownFn, 100);
        }
        return json({ stopped: true });
      }

      return errorResponse(`Not found: ${pathname}`, 404);
    },
    error(error: Error): Response {
      console.error(`[bus] Server error: ${error.message}`);
      return json({ error: error.message }, 500);
    },
  });

  const shutdown = () => {
    console.error("\n[bus] Shutting down...");
    server.stop();
    process.exit(0);
  };

  shutdownFn = shutdown;
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.error("oh-my-claude Bridge Bus Server");
  console.error(`  Bus: http://localhost:${server.port}`);
  console.error("");
}

main().catch((error) => {
  console.error("Failed to start bus server:", error);
  process.exit(1);
});
