import { DaemonEventBus } from './events';
import type {
	AIConfig,
	DaemonStatus,
	QueuedRequest,
	Request,
	RequestId,
	RequestPriority,
} from './types';
import type { AIDaemonEventMap } from './events';
import {
	clearIdleTimer,
	ensureRunning,
	resetIdleTimer,
} from './base/lifecycle';
import {
	generateRequestId,
	insertQueuedRequest,
	priorityToWeight,
	processQueue,
} from './base/queue';
import type { AIDaemonBaseContext } from './base/types';

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

	protected status: DaemonStatus = 'stopped';
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
	 * Decide whether a request failure should be retried.
	 *
	 * Concrete daemons can override this to stop retrying on explicit
	 * interrupts/cancellations while preserving retries for transient failures.
	 */
	protected shouldRetryRequest(_error: unknown): boolean {
		return true;
	}

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
	 * Returns whether a request is currently being executed.
	 */
	hasActiveRequest(): boolean {
		return this.activeRequest !== null;
	}

	/**
	 * Queue a request for serialized processing.
	 *
	 * Requests are ordered by priority and then by timestamp, while preserving
	 * strict single-flight execution to prevent context contamination.
	 */
	async queueRequest(request: Request): Promise<RequestId> {
		const id = generateRequestId();
		const queued: QueuedRequest = {
			id,
			request: {
				...request,
				priority: request.priority ?? 'normal',
			},
			timestamp: Date.now(),
		};

		clearIdleTimer(this.baseContext());
		insertQueuedRequest(this.requestQueue, queued, priorityToWeight);
		void processQueue(this.baseContext(), {
			ensureRunning: () => ensureRunning(this.baseContext()),
			resetIdleTimer: () => resetIdleTimer(this.baseContext()),
			sleep: (ms) => this.sleep(ms),
		});

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
		this.eventBus.emit('status', {
			previousStatus,
			status,
			timestamp: Date.now(),
		});
	}

	/**
	 * Emit a task-level coworker activity event.
	 */
	protected emitActivity(
		id: RequestId | null,
		event: AIDaemonEventMap['activity']['event'],
	): void {
		this.eventBus.emit('activity', {
			id,
			event,
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

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	private baseContext(): AIDaemonBaseContext {
		return {
			name: this.name,
			config: this.config,
			status: this.status,
			requestQueue: this.requestQueue,
			activeRequest: this.activeRequest,
			idleTimer: this.idleTimer,
			isProcessingQueue: this.isProcessingQueue,
			startPromise: this.startPromise,
			stopPromise: this.stopPromise,
			setStatus: (status) => this.setStatus(status),
			send: (message) => this.send(message),
			checkResponse: () => this.checkResponse(),
			start: () => this.start(),
			stop: () => this.stop(),
			shouldRetryRequest: (error) => this.shouldRetryRequest(error),
			formatRequestMessage: (request) =>
				this.formatRequestMessage(request),
			emitEvent: (event, payload) =>
				this.eventBus.emit(event, payload as never),
		};
	}
}
