import { EventEmitter } from "node:events";

import type { DaemonStatus, RequestId } from "./types";

/** Payload emitted when a queued request produces a response. */
export interface DaemonResponseEvent {
  id: RequestId;
  response: string;
  timestamp: number;
}

/** Payload emitted when request processing fails. */
export interface DaemonErrorEvent {
  id: RequestId;
  error: unknown;
  attempt: number;
  maxAttempts: number;
  timestamp: number;
}

/** Payload emitted when daemon lifecycle status changes. */
export interface DaemonStatusEvent {
  previousStatus: DaemonStatus;
  status: DaemonStatus;
  timestamp: number;
}

/** Event map for daemon communication. */
export interface AIDaemonEventMap {
  response: DaemonResponseEvent;
  error: DaemonErrorEvent;
  status: DaemonStatusEvent;
}

/**
 * Typed event bridge for daemon communication.
 *
 * This keeps the runtime implementation on top of Node's EventEmitter while
 * preserving strict type safety for event names and payloads.
 */
export class DaemonEventBus {
  private readonly emitter = new EventEmitter();

  /** Subscribe to daemon events. */
  on<K extends keyof AIDaemonEventMap>(
    event: K,
    listener: (payload: AIDaemonEventMap[K]) => void,
  ): this {
    this.emitter.on(event, listener);
    return this;
  }

  /** Subscribe once to a daemon event. */
  once<K extends keyof AIDaemonEventMap>(
    event: K,
    listener: (payload: AIDaemonEventMap[K]) => void,
  ): this {
    this.emitter.once(event, listener);
    return this;
  }

  /** Unsubscribe from daemon events. */
  off<K extends keyof AIDaemonEventMap>(
    event: K,
    listener: (payload: AIDaemonEventMap[K]) => void,
  ): this {
    this.emitter.off(event, listener);
    return this;
  }

  /** Emit a typed daemon event. */
  emit<K extends keyof AIDaemonEventMap>(event: K, payload: AIDaemonEventMap[K]): boolean {
    return this.emitter.emit(event, payload);
  }

  /** Remove all listeners for a single event or for every event. */
  removeAllListeners(event?: keyof AIDaemonEventMap): this {
    if (event) {
      this.emitter.removeAllListeners(event);
      return this;
    }

    this.emitter.removeAllListeners();
    return this;
  }
}
