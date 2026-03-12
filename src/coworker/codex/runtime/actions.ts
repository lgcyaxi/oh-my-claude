import type {
	CoworkerApprovalRequest,
	CoworkerApprovalResult,
	CoworkerDiffRequest,
	CoworkerDiffResult,
	CoworkerForkRequest,
	CoworkerForkResult,
	CoworkerRevertRequest,
	CoworkerRevertResult,
	CoworkerReviewRequest,
	CoworkerTaskEvent,
	CoworkerTaskRequest,
	CoworkerTaskResult,
} from '../../types';
import {
	buildCodexApprovalPayload,
	ensureCodexDecisionAllowed,
} from '../approval-response';
import type { CodexRuntimeContext } from './types';

export async function streamCodexTask(
	ctx: CodexRuntimeContext,
	request: CoworkerTaskRequest,
	onEvent?: (event: CoworkerTaskEvent) => void,
): Promise<CoworkerTaskResult> {
	await ctx.ensureApprovalPolicy(request.approvalPolicy);
	await startCodexSession(ctx);
	const requestId = await ctx.daemon.queueRequest({
		message: request.message,
		context: request.context,
		priority: request.priority,
	});
	ctx.incrementActiveTaskCount();

	return await new Promise<CoworkerTaskResult>((resolveTask, rejectTask) => {
		const timeoutMs = request.timeoutMs ?? 300_000;
		let taskId: string | null = null;
		let finalModel = ctx.daemon.getModel();
		let settled = false;

		const cleanup = () => {
			ctx.daemon.off('activity', onActivity);
			ctx.daemon.off('response', onResponse);
			ctx.daemon.off('error', onError);
			clearTimeout(timeoutId);
		};

		const onActivity = ({ event }: { event: CoworkerTaskEvent }) => {
			ctx.setLastActivityAt(new Date(event.timestamp).toISOString());
			taskId = event.taskId ?? taskId;
			finalModel = event.model ?? finalModel;
			onEvent?.(event);
		};

		const onResponse = (event: {
			id: string;
			response: string;
			timestamp: number;
		}) => {
			if (event.id !== requestId || settled) return;
			settled = true;
			cleanup();
			ctx.decrementActiveTaskCount();
			ctx.scheduleViewerCloseIfIdle();
			ctx.setLastActivityAt(new Date(event.timestamp).toISOString());
			resolveTask({
				requestId,
				coworker: ctx.name,
				content: event.response,
				timestamp: new Date(event.timestamp),
				sessionId: ctx.daemon.getSessionId() ?? undefined,
				taskId: taskId ?? undefined,
				model: finalModel,
				meta: {
					operation: 'send',
					viewerAvailable: ctx.daemon.isViewerAvailable(),
					viewerAttached: ctx.daemon.isViewerAttached(),
					approvalPolicy: ctx.currentApprovalPolicy(),
				},
			});
		};

		const onError = (event: {
			id: string;
			error: unknown;
			timestamp: number;
		}) => {
			if (event.id !== requestId || settled) return;
			settled = true;
			cleanup();
			ctx.decrementActiveTaskCount();
			ctx.scheduleViewerCloseIfIdle();
			ctx.setLastActivityAt(new Date(event.timestamp).toISOString());
			rejectTask(
				event.error instanceof Error
					? event.error
					: new Error(String(event.error)),
			);
		};

		const timeoutId = setTimeout(() => {
			if (settled) return;
			settled = true;
			void ctx.daemon.interruptActiveTurn();
			cleanup();
			ctx.decrementActiveTaskCount();
			ctx.scheduleViewerCloseIfIdle();
			rejectTask(
				new Error(`Codex coworker task timed out after ${timeoutMs}ms`),
			);
		}, timeoutMs);

		ctx.daemon.on('activity', onActivity as never);
		ctx.daemon.on('response', onResponse as never);
		ctx.daemon.on('error', onError as never);
	});
}

export async function reviewCodexTask(
	ctx: CodexRuntimeContext,
	request: CoworkerReviewRequest,
): Promise<CoworkerTaskResult> {
	await ctx.ensureApprovalPolicy(request.approvalPolicy);
	await startCodexSession(ctx);
	ctx.incrementActiveTaskCount();
	try {
		const result = await ctx.daemon.runReview({
			target: request.target ?? ({ type: 'uncommittedChanges' } as const),
			delivery: request.delivery,
			timeoutMs: request.timeoutMs,
		});
		ctx.setLastActivityAt(new Date().toISOString());
		return {
			requestId: result.taskId ?? 'codex-review',
			coworker: ctx.name,
			content: result.content,
			timestamp: new Date(),
			sessionId: result.sessionId ?? undefined,
			taskId: result.taskId ?? undefined,
			model: ctx.daemon.getModel(),
			meta: {
				operation: 'review',
				reviewTargetType: (
					request.target ?? { type: 'uncommittedChanges' }
				).type,
				delivery: request.delivery ?? 'inline',
				reviewThreadId: result.reviewThreadId ?? null,
				viewerAvailable: ctx.daemon.isViewerAvailable(),
				viewerAttached: ctx.daemon.isViewerAttached(),
				approvalPolicy: ctx.currentApprovalPolicy(),
			},
		};
	} finally {
		ctx.decrementActiveTaskCount();
		ctx.scheduleViewerCloseIfIdle();
	}
}

export async function diffCodexSession(
	ctx: CodexRuntimeContext,
	_request?: CoworkerDiffRequest,
): Promise<CoworkerDiffResult> {
	await startCodexSession(ctx);
	const result = await ctx.daemon.getDiff();
	const diff = 'diff' in result ? result.diff : '';
	return {
		coworker: ctx.name,
		sessionId: ctx.daemon.getSessionId() ?? undefined,
		content: diff || '(no diff)',
		meta: {
			operation: 'diff',
			source: 'sha' in result ? 'gitDiffToRemote' : 'lastTurnDiff',
			...('sha' in result ? { sha: result.sha } : {}),
		},
	};
}

export async function forkCodexSession(
	ctx: CodexRuntimeContext,
	_request?: CoworkerForkRequest,
): Promise<CoworkerForkResult> {
	await startCodexSession(ctx);
	const parentSessionId = ctx.daemon.getSessionId();
	const result = await ctx.daemon.forkThread();
	ctx.setLastActivityAt(new Date().toISOString());
	return {
		coworker: ctx.name,
		sessionId: result.thread.id,
		parentSessionId,
		model: result.model,
		provider: result.modelProvider,
		meta: {
			operation: 'fork',
			cwd: result.cwd,
		},
	};
}

export async function approveCodexRequest(
	ctx: CodexRuntimeContext,
	request: CoworkerApprovalRequest,
): Promise<CoworkerApprovalResult> {
	const requestId = Number(request.requestId);
	if (!Number.isInteger(requestId)) {
		throw new Error('codex approval requires a numeric request_id');
	}

	const pending = ctx.daemon
		.getPendingApprovals()
		.find((entry) => entry.requestId === requestId);
	if (!pending) {
		throw new Error(`No pending Codex approval found for ${requestId}`);
	}

	const decision = request.decision;
	const {
		approved: accepted,
		payload,
		resolvedDecision,
	} = buildCodexApprovalPayload(request, pending);
	ensureCodexDecisionAllowed(pending.decisionOptions, resolvedDecision);

	const approved = await ctx.daemon.respondToApproval(
		requestId,
		payload as never,
	);
	ctx.setLastActivityAt(new Date().toISOString());
	return {
		coworker: ctx.name,
		approved,
		requestId: String(requestId),
		sessionId: ctx.daemon.getSessionId() ?? undefined,
		meta: {
			operation: 'approve',
			decision,
			accepted,
			kind: pending.kind,
			summary: pending.summary,
			resolvedDecision,
			decisionOptions: pending.decisionOptions,
			questions: pending.questions ?? null,
			details: pending.details ?? null,
		},
	};
}

export async function revertCodexSession(
	ctx: CodexRuntimeContext,
	request: CoworkerRevertRequest,
): Promise<CoworkerRevertResult> {
	const numTurns = Math.max(1, request.numTurns ?? 1);
	await ctx.daemon.rollbackThread(numTurns);
	ctx.setLastActivityAt(new Date().toISOString());
	return {
		coworker: ctx.name,
		sessionId: ctx.daemon.getSessionId() ?? undefined,
		reverted: true,
		meta: {
			operation: 'rollback',
			numTurns,
		},
	};
}

async function startCodexSession(ctx: CodexRuntimeContext): Promise<string> {
	const daemonStatus =
		typeof ctx.daemon.getStatus === 'function'
			? ctx.daemon.getStatus()
			: 'stopped';
	if (daemonStatus === 'stopped' || daemonStatus === 'error') {
		if (typeof ctx.daemon.start === 'function') {
			await ctx.daemon.start();
		}
	}
	if (typeof ctx.daemon.ensureViewer === 'function') {
		ctx.daemon.ensureViewer();
	}
	if (ctx.getStartedAt() === null) {
		ctx.setStartedAt(new Date().toISOString());
	}
	return ctx.daemon.getSessionId() ?? 'codex-session';
}
