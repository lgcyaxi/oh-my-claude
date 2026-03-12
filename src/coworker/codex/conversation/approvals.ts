import type { CodexObservability } from '../observability';
import { buildCodexPendingApproval } from '../pending-approvals';
import type { CoworkerTaskEvent } from '../../types';
import type { CodexPendingApproval } from '../conversation';

export function registerConversationApproval(args: {
	requestId: number;
	method: string;
	params: unknown;
	activeTurnId: string | null;
	convModel: string;
	pendingApprovals: Map<number, CodexPendingApproval>;
	observability: CodexObservability;
	emitEvent: (event: Omit<CoworkerTaskEvent, 'target' | 'timestamp'>) => void;
}): void {
	const approval = buildCodexPendingApproval(
		args.requestId,
		args.method,
		args.params,
		args.activeTurnId,
	);
	if (!approval) {
		return;
	}

	args.pendingApprovals.set(args.requestId, approval);
	args.observability.writeActivityLog(
		'approval_request',
		approval.summary,
		args.convModel,
		approval.threadId,
		approval.turnId,
		{
			requestId: String(approval.requestId),
			kind: approval.kind,
			itemId: approval.itemId,
		},
	);
	args.emitEvent({
		type: 'approval_request',
		sessionId: approval.threadId,
		taskId: approval.turnId,
		content: approval.summary,
		model: args.convModel,
		meta: {
			requestId: String(approval.requestId),
			kind: approval.kind,
			itemId: approval.itemId,
		},
		raw: args.params,
	});
}
