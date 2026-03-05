/**
 * Bridge Bus Store — pure in-memory store for tasks and events.
 * No I/O, no dependencies beyond types.
 */

import { randomUUID } from "node:crypto";
import type {
  BridgeTask,
  BridgeEvent,
  BridgeEventType,
  Mandate,
  TaskResult,
  TaskStatus,
} from "./types";

export class BusStore {
  private tasks = new Map<string, BridgeTask>();
  private events: BridgeEvent[] = [];
  private seq = 0;

  /**
   * Create a new task and enqueue it for a worker.
   * Optional sessionId scopes the task to the dispatching CC session.
   */
  createTask(worker: string, mandate: Mandate, sessionId?: string): BridgeTask {
    const task: BridgeTask = {
      taskId: randomUUID(),
      worker,
      sessionId,
      mandate,
      status: "queued",
      createdAt: new Date().toISOString(),
    };
    this.tasks.set(task.taskId, task);
    return task;
  }

  /**
   * Get queued (inbox) tasks for a specific worker.
   * When sessionId is provided, only returns tasks from that session.
   */
  getTasksForWorker(worker: string, sessionId?: string): BridgeTask[] {
    return Array.from(this.tasks.values()).filter(
      (t) => t.worker === worker && t.status === "queued" &&
        (sessionId ? t.sessionId === sessionId : true),
    );
  }

  /**
   * Append an event and update the associated task status.
   */
  appendEvent(event: Omit<BridgeEvent, "seq">): BridgeEvent {
    const fullEvent: BridgeEvent = {
      ...event,
      seq: ++this.seq,
    };
    this.events.push(fullEvent);

    // Update task status based on event type
    const task = this.tasks.get(event.taskId);
    if (task) {
      const statusMap: Record<BridgeEventType, TaskStatus> = {
        accepted: "accepted",
        progress: "working",
        completed: "completed",
        failed: "failed",
        log: task.status, // log events don't change status
      };

      task.status = statusMap[event.type];

      if (event.type === "completed") {
        task.completedAt = event.timestamp;
        task.result = event.payload as unknown as TaskResult;
      }

      if (event.type === "failed") {
        task.completedAt = event.timestamp;
        task.error = (event.payload as { error?: string }).error ?? "Unknown error";
      }
    }

    return fullEvent;
  }

  /**
   * Get events after a given sequence number, optionally filtered by task IDs.
   */
  getEventsAfter(afterSeq: number, taskIds?: string[]): BridgeEvent[] {
    let filtered = this.events.filter((e) => e.seq > afterSeq);
    if (taskIds && taskIds.length > 0) {
      const idSet = new Set(taskIds);
      filtered = filtered.filter((e) => idSet.has(e.taskId));
    }
    return filtered;
  }

  /**
   * Get a task by ID.
   */
  getTask(id: string): BridgeTask | undefined {
    return this.tasks.get(id);
  }

  /**
   * Get all tasks.
   */
  getAllTasks(): BridgeTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get store summary for health/status endpoints.
   */
  getStatus(): { taskCount: number; eventCount: number; workers: Record<string, { pending: number; active: number }> } {
    const workers: Record<string, { pending: number; active: number }> = {};

    for (const task of this.tasks.values()) {
      if (!workers[task.worker]) {
        workers[task.worker] = { pending: 0, active: 0 };
      }
      if (task.status === "queued") {
        workers[task.worker]!.pending++;
      } else if (task.status === "accepted" || task.status === "working") {
        workers[task.worker]!.active++;
      }
    }

    return {
      taskCount: this.tasks.size,
      eventCount: this.events.length,
      workers,
    };
  }

  /**
   * Get current sequence number.
   */
  getSeq(): number {
    return this.seq;
  }
}
