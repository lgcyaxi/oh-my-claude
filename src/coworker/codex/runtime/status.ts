import { existsSync } from 'node:fs';

import {
	getCoworkerLogPath,
	readCoworkerStatusSignal,
} from '../../observability';
import type { CoworkerStatus } from '../../types';
import type { CodexRuntimeContext } from './types';

export function buildCodexStatus(ctx: CodexRuntimeContext): CoworkerStatus {
	const signal = readCoworkerStatusSignal('codex');
	return {
		name: ctx.name,
		projectPath: ctx.projectPath,
		status: ctx.daemon.getStatus(),
		startedAt: ctx.getStartedAt(),
		sessionId: ctx.daemon.getSessionId(),
		activeTaskCount: ctx.getActiveTaskCount(),
		lastActivityAt: ctx.getLastActivityAt(),
		logAvailable: existsSync(getCoworkerLogPath('codex')),
		viewerAvailable: ctx.daemon.isViewerAvailable(),
		viewerAttached: ctx.daemon.isViewerAttached(),
		signalState: signal?.state ?? null,
		agent: null,
		provider: null,
		model: ctx.daemon.getModel(),
		approvalPolicy: ctx.currentApprovalPolicy(),
		pendingApprovals: ctx.daemon.getPendingApprovals().map((approval) => ({
			requestId: String(approval.requestId),
			kind: approval.kind,
			summary: approval.summary,
			sessionId: approval.threadId,
			taskId: approval.turnId,
			decisionOptions: approval.decisionOptions,
			questions: approval.questions,
			details: approval.details,
		})),
	};
}
