import type {
	CoworkerApprovalRequest,
	CoworkerApprovalResult,
	CoworkerDiffRequest,
	CoworkerDiffResult,
	CoworkerForkRequest,
	CoworkerForkResult,
	CoworkerRevertRequest,
	CoworkerRevertResult,
} from '../../types';
import { buildOpenCodePermissionResponse } from '../permissions';
import type {
	OpenCodeSessionDiffEntry,
	OpenCodeSessionResponse,
} from '../types';
import type { OpenCodeRuntimeActionContext } from './types';

export async function diffOpenCodeSession(
	ctx: OpenCodeRuntimeActionContext,
	request?: CoworkerDiffRequest,
): Promise<CoworkerDiffResult> {
	try {
		const sessionId = await ctx.startSession();
		const url = new URL(`${ctx.server.baseUrl}/session/${sessionId}/diff`);
		if (request?.messageId) {
			url.searchParams.set('messageID', request.messageId);
		}
		const response = await fetch(url, {
			signal: AbortSignal.timeout(10_000),
		});
		if (!response.ok) {
			const body = await response.text().catch(() => '');
			throw new Error(
				`Failed to get OpenCode diff: ${response.status} ${body}`.trim(),
			);
		}
		const entries = (await response.json()) as OpenCodeSessionDiffEntry[];
		const content = entries
			.map((entry) =>
				[entry.path ?? '(unknown path)', entry.diff ?? ''].join('\n'),
			)
			.join('\n\n')
			.trim();
		ctx.observability.writeActivity({
			type: 'diff_updated',
			content: content || '(no diff)',
			sessionId,
			meta: { messageId: request?.messageId ?? null },
		});
		return {
			coworker: ctx.name,
			sessionId,
			content: content || '(no diff)',
			entries,
			meta: {
				operation: 'diff',
				messageId: request?.messageId ?? null,
			},
		};
	} finally {
		ctx.scheduleViewerCloseIfIdle();
	}
}

export async function forkOpenCodeSession(
	ctx: OpenCodeRuntimeActionContext,
	request?: CoworkerForkRequest,
): Promise<CoworkerForkResult> {
	try {
		const parentSessionId = await ctx.startSession();
		const response = await fetch(
			`${ctx.server.baseUrl}/session/${parentSessionId}/fork`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ messageID: request?.messageId }),
				signal: AbortSignal.timeout(10_000),
			},
		);
		if (!response.ok) {
			const body = await response.text().catch(() => '');
			throw new Error(
				`Failed to fork OpenCode session: ${response.status} ${body}`.trim(),
			);
		}
		const session = (await response.json()) as OpenCodeSessionResponse;
		ctx.setSessionId(session.id);
		await ctx.syncViewerSession(session.id);
		ctx.observability.writeActivity({
			type: 'fork_created',
			content: session.id,
			sessionId: session.id,
			meta: { parentSessionId },
		});
		const runtimeMeta = ctx.getCurrentRuntimeMeta();
		return {
			coworker: ctx.name,
			sessionId: session.id,
			parentSessionId,
			model:
				typeof runtimeMeta.model === 'string'
					? runtimeMeta.model
					: undefined,
			provider:
				typeof runtimeMeta.provider === 'string'
					? runtimeMeta.provider
					: undefined,
			meta: {
				operation: 'fork',
				parentSessionId,
				...runtimeMeta,
			},
		};
	} finally {
		ctx.scheduleViewerCloseIfIdle();
	}
}

export async function approveOpenCodePermission(
	ctx: OpenCodeRuntimeActionContext,
	request: CoworkerApprovalRequest,
): Promise<CoworkerApprovalResult> {
	try {
		const sessionId = request.sessionId ?? ctx.getSessionId();
		if (!sessionId) {
			throw new Error('OpenCode approval requires a session_id');
		}
		if (!request.permissionId) {
			throw new Error('OpenCode approval requires a permission_id');
		}
		const pending = ctx.pendingPermissions.get(request.permissionId);
		const approvalResponse = buildOpenCodePermissionResponse(
			request,
			pending,
		);

		const response = await fetch(
			`${ctx.server.baseUrl}/session/${sessionId}/permissions/${request.permissionId}`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(approvalResponse.body),
				signal: AbortSignal.timeout(10_000),
			},
		);
		if (!response.ok) {
			const body = await response.text().catch(() => '');
			throw new Error(
				`Failed to approve OpenCode permission: ${response.status} ${body}`.trim(),
			);
		}
		ctx.pendingPermissions.delete(request.permissionId);
		ctx.observability.writeActivity({
			type: 'tool_activity',
			content: `permission resolved · ${request.permissionId}`,
			sessionId,
			meta: {
				requestId: request.permissionId,
				summary: pending?.summary ?? null,
				kind: pending?.kind ?? null,
				status: pending?.status ?? null,
				lastEventType: pending?.lastEventType ?? null,
				decisionOptions: pending?.decisionOptions ?? [],
				decision: approvalResponse.resolvedDecision,
				remember: request.remember ?? false,
				details: pending?.details ?? null,
			},
		});
		return {
			coworker: ctx.name,
			approved: true,
			requestId: request.permissionId,
			sessionId,
			meta: {
				operation: 'approve',
				decision: request.decision,
				resolvedDecision: approvalResponse.resolvedDecision,
				summary: pending?.summary ?? null,
				kind: pending?.kind ?? null,
				status: pending?.status ?? null,
				lastEventType: pending?.lastEventType ?? null,
				decisionOptions: pending?.decisionOptions ?? [],
				remember: approvalResponse.body.remember,
				details: pending?.details ?? null,
			},
		};
	} finally {
		ctx.scheduleViewerCloseIfIdle();
	}
}

export async function revertOpenCodeSession(
	ctx: OpenCodeRuntimeActionContext,
	request: CoworkerRevertRequest,
): Promise<CoworkerRevertResult> {
	try {
		const sessionId = await ctx.startSession();
		const endpoint = request.undo ? 'unrevert' : 'revert';
		const response = await fetch(
			`${ctx.server.baseUrl}/session/${sessionId}/${endpoint}`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: request.undo
					? JSON.stringify({})
					: JSON.stringify({
							messageID: request.messageId,
							partID: request.partId,
						}),
				signal: AbortSignal.timeout(10_000),
			},
		);
		if (!response.ok) {
			const body = await response.text().catch(() => '');
			throw new Error(
				`Failed to ${endpoint} OpenCode session: ${response.status} ${body}`.trim(),
			);
		}
		return {
			coworker: ctx.name,
			sessionId,
			reverted: true,
			meta: {
				operation: request.undo ? 'unrevert' : 'revert',
				undo: request.undo ?? false,
				messageId: request.messageId ?? null,
				partId: request.partId ?? null,
			},
		};
	} finally {
		ctx.scheduleViewerCloseIfIdle();
	}
}

export async function cancelOpenCodeTask(
	ctx: OpenCodeRuntimeActionContext,
): Promise<boolean> {
	const sessionId = ctx.getSessionId();
	const activeAbortController = ctx.getActiveAbortController();
	if (!sessionId || !activeAbortController) {
		return false;
	}
	activeAbortController.abort();
	void ctx.server.executeTuiCommand('session_interrupt');
	void ctx.server.showTuiToast({
		title: 'oh-my-claude',
		message: 'OpenCode coworker task interrupted',
		variant: 'warning',
		duration: 2500,
	});
	try {
		const response = await fetch(
			`${ctx.server.baseUrl}/session/${sessionId}/abort`,
			{
				method: 'POST',
				signal: AbortSignal.timeout(5_000),
			},
		);
		return response.ok;
	} catch {
		return false;
	}
}
