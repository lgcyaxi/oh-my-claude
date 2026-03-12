import type { AIDaemonEventMap } from '../events';
import type {
	AIConfig,
	DaemonStatus,
	QueuedRequest,
	Request,
	RequestId,
	RequestPriority,
} from '../types';

export interface AIDaemonBaseContext {
	name: string;
	config: AIConfig;
	status: DaemonStatus;
	requestQueue: QueuedRequest[];
	activeRequest: Request | null;
	idleTimer: NodeJS.Timeout | null;
	isProcessingQueue: boolean;
	startPromise: Promise<void> | null;
	stopPromise: Promise<void> | null;
	setStatus(status: DaemonStatus): void;
	send(message: string): Promise<void>;
	checkResponse(): Promise<string | null>;
	start(): Promise<void>;
	stop(): Promise<void>;
	shouldRetryRequest(error: unknown): boolean;
	formatRequestMessage(request: Request): string;
	emitEvent<K extends keyof AIDaemonEventMap>(
		event: K,
		payload: AIDaemonEventMap[K],
	): void;
}

export interface AttemptMetadata {
	error: unknown;
	attempt: number;
	maxAttempts: number;
}

export type PriorityToWeight = (
	priority: RequestPriority | undefined,
) => number;
export type SleepFn = (ms: number) => Promise<void>;
export type RequestIdFactory = () => RequestId;
