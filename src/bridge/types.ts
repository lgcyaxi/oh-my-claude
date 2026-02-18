import type { AIDaemon, AIConfig, DaemonStatus, Request, RequestId } from "../daemon";

/**
 * Runtime lifecycle status for a delegated request.
 */
export type RequestStatus = "queued" | "processing" | "completed" | "error" | "unknown";

/**
 * Normalized bridge response payload returned by the orchestrator.
 */
export interface BridgeResponse {
  /** Request identifier created by the daemon. */
  requestId: RequestId;
  /** Target AI daemon name. */
  aiName: string;
  /** Final response text from the AI backend. */
  content: string;
  /** Completion timestamp. */
  timestamp: Date;
  /** End-to-end processing latency in milliseconds. */
  processingTime: number;
}

/**
 * Public status snapshot for a single AI daemon.
 */
export interface AIStatus {
  /** Daemon identifier (for example: codex, opencode). */
  name: string;
  /** Current daemon lifecycle status. */
  status: DaemonStatus;
  /** Currently tracked active request for this daemon, if any. */
  activeRequest?: RequestId;
  /** Number of queued requests not currently processing. */
  queueLength: number;
  /** Last known daemon activity timestamp. */
  lastActivity: Date;
}

/**
 * Internal request bookkeeping entry managed by the bridge.
 */
export interface RequestInfo {
  /** Unique request ID assigned by the target daemon. */
  id: RequestId;
  /** Target AI daemon name. */
  aiName: string;
  /** Original delegated request payload. */
  request: Request;
  /** Current request lifecycle status. */
  status: Exclude<RequestStatus, "unknown">;
  /** Final response object when completed successfully. */
  response?: BridgeResponse;
  /** Final error object when processing fails. */
  error?: Error;
  /** Request creation timestamp. */
  createdAt: Date;
  /** Request completion timestamp when done or failed. */
  completedAt?: Date;
}

/**
 * Health classification used by bridge pings.
 */
export type HealthState = "healthy" | "degraded" | "unhealthy";

/**
 * Health details for a single daemon instance.
 */
export interface HealthStatus {
  /** Daemon identifier. */
  aiName: string;
  /** Computed health state. */
  health: HealthState;
  /** Underlying daemon runtime status. */
  daemonStatus: DaemonStatus;
  /** Queue length observed at probe time. */
  queueLength: number;
  /** Probe latency in milliseconds. */
  latencyMs: number;
  /** Probe completion timestamp. */
  checkedAt: Date;
  /** Optional human-readable diagnostics. */
  detail?: string;
}

/**
 * Aggregated runtime status for the complete bridge.
 */
export interface SystemStatus {
  /** Indicates whether the orchestrator is currently running. */
  running: boolean;
  /** Status list for all registered AI daemons. */
  ais: AIStatus[];
  /** Total requests tracked in memory. */
  totalRequests: number;
  /** Number of requests currently queued or processing. */
  activeRequests: number;
}

/**
 * Factory function used to create concrete daemon implementations.
 */
export type DaemonFactory = (config: AIConfig) => Promise<AIDaemon> | AIDaemon;

/**
 * Runtime configuration for the bridge orchestrator.
 */
export interface BridgeConfig {
  /** Runtime directory used for bridge state and temporary assets. */
  runDir: string;
  /** Logging verbosity hint for future integrations. */
  logLevel: "debug" | "info" | "warn" | "error";
  /** Initial AI daemon definitions to register on startup. */
  ais: AIConfig[];
  /** Terminal backend preference metadata from RFC. */
  terminal: {
    backend: "tmux" | "wezterm" | "iterm2" | "windows-terminal";
    autoCreatePanes: boolean;
    paneLayout: "horizontal" | "vertical" | "grid";
  };
  /** Global daemon runtime settings from RFC. */
  daemon: {
    idleTimeoutMs: number;
    maxRetries: number;
    requestTimeoutMs: number;
  };
  /**
   * Daemon factory map keyed by AI name.
   *
   * The bridge core is daemon-agnostic. Concrete implementations are injected
   * here by integration layers.
   */
  daemonFactories: Record<string, DaemonFactory>;
}

/**
 * Public orchestrator contract from RFC section 3.1.
 */
export interface BridgeOrchestrator {
  /** Initialize runtime resources and optional startup daemons. */
  start(): Promise<void>;
  /** Stop all daemons and release bridge resources. */
  stop(): Promise<void>;

  /** Create, start, and register a daemon instance. */
  registerAI(config: AIConfig): Promise<AIDaemon>;
  /** Unregister and stop an existing daemon by name. */
  unregisterAI(name: string): Promise<void>;
  /** List status snapshots for all registered daemons. */
  listAIs(): AIStatus[];

  /** Delegate a request to a target AI daemon and return request id. */
  delegate(aiName: string, request: Request): Promise<RequestId>;
  /** Check current status for a tracked request id. */
  checkStatus(requestId: RequestId): RequestStatus;
  /** Return response payload when complete, otherwise null. */
  getResponse(requestId: RequestId): Promise<BridgeResponse | null>;

  /** Probe daemon health information. */
  ping(aiName: string): Promise<HealthStatus>;
  /** Return global orchestrator health and queue state. */
  getSystemStatus(): SystemStatus;
}
