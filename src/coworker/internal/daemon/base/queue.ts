import type { QueuedRequest, RequestId, RequestPriority } from '../types';
import type {
	AIDaemonBaseContext,
	AttemptMetadata,
	PriorityToWeight,
	RequestIdFactory,
	SleepFn,
} from './types';

const RESPONSE_POLL_INTERVAL_MS = 250;

export function insertQueuedRequest(
	queue: QueuedRequest[],
	queued: QueuedRequest,
	priorityToWeight: PriorityToWeight,
): void {
	queue.push(queued);
	queue.sort((left, right) => {
		const priorityWeight =
			priorityToWeight(left.request.priority) -
			priorityToWeight(right.request.priority);
		if (priorityWeight !== 0) {
			return priorityWeight;
		}

		return left.timestamp - right.timestamp;
	});
}

export function priorityToWeight(
	priority: RequestPriority | undefined,
): number {
	switch (priority) {
		case 'high':
			return 0;
		case 'normal':
			return 1;
		case 'low':
		default:
			return 2;
	}
}

export function generateRequestId(factory?: RequestIdFactory): RequestId {
	return factory
		? factory()
		: `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function extractAttemptMetadata(
	configMaxRetries: number,
	error: unknown,
): AttemptMetadata {
	if (
		typeof error === 'object' &&
		error !== null &&
		'attempt' in error &&
		'maxAttempts' in error
	) {
		const data = error as {
			error?: unknown;
			attempt: number;
			maxAttempts: number;
		};
		return {
			error: data.error,
			attempt: data.attempt,
			maxAttempts: data.maxAttempts,
		};
	}

	const maxAttempts = Math.max(1, configMaxRetries + 1);
	return {
		error,
		attempt: maxAttempts,
		maxAttempts,
	};
}

export async function executeWithRetries(
	ctx: Pick<
		AIDaemonBaseContext,
		| 'config'
		| 'send'
		| 'checkResponse'
		| 'shouldRetryRequest'
		| 'formatRequestMessage'
	>,
	queued: QueuedRequest,
	sleep: SleepFn,
): Promise<{ response: string; attempt: number }> {
	const maxAttempts = Math.max(1, ctx.config.maxRetries + 1);
	const message = ctx.formatRequestMessage(queued.request);
	let lastError: unknown;

	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		try {
			await ctx.send(message);
			const response = await pollForResponse(ctx, queued.id, sleep);
			return { response, attempt };
		} catch (error) {
			lastError = error;
			if (!ctx.shouldRetryRequest(error)) {
				break;
			}
		}
	}

	throw {
		error: lastError,
		attempt: maxAttempts,
		maxAttempts,
	};
}

async function pollForResponse(
	ctx: Pick<AIDaemonBaseContext, 'config' | 'checkResponse'>,
	_requestId: RequestId,
	sleep: SleepFn,
): Promise<string> {
	const startedAt = Date.now();

	while (Date.now() - startedAt < ctx.config.requestTimeoutMs) {
		const response = await ctx.checkResponse();
		if (response !== null) {
			return response;
		}

		await sleep(RESPONSE_POLL_INTERVAL_MS);
	}

	throw new Error(`Request timeout after ${ctx.config.requestTimeoutMs}ms`);
}

export async function processQueue(
	ctx: AIDaemonBaseContext,
	deps: {
		ensureRunning: () => Promise<void>;
		resetIdleTimer: () => void;
		sleep: SleepFn;
	},
): Promise<void> {
	if (ctx.isProcessingQueue) {
		return;
	}

	ctx.isProcessingQueue = true;

	try {
		while (ctx.requestQueue.length > 0) {
			const queued = ctx.requestQueue.shift();
			if (!queued) {
				return;
			}

			ctx.activeRequest = queued.request;

			try {
				await deps.ensureRunning();

				const { response } = await executeWithRetries(
					ctx,
					queued,
					deps.sleep,
				);
				ctx.emitEvent('response', {
					id: queued.id,
					response,
					timestamp: Date.now(),
				});
			} catch (error) {
				const metadata = extractAttemptMetadata(
					ctx.config.maxRetries,
					error,
				);
				ctx.emitEvent('error', {
					id: queued.id,
					error: metadata.error,
					attempt: metadata.attempt,
					maxAttempts: metadata.maxAttempts,
					timestamp: Date.now(),
				});
			} finally {
				ctx.activeRequest = null;
				deps.resetIdleTimer();
			}
		}
	} finally {
		ctx.isProcessingQueue = false;
		if (!ctx.activeRequest && ctx.requestQueue.length > 0) {
			void processQueue(ctx, deps);
		}
	}
}
