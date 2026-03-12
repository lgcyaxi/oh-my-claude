import type { CodexObservability } from '../observability';
import type { CoworkerTaskEvent } from '../../types';
import type { ConversationSession } from '../conversation';
import type {
	ItemCompletedNotification,
	TurnDiffUpdatedNotification,
} from '../protocol/v2';
import type { NotificationHandlerHelpers } from './types';

export function handleConversationToolNotification(args: {
	session: ConversationSession;
	method: string;
	params: unknown;
	observability: CodexObservability;
	emitEvent: (event: Omit<CoworkerTaskEvent, 'target' | 'timestamp'>) => void;
	helpers: NotificationHandlerHelpers;
}): boolean {
	const { session, method, params, observability, emitEvent, helpers } = args;
	const { emitToolActivity, stringifyProgress, writeActivity } = helpers;

	switch (method) {
		case 'item/completed': {
			const msg = params as ItemCompletedNotification;
			const item = msg.item as {
				type: string;
				status?: string;
				tool?: string;
				server?: string;
			};
			if (
				item.type === 'commandExecution' ||
				item.type === 'fileChange' ||
				item.type === 'mcpToolCall' ||
				item.type === 'dynamicToolCall'
			) {
				const content = [
					item.type,
					item.tool ?? item.server ?? null,
					item.status ?? null,
				]
					.filter(Boolean)
					.join(' · ');
				emitToolActivity(content, session.activeTurnId, msg, {
					status: item.status,
					tool: item.tool,
					server: item.server,
				});
				return true;
			}
			return false;
		}

		case 'item/started': {
			const payload = params as {
				item?: {
					type?: string;
					id?: string;
					tool?: string;
					server?: string;
					command?: string;
				};
			};
			const item = payload.item;
			if (!item?.type) return true;
			emitToolActivity(
				[
					item.type,
					item.tool ?? item.server ?? item.command ?? null,
					'started',
				]
					.filter(Boolean)
					.join(' · '),
				session.activeTurnId,
				payload,
				{
					itemId: item.id,
					tool: item.tool,
					server: item.server,
					command: item.command,
				},
			);
			return true;
		}

		case 'item/commandExecution/outputDelta': {
			const payload = params as {
				turnId?: string;
				delta?: string;
				command?: string;
			};
			const content = stringifyProgress(payload.delta);
			if (!content) return true;
			emitToolActivity(
				payload.command
					? `command output · ${payload.command}\n${content}`
					: `command output\n${content}`,
				payload.turnId ?? session.activeTurnId,
				payload,
			);
			return true;
		}

		case 'item/fileChange/outputDelta': {
			const payload = params as {
				turnId?: string;
				delta?: string;
				path?: string;
			};
			const content = stringifyProgress(payload.delta);
			if (!content) return true;
			emitToolActivity(
				payload.path
					? `file change · ${payload.path}\n${content}`
					: `file change\n${content}`,
				payload.turnId ?? session.activeTurnId,
				payload,
			);
			return true;
		}

		case 'item/commandExecution/terminalInteraction': {
			const payload = params as {
				turnId?: string;
				text?: string;
				delta?: string;
			};
			emitToolActivity(
				payload.text ?? payload.delta ?? 'terminal interaction',
				payload.turnId ?? session.activeTurnId,
				payload,
			);
			return true;
		}

		case 'item/mcpToolCall/progress': {
			const payload = params as {
				turnId?: string;
				toolName?: string;
				server?: string;
				progress?: unknown;
			};
			emitToolActivity(
				[
					'mcp tool',
					payload.server ?? null,
					payload.toolName ?? null,
					stringifyProgress(payload.progress) || null,
				]
					.filter(Boolean)
					.join(' · '),
				payload.turnId ?? session.activeTurnId,
				payload,
			);
			return true;
		}

		case 'turn/diff/updated': {
			const payload = params as TurnDiffUpdatedNotification;
			session.lastTurnDiff = payload.diff;
			writeActivity('diff_updated', payload.diff, payload.turnId, {
				threadId: payload.threadId,
			});
			emitEvent({
				type: 'diff_updated',
				taskId: payload.turnId,
				sessionId: payload.threadId,
				content: payload.diff,
				model: session.convModel,
				raw: payload,
			});
			return true;
		}

		case 'patch_apply_begin':
		case 'patch_apply_end':
		case 'request_user_input':
		case 'exec_approval_request':
		case 'apply_patch_approval_request': {
			const payload = params as { turnId?: string };
			emitToolActivity(
				method.replaceAll('/', ' ').replaceAll('_', ' '),
				payload.turnId ?? session.activeTurnId,
				payload,
			);
			return true;
		}

		default:
			return false;
	}
}
