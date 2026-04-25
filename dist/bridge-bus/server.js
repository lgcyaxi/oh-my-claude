#!/usr/bin/env bun
// @bun

// src/workers/bridge/bus/store.ts
import { randomUUID } from "crypto";

class BusStore {
  tasks = new Map;
  events = [];
  seq = 0;
  createTask(worker, mandate, sessionId) {
    const task = {
      taskId: randomUUID(),
      worker,
      sessionId,
      mandate,
      status: "queued",
      createdAt: new Date().toISOString()
    };
    this.tasks.set(task.taskId, task);
    return task;
  }
  getTasksForWorker(worker, sessionId) {
    return Array.from(this.tasks.values()).filter((t) => t.worker === worker && t.status === "queued" && (sessionId ? t.sessionId === sessionId : true));
  }
  appendEvent(event) {
    const fullEvent = {
      ...event,
      seq: ++this.seq
    };
    this.events.push(fullEvent);
    const task = this.tasks.get(event.taskId);
    if (task) {
      const statusMap = {
        accepted: "accepted",
        progress: "working",
        completed: "completed",
        failed: "failed",
        log: task.status
      };
      task.status = statusMap[event.type];
      if (event.type === "completed") {
        task.completedAt = event.timestamp;
        task.result = event.payload;
      }
      if (event.type === "failed") {
        task.completedAt = event.timestamp;
        task.error = event.payload.error ?? "Unknown error";
      }
    }
    return fullEvent;
  }
  getEventsAfter(afterSeq, taskIds) {
    let filtered = this.events.filter((e) => e.seq > afterSeq);
    if (taskIds && taskIds.length > 0) {
      const idSet = new Set(taskIds);
      filtered = filtered.filter((e) => idSet.has(e.taskId));
    }
    return filtered;
  }
  getTask(id) {
    return this.tasks.get(id);
  }
  getAllTasks() {
    return Array.from(this.tasks.values());
  }
  getStatus() {
    const workers = {};
    for (const task of this.tasks.values()) {
      if (!workers[task.worker]) {
        workers[task.worker] = { pending: 0, active: 0 };
      }
      if (task.status === "queued") {
        workers[task.worker].pending++;
      } else if (task.status === "accepted" || task.status === "working") {
        workers[task.worker].active++;
      }
    }
    return {
      taskCount: this.tasks.size,
      eventCount: this.events.length,
      workers
    };
  }
  getSeq() {
    return this.seq;
  }
}

// src/workers/bridge/bus/types.ts
var BUS_DEFAULT_PORT = 18912;

// src/workers/bridge/bus/server.ts
function parseArgs() {
  const args = process.argv.slice(2);
  let port = BUS_DEFAULT_PORT;
  for (let i = 0;i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      i++;
    }
  }
  return { port };
}
var CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type"
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS }
  });
}
function errorResponse(message, status = 400) {
  return json({ error: message }, status);
}
async function longPoll(checkFn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const interval = 500;
  while (Date.now() < deadline) {
    const result = checkFn();
    if (result !== null)
      return result;
    await new Promise((r) => setTimeout(r, interval));
  }
  return checkFn();
}
async function main() {
  const { port } = parseArgs();
  const store = new BusStore;
  const startedAt = Date.now();
  let shutdownFn = null;
  const server = Bun.serve({
    port,
    idleTimeout: 255,
    async fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      if (pathname === "/tasks" && req.method === "POST") {
        try {
          const body = await req.json();
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
      if (pathname.startsWith("/tasks/") && req.method === "GET") {
        const workerId = decodeURIComponent(pathname.slice("/tasks/".length));
        if (!workerId) {
          return errorResponse("Missing workerId in path");
        }
        const wait = url.searchParams.get("wait") === "true";
        const timeoutMs = parseInt(url.searchParams.get("timeout") ?? "30000", 10);
        const sessionFilter = url.searchParams.get("session") ?? undefined;
        if (wait) {
          const tasks2 = await longPoll(() => {
            const pending = store.getTasksForWorker(workerId, sessionFilter);
            return pending.length > 0 ? pending : null;
          }, Math.min(timeoutMs, 60000));
          return json({ tasks: tasks2 ?? [], count: tasks2?.length ?? 0 });
        }
        const tasks = store.getTasksForWorker(workerId, sessionFilter);
        return json({ tasks, count: tasks.length });
      }
      if (pathname === "/events" && req.method === "POST") {
        try {
          const body = await req.json();
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
            payload: body.payload ?? {}
          });
          return json({ seq: event.seq, acknowledged: true });
        } catch (e) {
          return errorResponse(`Invalid request body: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (pathname === "/events" && req.method === "GET") {
        const afterSeq = parseInt(url.searchParams.get("after") ?? "0", 10);
        const taskIdsParam = url.searchParams.get("tasks");
        const taskIds = taskIdsParam ? taskIdsParam.split(",") : undefined;
        const wait = url.searchParams.get("wait") === "true";
        const timeoutMs = parseInt(url.searchParams.get("timeout") ?? "30000", 10);
        if (wait) {
          const events2 = await longPoll(() => {
            const found = store.getEventsAfter(afterSeq, taskIds);
            return found.length > 0 ? found : null;
          }, Math.min(timeoutMs, 60000));
          return json({ events: events2 ?? [], lastSeq: store.getSeq() });
        }
        const events = store.getEventsAfter(afterSeq, taskIds);
        return json({ events, lastSeq: store.getSeq() });
      }
      if (pathname === "/wait" && req.method === "GET") {
        const taskIdsParam = url.searchParams.get("tasks");
        if (!taskIdsParam) {
          return errorResponse("Missing required query param: tasks");
        }
        const taskIds = taskIdsParam.split(",");
        const mode = url.searchParams.get("mode") ?? "all";
        const timeoutMs = parseInt(url.searchParams.get("timeout") ?? "300000", 10);
        const maxTimeout = Math.min(timeoutMs, 300000);
        const result = await longPoll(() => {
          const tasks = taskIds.map((id) => store.getTask(id)).filter(Boolean);
          const terminal = tasks.filter((t) => t.status === "completed" || t.status === "failed");
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
            pending: result.pending
          });
        }
        const currentTasks = taskIds.map((id) => store.getTask(id)).filter(Boolean);
        return json({
          done: false,
          mode,
          tasks: currentTasks,
          pending: currentTasks.filter((t) => t.status !== "completed" && t.status !== "failed").length,
          timeout: true
        });
      }
      if (pathname === "/health" && req.method === "GET") {
        const status = store.getStatus();
        return json({
          status: "ok",
          uptime: Math.floor((Date.now() - startedAt) / 1000),
          taskCount: status.taskCount,
          eventCount: status.eventCount,
          port
        });
      }
      if (pathname === "/status" && req.method === "GET") {
        const status = store.getStatus();
        return json({
          tasks: store.getAllTasks(),
          events: store.getEventsAfter(0),
          workers: status.workers
        });
      }
      if (pathname === "/stop" && req.method === "POST") {
        if (shutdownFn) {
          setTimeout(shutdownFn, 100);
        }
        return json({ stopped: true });
      }
      return errorResponse(`Not found: ${pathname}`, 404);
    },
    error(error) {
      console.error(`[bus] Server error: ${error.message}`);
      return json({ error: error.message }, 500);
    }
  });
  const shutdown = () => {
    console.error(`
[bus] Shutting down...`);
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
