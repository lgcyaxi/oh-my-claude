import type { CodexObservability } from '../observability';
import type { CoworkerTaskEvent } from '../../types';
import type { ConversationSession } from '../conversation';
import type {
	AgentMessageDeltaNotification,
	ErrorNotification,
	ItemCompletedNotification,
	TurnCompletedNotification,
} from '../protocol/v2';
import type { NotificationHandlerHelpers } from './types';

export function handleConversationTaskNotification(args: {
	session: ConversationSession;
	method: string;
	params: unknown;
	observability: CodexObservability;
	emitEvent: (event: Omit<CoworkerTaskEvent, 'target' | 'timestamp'>) => void;
	helpers: NotificationHandlerHelpers;
}): boolean {
	const { session, method, params, observability, emitEvent, helpers } = args;
	const { writeActivity, emitPlanUpdate } = helpers;

	switch (method) {
		case 'item/agentMessage/delta': {
			const msg = params as AgentMessageDeltaNotification;
			const delta = msg.delta ?? '';
			if (!delta) return true;
			session.messageBuffer += delta;
			observability.writeStatusSignal(
				'streaming',
				undefined,
				session.convModel,
				session.threadId ?? undefined,
				session.activeTurnId ?? undefined,
			);
			writeActivity('text_delta', delta);
			emitEvent({
				type: 'text_delta',
				taskId: session.activeTurnId,
				sessionId: session.threadId,
				content: delta,
				model: session.convModel,
				raw: msg,
			});
			return true;
		}

		case 'item/completed': {
			const msg = params as ItemCompletedNotification;
			const item = msg.item as {
				type: string;
				text?: string;
				status?: string;
				tool?: string;
				server?: string;
			};
			if (item.type === 'agentMessage' && item.text) {
				session.lastAgentMessage = item.text;
				if (!session.messageBuffer) {
					session.messageBuffer = item.text;
					writeActivity(
						'text_delta',
						item.text,
						session.activeTurnId,
						{
							source: 'item/completed',
						},
					);
					emitEvent({
						type: 'text_delta',
						taskId: session.activeTurnId,
						sessionId: session.threadId,
						content: item.text,
						model: session.convModel,
						meta: { source: 'item/completed' },
						raw: msg,
					});
				}
				return true;
			}

			if (item.type === 'plan' || item.type === 'reasoning') {
				emitPlanUpdate(
					item.text ?? item.type,
					session.activeTurnId,
					msg,
					{
						itemType: item.type,
					},
				);
				return true;
			}

			return false;
		}

		case 'turn/completed': {
			const msg = params as TurnCompletedNotification;
			session.activeTurnId = null;

			if (msg.turn.status === 'failed') {
				const errMsg = msg.turn.error?.message ?? 'Unknown codex error';
				session.turnError = new Error(
					`codex app-server turn error: ${errMsg}`,
				);
				session.turnComplete = true;
				writeActivity('task_failed', errMsg, msg.turn.id ?? undefined);
				observability.writeStatusSignal(
					'error',
					undefined,
					session.convModel,
					session.threadId ?? undefined,
					msg.turn.id ?? undefined,
				);
				emitEvent({
					type: 'task_failed',
					taskId: msg.turn.id ?? undefined,
					sessionId: session.threadId,
					content: errMsg,
					model: session.convModel,
					raw: msg,
				});
				return true;
			}

			if (msg.turn.status === 'interrupted') {
				const errMsg = 'Codex turn interrupted';
				session.turnError = new Error(
					'codex app-server turn interrupted',
				);
				session.turnComplete = true;
				writeActivity('task_failed', errMsg, msg.turn.id ?? undefined, {
					status: msg.turn.status,
				});
				observability.writeStatusSignal(
					'error',
					undefined,
					session.convModel,
					session.threadId ?? undefined,
					msg.turn.id ?? undefined,
				);
				emitEvent({
					type: 'task_failed',
					taskId: msg.turn.id ?? undefined,
					sessionId: session.threadId,
					content: errMsg,
					model: session.convModel,
					meta: { status: msg.turn.status },
					raw: msg,
				});
				return true;
			}

			if (msg.turn.items.length > 0) {
				const finalAgentMessage = [...msg.turn.items]
					.reverse()
					.find((item) => item.type === 'agentMessage');
				if (finalAgentMessage?.type === 'agentMessage') {
					session.lastAgentMessage = finalAgentMessage.text;
				}
			}

			session.turnComplete = true;
			const completedText =
				session.lastAgentMessage ??
				(session.messageBuffer.trim() || 'done');
			writeActivity(
				'task_completed',
				completedText,
				msg.turn.id ?? undefined,
				{
					status: msg.turn.status,
				},
			);
			observability.writeStatusSignal(
				'complete',
				undefined,
				session.convModel,
				session.threadId ?? undefined,
				msg.turn.id ?? undefined,
			);
			emitEvent({
				type: 'task_completed',
				taskId: msg.turn.id ?? undefined,
				sessionId: session.threadId,
				content: completedText,
				model: session.convModel,
				meta: { status: msg.turn.status },
				raw: msg,
			});
			return true;
		}

		case 'error': {
			const msg = params as ErrorNotification;
			const errMsg = msg.error?.message ?? 'Unknown codex error';
			writeActivity(
				msg.willRetry ? 'provider_event' : 'task_failed',
				errMsg,
				session.activeTurnId,
				{
					willRetry: msg.willRetry ?? false,
				},
			);

			if (msg.willRetry) {
				return true;
			}

			session.turnError = new Error(
				`codex app-server turn error: ${errMsg}`,
			);
			session.turnComplete = true;
			observability.writeStatusSignal(
				'error',
				undefined,
				session.convModel,
				session.threadId ?? undefined,
				session.activeTurnId ?? undefined,
			);
			emitEvent({
				type: 'task_failed',
				taskId: session.activeTurnId,
				sessionId: session.threadId,
				content: errMsg,
				model: session.convModel,
				raw: msg,
			});
			return true;
		}

		case 'turn/planUpdated': {
			const payload = params as {
				turnId?: string;
				steps?: Array<{ step: string; status: string }>;
			};
			const content = (payload.steps ?? [])
				.map((step) => `${step.status}:${step.step}`)
				.join('\n');
			emitPlanUpdate(
				content,
				payload.turnId ?? session.activeTurnId,
				payload,
			);
			return true;
		}

		case 'reasoning/textDelta':
		case 'item/plan/delta':
		case 'item/reasoning/textDelta':
		case 'item/reasoning/summaryTextDelta': {
			const payload = params as { turnId?: string; delta?: string };
			if (!payload.delta) return true;
			emitPlanUpdate(
				payload.delta,
				payload.turnId ?? session.activeTurnId,
				payload,
			);
			return true;
		}

		default:
			return false;
	}
}
