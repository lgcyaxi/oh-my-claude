import type { CoworkerTaskEvent } from '../../../types';
import type { OpenCodeGlobalEvent } from '../../server';
import { mapOpenCodeGlobalEvent } from '../../events';
import { extractMessageText, type OpenCodeMessageResponse } from '../../types';
import type {
	OpenCodeEventEmitter,
	OpenCodeRuntimeActionContext,
} from '../types';

export function createOpenCodeTaskEmitter(
	ctx: OpenCodeRuntimeActionContext,
	onEvent?: (event: CoworkerTaskEvent) => void,
): OpenCodeEventEmitter {
	return (event) => {
		const fullEvent: CoworkerTaskEvent = {
			target: 'opencode',
			timestamp: Date.now(),
			...event,
		};
		ctx.setLastActivityAt(new Date(fullEvent.timestamp).toISOString());
		onEvent?.(fullEvent);
	};
}

export function subscribeToOpenCodeEvents(args: {
	ctx: OpenCodeRuntimeActionContext;
	sessionId: string;
	taskId: string;
	emit: OpenCodeEventEmitter;
}): () => void {
	return args.ctx.server.subscribe((event: OpenCodeGlobalEvent) => {
		const type = event.payload?.type;
		if (
			!type ||
			type === 'server.connected' ||
			type === 'server.heartbeat'
		) {
			return;
		}
		args.ctx.capturePermissionEvent(
			type,
			event.payload?.properties,
			args.sessionId,
		);
		const mapped = mapOpenCodeGlobalEvent(type, event.payload?.properties);
		args.ctx.observability.writeActivity({
			type: mapped.type,
			content: mapped.content,
			sessionId: args.sessionId,
			taskId: args.taskId,
			meta: mapped.meta,
		});
		args.emit({
			type: mapped.type,
			content: mapped.content,
			sessionId: args.sessionId,
			taskId: args.taskId,
			meta: mapped.meta,
			raw: event,
		});
	});
}

export function emitOpenCodeMessageResult(args: {
	ctx: OpenCodeRuntimeActionContext;
	result: OpenCodeMessageResponse;
	sessionId: string;
	taskId: string;
	model: string | null;
	meta: Record<string, unknown>;
	emit: OpenCodeEventEmitter;
}): string {
	for (const part of args.result.parts ?? []) {
		if (part.type === 'reasoning' && part.text) {
			args.ctx.observability.writeActivity({
				type: 'plan_update',
				content: part.text,
				sessionId: args.sessionId,
				taskId: args.taskId,
				model: args.model ?? undefined,
				meta: part.metadata,
			});
			args.emit({
				type: 'plan_update',
				content: part.text,
				sessionId: args.sessionId,
				taskId: args.taskId,
				model: args.model ?? undefined,
				meta: part.metadata,
				raw: part,
			});
			continue;
		}

		if (part.type === 'text' && part.text) {
			args.ctx.observability.writeActivity({
				type: 'text_delta',
				content: part.text,
				sessionId: args.sessionId,
				taskId: args.taskId,
				model: args.model ?? undefined,
			});
			args.emit({
				type: 'text_delta',
				content: part.text,
				sessionId: args.sessionId,
				taskId: args.taskId,
				model: args.model ?? undefined,
				raw: part,
			});
			continue;
		}

		if (part.type === 'step-start' || part.type === 'step-finish') {
			const stepMeta = {
				reason: part.reason,
				cost: part.cost,
				tokens: part.tokens,
				snapshot: part.snapshot,
			};
			args.ctx.observability.writeActivity({
				type: 'tool_activity',
				content: part.type,
				sessionId: args.sessionId,
				taskId: args.taskId,
				model: args.model ?? undefined,
				meta: stepMeta,
			});
			args.emit({
				type: 'tool_activity',
				content: part.type,
				sessionId: args.sessionId,
				taskId: args.taskId,
				model: args.model ?? undefined,
				meta: stepMeta,
				raw: part,
			});
		}
	}

	return extractMessageText(args.result);
}
