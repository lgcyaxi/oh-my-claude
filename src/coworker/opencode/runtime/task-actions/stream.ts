import { randomUUID } from 'node:crypto';

import type {
	CoworkerTaskEvent,
	CoworkerTaskRequest,
	CoworkerTaskResult,
} from '../../../types';
import {
	formatTaskMessage,
	isAbortLikeError,
	type OpenCodeMessageResponse,
} from '../../types';
import { cancelOpenCodeTask } from '../session-actions';
import type { OpenCodeRuntimeActionContext } from '../types';
import {
	createOpenCodeTaskEmitter,
	emitOpenCodeMessageResult,
	subscribeToOpenCodeEvents,
} from './events';

export async function streamOpenCodeTask(
	ctx: OpenCodeRuntimeActionContext,
	request: CoworkerTaskRequest,
	onEvent?: (event: CoworkerTaskEvent) => void,
): Promise<CoworkerTaskResult> {
	const sessionId = await ctx.startSession();
	const execution = await ctx.resolveExecutionConfig(request);
	const taskId = randomUUID();
	ctx.incrementActiveTaskCount();
	ctx.setActiveAbortController(new AbortController());
	const timeoutController = new AbortController();
	const timeoutMs = request.timeoutMs ?? 300_000;
	const timeoutId = setTimeout(() => {
		timeoutController.abort(
			new Error(`OpenCode coworker task timed out after ${timeoutMs}ms`),
		);
	}, timeoutMs);

	const emit = createOpenCodeTaskEmitter(ctx, onEvent);
	const unsubscribe = subscribeToOpenCodeEvents({
		ctx,
		sessionId,
		taskId,
		emit,
	});

	ctx.observability.writeActivity({
		type: 'session_started',
		content: ctx.projectPath,
		sessionId,
		meta: execution.meta,
	});
	ctx.observability.writeActivity({
		type: 'task_started',
		content: request.message,
		sessionId,
		taskId,
		meta: {
			...execution.meta,
			context: request.context ?? null,
		},
	});
	ctx.observability.writeStatus({
		state: 'thinking',
		sessionId,
		taskId,
		model: execution.modelLabel ?? undefined,
		meta: execution.meta,
	});
	await ctx.syncViewerSession(sessionId);
	void ctx.server.showTuiToast({
		title: 'oh-my-claude',
		message: `OpenCode coworker task started (${execution.agent})`,
		variant: 'info',
		duration: 2500,
	});
	emit({
		type: 'task_started',
		content: request.message,
		sessionId,
		taskId,
		model: execution.modelLabel ?? undefined,
		meta: execution.meta,
	});

	try {
		const activeAbortController = ctx.getActiveAbortController();
		if (!activeAbortController) {
			throw new Error('OpenCode coworker task lost its abort controller');
		}
		const response = await fetch(
			`${ctx.server.baseUrl}/session/${sessionId}/message`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					agent: execution.agent,
					model:
						execution.providerId && execution.modelId
							? {
									providerID: execution.providerId,
									modelID: execution.modelId,
								}
							: undefined,
					parts: [{ type: 'text', text: formatTaskMessage(request) }],
				}),
				signal: AbortSignal.any([
					activeAbortController.signal,
					timeoutController.signal,
				]),
			},
		);

		if (!response.ok) {
			const body = await response.text().catch(() => '');
			throw new Error(
				`OpenCode coworker request failed: ${response.status} ${body}`.trim(),
			);
		}

		const result =
			(await response.json()) as OpenCodeMessageResponse | null;
		if (!result || typeof result !== 'object') {
			throw new Error(
				'OpenCode coworker returned an empty response body',
			);
		}

		ctx.updateResolvedModel({
			requestedAgent:
				typeof execution.meta.requestedAgent === 'string'
					? execution.meta.requestedAgent
					: null,
			agentName: execution.agent,
			agentNative:
				typeof execution.meta.agentNative === 'boolean'
					? execution.meta.agentNative
					: null,
			providerId: result.info?.providerID ?? execution.providerId,
			modelId: result.info?.modelID ?? execution.modelId,
		});

		const model = ctx.getCurrentModelLabel();
		const meta = {
			operation: 'send',
			...(ctx.getCurrentRuntimeMeta() ?? {}),
			...(request.meta ?? {}),
		};
		ctx.observability.writeStatus({
			state: 'streaming',
			sessionId,
			taskId,
			model: model ?? undefined,
			meta,
		});

		const content = emitOpenCodeMessageResult({
			ctx,
			result,
			sessionId,
			taskId,
			model,
			meta,
			emit,
		});
		const structuredMeta = result.info?.structured_output
			? { structured_output: result.info.structured_output }
			: undefined;
		ctx.observability.writeActivity({
			type: 'task_completed',
			content,
			sessionId,
			taskId,
			model: model ?? undefined,
			meta: { ...meta, ...structuredMeta },
		});
		ctx.observability.writeStatus({
			state: 'complete',
			sessionId,
			taskId,
			model: model ?? undefined,
			meta,
		});
		emit({
			type: 'task_completed',
			content,
			sessionId,
			taskId,
			model: model ?? undefined,
			meta: { ...meta, ...structuredMeta },
			raw: result,
		});
		void ctx.server.showTuiToast({
			title: 'oh-my-claude',
			message: 'OpenCode coworker task completed',
			variant: 'success',
			duration: 2200,
		});

		return {
			requestId: result.info?.id ?? randomUUID(),
			coworker: ctx.name,
			content,
			timestamp: new Date(),
			sessionId,
			taskId,
			model: model ?? undefined,
			meta: { ...meta, ...structuredMeta },
		};
	} catch (error) {
		if (
			timeoutController.signal.aborted &&
			ctx.getActiveAbortController()
		) {
			await cancelOpenCodeTask(ctx);
		}
		const normalizedError =
			timeoutController.signal.aborted && isAbortLikeError(error)
				? new Error(
						`OpenCode coworker task timed out after ${timeoutMs}ms`,
					)
				: error;
		const message =
			normalizedError instanceof Error
				? normalizedError.message
				: String(normalizedError);
		ctx.observability.writeActivity({
			type: 'task_failed',
			content: message,
			sessionId,
			taskId,
			meta: {
				operation: 'send',
				...execution.meta,
				...(request.meta ?? {}),
			},
		});
		ctx.observability.writeStatus({
			state: 'error',
			sessionId,
			taskId,
			model: execution.modelLabel ?? undefined,
			meta: {
				operation: 'send',
				...execution.meta,
				...(request.meta ?? {}),
			},
		});
		emit({
			type: 'task_failed',
			content: message,
			sessionId,
			taskId,
			model: execution.modelLabel ?? undefined,
			meta: {
				operation: 'send',
				...execution.meta,
				...(request.meta ?? {}),
			},
			raw: normalizedError,
		});
		void ctx.server.showTuiToast({
			title: 'oh-my-claude',
			message,
			variant: 'error',
			duration: 3500,
		});
		throw normalizedError;
	} finally {
		clearTimeout(timeoutId);
		unsubscribe();
		ctx.decrementActiveTaskCount();
		ctx.setActiveAbortController(null);
		ctx.scheduleViewerCloseIfIdle();
	}
}
