import { mkdir, rm } from "node:fs/promises";

import type { AIDaemon, AIConfig, Request } from "../daemon";
import type { AIDaemonEventMap, RequestId } from "../daemon";
import { DaemonRegistry } from "./registry";
import type {
  BridgeConfig,
  BridgeOrchestrator,
  BridgeResponse,
  HealthStatus,
  RequestInfo,
  RequestStatus,
  SystemStatus,
} from "./types";

interface DaemonListenerSet {
  response: (payload: AIDaemonEventMap["response"]) => void;
  error: (payload: AIDaemonEventMap["error"]) => void;
  status: (payload: AIDaemonEventMap["status"]) => void;
}

/**
 * Bridge core orchestrator implementation for coordinating multiple AI daemons.
 */
export class BridgeOrchestratorImpl implements BridgeOrchestrator {
  private readonly registry = new DaemonRegistry();
  private readonly requests = new Map<RequestId, RequestInfo>();
  private readonly listeners = new Map<string, DaemonListenerSet>();

  private running = false;
  private startPromise: Promise<void> | null = null;
  private stopPromise: Promise<void> | null = null;
  private signalHandlersBound = false;

  private readonly onSigInt = () => {
    void this.stop();
  };

  private readonly onSigTerm = () => {
    void this.stop();
  };

  constructor(private readonly config: BridgeConfig) {}

  /**
   * Initialize runtime directory, signal handlers, and configured AI daemons.
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    if (this.startPromise) {
      await this.startPromise;
      return;
    }

    this.startPromise = (async () => {
      await mkdir(this.config.runDir, { recursive: true });
      this.bindSignalHandlers();

      try {
        for (const aiConfig of this.config.ais) {
          await this.registerAI(aiConfig);
        }
      } catch (error) {
        await this.registry.stopAll();
        this.unbindSignalHandlers();
        throw error;
      }

      this.running = true;
    })();

    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  /**
   * Stop all daemons, complete pending requests with shutdown errors, and cleanup.
   */
  async stop(): Promise<void> {
    if (this.stopPromise) {
      await this.stopPromise;
      return;
    }

    this.stopPromise = (async () => {
      const daemonNames = this.listAIs().map((status) => status.name);

      for (const name of daemonNames) {
        await this.unregisterAI(name);
      }

      const completedAt = new Date();
      for (const info of this.requests.values()) {
        if (info.status === "completed" || info.status === "error") {
          continue;
        }

        info.status = "error";
        info.completedAt = completedAt;
        info.error = new Error("Bridge orchestrator stopped before request completion");
      }

      await rm(this.config.runDir, { recursive: true, force: true });
      this.unbindSignalHandlers();
      this.running = false;
    })();

    try {
      await this.stopPromise;
    } finally {
      this.stopPromise = null;
    }
  }

  /**
   * Create and start a daemon instance, then register it with listeners.
   */
  async registerAI(config: AIConfig): Promise<AIDaemon> {
    const name = config.name;

    if (this.registry.has(name)) {
      throw new Error(`AI daemon already registered: ${name}`);
    }

    // Support suffixed names (e.g., "cc:2" → factory lookup by "cc")
    const baseName = name.includes(":") ? name.slice(0, name.indexOf(":")) : name;
    const factory = this.config.daemonFactories[name] ?? this.config.daemonFactories[baseName];
    if (!factory) {
      throw new Error(`No daemon factory registered for AI: ${name}`);
    }

    const daemon = await factory(config);
    await daemon.start();
    this.registry.register(name, daemon);
    this.attachDaemonListeners(name, daemon);

    return daemon;
  }

  /**
   * Remove daemon listeners, stop daemon process, and unregister the instance.
   */
  async unregisterAI(name: string): Promise<void> {
    const daemon = this.registry.get(name);
    if (!daemon) {
      return;
    }

    this.detachDaemonListeners(name, daemon);
    await this.registry.unregister(name, { stop: true });

    const now = new Date();
    for (const info of this.requests.values()) {
      if (info.aiName !== name || info.status === "completed" || info.status === "error") {
        continue;
      }

      info.status = "error";
      info.error = new Error(`AI daemon unregistered before completion: ${name}`);
      info.completedAt = now;
    }
  }

  /**
   * Return current statuses for all registered daemons.
   */
  listAIs() {
    return this.registry.listStatuses();
  }

  /**
   * Queue a request for a named daemon and start request tracking.
   */
  async delegate(aiName: string, request: Request): Promise<RequestId> {
    const daemon = this.registry.getOrThrow(aiName);
    const requestId = await daemon.queueRequest(request);

    // Always start as "queued" — the daemon's processQueue will transition
    // to "processing" via status events. Checking queue length after adding
    // is racey since processQueue runs async.
    const now = new Date();

    this.requests.set(requestId, {
      id: requestId,
      aiName,
      request,
      status: "queued",
      createdAt: now,
    });

    this.registry.markActivity(aiName, now);
    return requestId;
  }

  /**
   * Return the latest request status for a request id.
   */
  checkStatus(requestId: RequestId): RequestStatus {
    return this.requests.get(requestId)?.status ?? "unknown";
  }

  /**
   * Return response payload only when request has completed successfully.
   */
  async getResponse(requestId: RequestId): Promise<BridgeResponse | null> {
    const info = this.requests.get(requestId);
    if (!info || info.status !== "completed") {
      return null;
    }

    return info.response ?? null;
  }

  /**
   * Probe daemon liveness and classify health state.
   */
  async ping(aiName: string): Promise<HealthStatus> {
    const daemon = this.registry.getOrThrow(aiName);
    const startedAt = Date.now();

    const daemonStatus = daemon.getStatus();
    const queueLength = daemon.getQueueLength();
    const latencyMs = Date.now() - startedAt;

    if (daemonStatus === "running" && queueLength < 5) {
      return {
        aiName,
        health: "healthy",
        daemonStatus,
        queueLength,
        latencyMs,
        checkedAt: new Date(),
      };
    }

    if (daemonStatus === "running" || daemonStatus === "starting") {
      return {
        aiName,
        health: "degraded",
        daemonStatus,
        queueLength,
        latencyMs,
        checkedAt: new Date(),
        detail: queueLength >= 5 ? "Queue depth exceeds healthy threshold" : "Daemon is still starting",
      };
    }

    return {
      aiName,
      health: "unhealthy",
      daemonStatus,
      queueLength,
      latencyMs,
      checkedAt: new Date(),
      detail: "Daemon is not running",
    };
  }

  /**
   * Return aggregate orchestrator and request tracking status.
   */
  getSystemStatus(): SystemStatus {
    let activeRequests = 0;

    for (const request of this.requests.values()) {
      if (request.status === "queued" || request.status === "processing") {
        activeRequests += 1;
      }
    }

    return {
      running: this.running,
      ais: this.registry.listStatuses(),
      totalRequests: this.requests.size,
      activeRequests,
    };
  }

  private attachDaemonListeners(aiName: string, daemon: AIDaemon): void {
    const responseListener: DaemonListenerSet["response"] = (payload) => {
      const info = this.requests.get(payload.id);
      if (!info) {
        return;
      }

      const completedAt = new Date(payload.timestamp);
      info.status = "completed";
      info.completedAt = completedAt;
      info.response = {
        requestId: payload.id,
        aiName,
        content: payload.response,
        timestamp: completedAt,
        processingTime: completedAt.getTime() - info.createdAt.getTime(),
      };

      this.registry.clearActiveRequest(aiName, payload.id);
      this.registry.markActivity(aiName, completedAt);
      this.promoteNextQueuedRequest(aiName);
    };

    const errorListener: DaemonListenerSet["error"] = (payload) => {
      const info = this.requests.get(payload.id);
      if (!info) {
        return;
      }

      const completedAt = new Date(payload.timestamp);
      info.status = "error";
      info.completedAt = completedAt;
      info.error = this.toError(payload.error, `Daemon request failed (attempt ${payload.attempt}/${payload.maxAttempts})`);

      this.registry.clearActiveRequest(aiName, payload.id);
      this.registry.markActivity(aiName, completedAt);
      this.promoteNextQueuedRequest(aiName);
    };

    const statusListener: DaemonListenerSet["status"] = (payload) => {
      this.registry.markActivity(aiName, new Date(payload.timestamp));
      if (payload.status === "stopped" || payload.status === "error") {
        this.registry.clearActiveRequest(aiName);
      }
    };

    daemon.on("response", responseListener);
    daemon.on("error", errorListener);
    daemon.on("status", statusListener);

    this.listeners.set(aiName, {
      response: responseListener,
      error: errorListener,
      status: statusListener,
    });
  }

  private detachDaemonListeners(aiName: string, daemon: AIDaemon): void {
    const listeners = this.listeners.get(aiName);
    if (!listeners) {
      return;
    }

    daemon.off("response", listeners.response);
    daemon.off("error", listeners.error);
    daemon.off("status", listeners.status);
    this.listeners.delete(aiName);
  }

  private promoteNextQueuedRequest(aiName: string): void {
    const nextRequest = [...this.requests.values()]
      .filter((request) => request.aiName === aiName && request.status === "queued")
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())[0];

    if (!nextRequest) {
      return;
    }

    nextRequest.status = "processing";
    this.registry.setActiveRequest(aiName, nextRequest.id);
  }

  private toError(error: unknown, fallbackMessage: string): Error {
    if (error instanceof Error) {
      return error;
    }

    return new Error(fallbackMessage, {
      cause: error,
    });
  }

  private bindSignalHandlers(): void {
    if (this.signalHandlersBound) {
      return;
    }

    process.on("SIGINT", this.onSigInt);
    process.on("SIGTERM", this.onSigTerm);
    this.signalHandlersBound = true;
  }

  private unbindSignalHandlers(): void {
    if (!this.signalHandlersBound) {
      return;
    }

    process.off("SIGINT", this.onSigInt);
    process.off("SIGTERM", this.onSigTerm);
    this.signalHandlersBound = false;
  }
}
