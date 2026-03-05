import { DaemonEventBus } from "./events";
import type {
  AIConfig,
  DaemonStatus,
  QueuedRequest,
  Request,
  RequestId,
  RequestPriority,
} from "./types";
import type { AIDaemonEventMap } from "./events";

const DEFAULT_IDLE_TIMEOUT_MS = 60_000;
const RESPONSE_POLL_INTERVAL_MS = 250;

/**
 * Abstract daemon base class for AI process lifecycle and request orchestration.
 *
 * Responsibilities:
 * - Serialize request execution through an internal queue
 * - Provide retry + timeout handling for async responses
 * - Emit typed daemon events for response/error/status communication
 * - Stop idle daemons automatically after the configured timeout
 */
export abstract class AIDaemon {
  /** Human-readable daemon name (for example: codex, opencode). */
  abstract readonly name: string;
  /** Static daemon configuration. */
  abstract readonly config: AIConfig;

  protected status: DaemonStatus = "stopped";
  protected requestQueue: QueuedRequest[] = [];
  protected activeRequest: Request | null = null;
  protected idleTimer: NodeJS.Timeout | null = null;

  private readonly eventBus = new DaemonEventBus();
  private isProcessingQueue = false;
  private startPromise: Promise<void> | null = null;
  private stopPromise: Promise<void> | null = null;

  /** Start the concrete daemon implementation. */
  abstract start(): Promise<void>;
  /** Stop the concrete daemon implementation. */
  abstract stop(): Promise<void>;
  /** Send a serialized request message to the concrete backend. */
  abstract send(message: string): Promise<void>;
  /** Poll for a response from the concrete backend. */
  abstract checkResponse(): Promise<string | null>;

  /**
   * Subscribe to daemon events.
   */
  on<K extends keyof AIDaemonEventMap>(
    event: K,
    listener: (payload: AIDaemonEventMap[K]) => void,
  ): this {
    this.eventBus.on(event, listener);
    return this;
  }

  /**
   * Subscribe once to a daemon event.
   */
  once<K extends keyof AIDaemonEventMap>(
    event: K,
    listener: (payload: AIDaemonEventMap[K]) => void,
  ): this {
    this.eventBus.once(event, listener);
    return this;
  }

  /**
   * Remove a daemon event listener.
   */
  off<K extends keyof AIDaemonEventMap>(
    event: K,
    listener: (payload: AIDaemonEventMap[K]) => void,
  ): this {
    this.eventBus.off(event, listener);
    return this;
  }

  /**
   * Remove all event listeners.
   */
  removeAllListeners(event?: keyof AIDaemonEventMap): this {
    this.eventBus.removeAllListeners(event);
    return this;
  }

  /**
   * Returns the terminal pane ID if the daemon is using a pane.
   * Concrete subclasses should override this if they manage a pane.
   */
  getPaneId(): string | null {
    return null;
  }

  /**
   * Returns the project path the daemon is operating on.
   * Concrete subclasses should override this if they track a project path.
   */
  getProjectPath(): string | null {
    return null;
  }

  /**
   * Returns current daemon lifecycle status.
   */
  getStatus(): DaemonStatus {
    return this.status;
  }

  /**
   * Returns pending queue size (excluding active request).
   */
  getQueueLength(): number {
    return this.requestQueue.length;
  }

  /**
   * Queue a request for serialized processing.
   *
   * Requests are ordered by priority and then by timestamp, while preserving
   * strict single-flight execution to prevent context contamination.
   */
  async queueRequest(request: Request): Promise<RequestId> {
    const id = this.generateRequestId();
    const queued: QueuedRequest = {
      id,
      request: {
        ...request,
        priority: request.priority ?? "normal",
      },
      timestamp: Date.now(),
    };

    this.clearIdleTimer();
    this.insertQueuedRequest(queued);
    void this.processQueue();

    return id;
  }

  /**
   * Update daemon status and emit a status event.
   */
  protected setStatus(status: DaemonStatus): void {
    if (this.status === status) {
      return;
    }

    const previousStatus = this.status;
    this.status = status;
    this.eventBus.emit("status", {
      previousStatus,
      status,
      timestamp: Date.now(),
    });
  }

  /**
   * Serialize request context into a single message before sending.
   */
  protected formatRequestMessage(request: Request): string {
    if (!request.context) {
      return request.message;
    }

    return `${request.context}\n\n${request.message}`;
  }

  private insertQueuedRequest(queued: QueuedRequest): void {
    this.requestQueue.push(queued);
    this.requestQueue.sort((left, right) => {
      const priorityWeight = this.priorityToWeight(left.request.priority) - this.priorityToWeight(right.request.priority);
      if (priorityWeight !== 0) {
        return priorityWeight;
      }

      return left.timestamp - right.timestamp;
    });
  }

  private priorityToWeight(priority: RequestPriority | undefined): number {
    switch (priority) {
      case "high":
        return 0;
      case "normal":
        return 1;
      case "low":
      default:
        return 2;
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      while (this.requestQueue.length > 0) {
        const queued = this.requestQueue.shift();
        if (!queued) {
          return;
        }

        this.activeRequest = queued.request;

        try {
          await this.ensureRunning();

          const { response } = await this.executeWithRetries(queued);
          this.eventBus.emit("response", {
            id: queued.id,
            response,
            timestamp: Date.now(),
          });
        } catch (error) {
          const metadata = this.extractAttemptMetadata(error);
          this.eventBus.emit("error", {
            id: queued.id,
            error: metadata.error,
            attempt: metadata.attempt,
            maxAttempts: metadata.maxAttempts,
            timestamp: Date.now(),
          });
        } finally {
          this.activeRequest = null;
          this.resetIdleTimer();
        }
      }
    } finally {
      this.isProcessingQueue = false;
      if (!this.activeRequest && this.requestQueue.length > 0) {
        void this.processQueue();
      }
    }
  }

  private async executeWithRetries(
    queued: QueuedRequest,
  ): Promise<{ response: string; attempt: number }> {
    const maxAttempts = Math.max(1, this.config.maxRetries + 1);
    const message = this.formatRequestMessage(queued.request);
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.send(message);
        const response = await this.pollForResponse(queued.id);
        return { response, attempt };
      } catch (error) {
        lastError = error;
      }
    }

    throw {
      error: lastError,
      attempt: maxAttempts,
      maxAttempts,
    };
  }

  private async pollForResponse(_requestId: RequestId): Promise<string> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < this.config.requestTimeoutMs) {
      const response = await this.checkResponse();
      if (response !== null) {
        return response;
      }

      await this.sleep(RESPONSE_POLL_INTERVAL_MS);
    }

    throw new Error(`Request timeout after ${this.config.requestTimeoutMs}ms`);
  }

  private async ensureRunning(): Promise<void> {
    if (this.status === "running") {
      return;
    }

    if (this.startPromise) {
      await this.startPromise;
      return;
    }

    this.startPromise = (async () => {
      this.setStatus("starting");
      try {
        await this.start();
        this.setStatus("running");
      } catch (error) {
        this.setStatus("error");
        throw error;
      }
    })();

    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private resetIdleTimer(): void {
    this.clearIdleTimer();

    const idleTimeoutMs = this.config.idleTimeoutMs > 0
      ? this.config.idleTimeoutMs
      : DEFAULT_IDLE_TIMEOUT_MS;

    this.idleTimer = setTimeout(() => {
      void this.stopIfIdle();
    }, idleTimeoutMs);
  }

  private clearIdleTimer(): void {
    if (!this.idleTimer) {
      return;
    }

    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private async stopIfIdle(): Promise<void> {
    if (this.activeRequest || this.requestQueue.length > 0) {
      return;
    }

    if (this.status !== "running") {
      return;
    }

    if (this.stopPromise) {
      await this.stopPromise;
      return;
    }

    this.stopPromise = (async () => {
      this.setStatus("stopping");
      try {
        await this.stop();
        this.setStatus("stopped");
      } catch {
        this.setStatus("error");
      }
    })();

    try {
      await this.stopPromise;
    } finally {
      this.stopPromise = null;
    }
  }

  private extractAttemptMetadata(error: unknown): {
    error: unknown;
    attempt: number;
    maxAttempts: number;
  } {
    if (
      typeof error === "object"
      && error !== null
      && "attempt" in error
      && "maxAttempts" in error
    ) {
      const data = error as { error?: unknown; attempt: number; maxAttempts: number };
      return {
        error: data.error,
        attempt: data.attempt,
        maxAttempts: data.maxAttempts,
      };
    }

    const maxAttempts = Math.max(1, this.config.maxRetries + 1);
    return {
      error,
      attempt: maxAttempts,
      maxAttempts,
    };
  }

  private generateRequestId(): RequestId {
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
