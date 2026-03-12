import type { CodexObservability } from '../observability';
import type { CoworkerTaskEvent } from '../../types';
import type { ConversationSession } from '../conversation';
import { handleConversationTaskNotification } from './task-events';
import { handleConversationToolNotification } from './tool-events';
import type { NotificationHandlerHelpers } from './types';

export function handleConversationNotification(args: {
	session: ConversationSession;
	method: string;
	params: unknown;
	observability: CodexObservability;
	emitEvent: (event: Omit<CoworkerTaskEvent, 'target' | 'timestamp'>) => void;
}): void {
	const { session, method, params, observability, emitEvent } = args;

	const writeActivity = (
		type: CoworkerTaskEvent['type'],
		content: string,
		taskId?: string | null,
		meta?: Record<string, unknown>,
	) => {
		observability.writeActivityLog(
			type,
			content,
			session.convModel,
			session.threadId ?? undefined,
			taskId ?? session.activeTurnId ?? undefined,
			meta,
		);
	};

	const emitPlanUpdate = (
		content: string,
		taskId?: string | null,
		raw?: unknown,
		meta?: Record<string, unknown>,
	) => {
		if (!content) return;
		writeActivity('plan_update', content, taskId, meta);
		emitEvent({
			type: 'plan_update',
			taskId: taskId ?? session.activeTurnId,
			sessionId: session.threadId,
			content,
			model: session.convModel,
			meta,
			raw,
		});
	};

	const emitToolActivity = (
		content: string,
		taskId?: string | null,
		raw?: unknown,
		meta?: Record<string, unknown>,
	) => {
		if (!content) return;
		writeActivity('tool_activity', content, taskId, meta);
		emitEvent({
			type: 'tool_activity',
			taskId: taskId ?? session.activeTurnId,
			sessionId: session.threadId,
			content,
			model: session.convModel,
			meta,
			raw,
		});
	};

	const stringifyProgress = (value: unknown): string => {
		if (typeof value === 'string') return value;
		if (value === null || value === undefined) return '';
		try {
			return JSON.stringify(value);
		} catch {
			return String(value);
		}
	};

	const helpers: NotificationHandlerHelpers = {
		writeActivity,
		emitPlanUpdate,
		emitToolActivity,
		stringifyProgress,
	};

	if (
		handleConversationTaskNotification({
			session,
			method,
			params,
			observability,
			emitEvent,
			helpers,
		})
	) {
		return;
	}

	handleConversationToolNotification({
		session,
		method,
		params,
		observability,
		emitEvent,
		helpers,
	});
}
