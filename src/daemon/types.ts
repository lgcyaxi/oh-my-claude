/**
 * Core daemon types for the Multi-AI Bridge daemon layer.
 */
import type { PaneCreateOptions } from "../terminal/types";

/** Unique identifier for a queued request. */
export type RequestId = string;

/** Priority level used by daemon request scheduling. */
export type RequestPriority = "low" | "normal" | "high";

/** Runtime lifecycle status for an AI daemon instance. */
export type DaemonStatus = "stopped" | "starting" | "running" | "stopping" | "error";

/**
 * Static daemon configuration for a concrete AI implementation.
 */
export interface AIConfig {
  /** Daemon identifier (for example: codex, opencode). */
  name: string;
  /** CLI executable used by the concrete daemon. */
  cliCommand: string;
  /** Optional CLI arguments used when spawning the process. */
  cliArgs?: string[];
  /** Idle time before auto-shutdown in milliseconds. */
  idleTimeoutMs: number;
  /** Maximum time allowed for a single request in milliseconds. */
  requestTimeoutMs: number;
  /** Retry attempts after the initial request attempt fails. */
  maxRetries: number;
  /** Optional pane creation options (split direction, target pane, cwd). */
  paneCreateOptions?: PaneCreateOptions;
}

/**
 * Logical request payload submitted to a daemon.
 */
export interface Request {
  /** User-facing request message sent to the AI backend. */
  message: string;
  /** Optional context merged with the message before sending. */
  context?: string;
  /** Optional execution priority. */
  priority?: RequestPriority;
}

/**
 * Request wrapper used internally by the queue.
 */
export interface QueuedRequest {
  /** Queue item ID. */
  id: RequestId;
  /** Original request payload. */
  request: Request;
  /** Unix timestamp (ms) when queued. */
  timestamp: number;
}
