/**
 * Bridge Bus Types — foundation types for the bus event broker.
 * Zero external dependencies.
 */

/** Default port for the Bridge Bus SSE server */
export const BUS_DEFAULT_PORT = 18912;

/**
 * Structured task mandate describing what a worker should do.
 */
export interface Mandate {
  /** Worker role (e.g., "code", "audit", "docs", "design") */
  role: string;
  /** Task scope — what files/components/areas this task covers */
  scope: string;
  /** Goal — what the worker should accomplish */
  goal: string;
  /** Acceptance criteria — how to know the task is done */
  acceptance: string;
  /** Optional additional context */
  context?: string;
}

/**
 * Result payload returned by a worker upon task completion.
 */
export interface TaskResult {
  /** Summary message describing what was done */
  message: string;
  /** Files modified or created */
  files?: string[];
  /** Arbitrary structured data */
  data?: Record<string, unknown>;
}

/** Task lifecycle status */
export type TaskStatus = "queued" | "accepted" | "working" | "completed" | "failed";

/**
 * A task dispatched to a worker via the bus.
 */
export interface BridgeTask {
  /** Unique task identifier */
  taskId: string;
  /** Target worker name (e.g., "cc:zp", "cc:ds") */
  worker: string;
  /** Session ID that dispatched this task (for multi-session isolation) */
  sessionId?: string;
  /** Structured mandate for the worker */
  mandate: Mandate;
  /** Current task status */
  status: TaskStatus;
  /** ISO timestamp when the task was created */
  createdAt: string;
  /** ISO timestamp when the task was completed (or failed) */
  completedAt?: string;
  /** Task result (populated on completion) */
  result?: TaskResult;
  /** Error message (populated on failure) */
  error?: string;
}

/** Event types emitted by workers */
export type BridgeEventType = "accepted" | "progress" | "completed" | "failed" | "log";

/**
 * An event emitted by a worker during task execution.
 */
export interface BridgeEvent {
  /** Auto-incrementing sequence number */
  seq: number;
  /** Task this event belongs to */
  taskId: string;
  /** Worker that emitted this event */
  worker: string;
  /** Event type */
  type: BridgeEventType;
  /** ISO timestamp */
  timestamp: string;
  /** Event-specific payload */
  payload: Record<string, unknown>;
}

/**
 * Health response from the bus server.
 */
export interface BusHealthResponse {
  status: "ok";
  uptime: number;
  taskCount: number;
  eventCount: number;
  port: number;
}

/**
 * Status response from the bus server — full store dump.
 */
export interface BusStatusResponse {
  tasks: BridgeTask[];
  events: BridgeEvent[];
  workers: Record<string, { pending: number; active: number }>;
}
