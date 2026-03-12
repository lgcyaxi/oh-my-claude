import type {
	ApplyPatchApprovalResponse,
	ExecCommandApprovalResponse,
	GitDiffToRemoteResponse,
} from './protocol';
import type {
	AskForApproval,
	CommandExecutionRequestApprovalResponse,
	FileChangeRequestApprovalResponse,
	ThreadArchiveParams,
	ThreadArchiveResponse,
	ThreadForkParams,
	ThreadForkResponse,
	ThreadRollbackParams,
	ThreadRollbackResponse,
	ThreadUnarchiveParams,
	ThreadUnarchiveResponse,
	ToolRequestUserInputResponse,
	TurnStartParams,
	TurnStartResponse,
} from './protocol/v2';
import type { RpcTransport } from './transport';
import type { ConversationSession } from './conversation';
import type { CodexObservability } from './observability';
import type { CoworkerTaskEvent } from '../types';

type ApprovalResponsePayload =
	| CommandExecutionRequestApprovalResponse
	| FileChangeRequestApprovalResponse
	| ToolRequestUserInputResponse
	| ExecCommandApprovalResponse
	| ApplyPatchApprovalResponse;

export interface CodexAppServerOpsContext {
	projectPath: string;
	approvalPolicy: AskForApproval;
	requestTimeoutMs: number;
	transport: RpcTransport | null;
	session: ConversationSession;
	observability: CodexObservability;
	ensureStarted(): Promise<void>;
	ensureViewer(): boolean;
	waitForTurnResult(
		timeoutMs: number,
		taskId?: string,
		reviewThreadId?: string | null,
	): Promise<{
		content: string;
		taskId?: string | null;
		sessionId?: string | null;
		reviewThreadId?: string | null;
	}>;
	emitActivity(event: Omit<CoworkerTaskEvent, 'target' | 'timestamp'>): void;
}

function requireTransport(
	ctx: CodexAppServerOpsContext,
	message = 'codex app-server: transport not available',
): RpcTransport {
	if (!ctx.transport) {
		throw new Error(message);
	}
	return ctx.transport;
}

function requireThread(ctx: CodexAppServerOpsContext): {
	transport: RpcTransport;
	threadId: string;
} {
	const transport = requireTransport(ctx);
	if (!ctx.session.threadId) {
		throw new Error('codex app-server: no active thread');
	}
	return { transport, threadId: ctx.session.threadId };
}

export async function runCodexReview(
	ctx: CodexAppServerOpsContext,
	params: {
		target:
			| { type: 'uncommittedChanges' }
			| { type: 'baseBranch'; branch: string }
			| { type: 'commit'; sha: string; title?: string | null }
			| { type: 'custom'; instructions: string };
		delivery?: 'inline' | 'detached';
		timeoutMs?: number;
	},
): Promise<{
	content: string;
	taskId?: string | null;
	sessionId?: string | null;
	reviewThreadId?: string | null;
}> {
	await ctx.ensureStarted();
	const transport = requireTransport(ctx);

	ctx.ensureViewer();
	ctx.session.resetTurnState();
	ctx.observability.writeActivityLog(
		'review_started',
		params.target.type,
		ctx.session.convModel,
		ctx.session.threadId ?? undefined,
	);
	ctx.observability.writeStatusSignal(
		'thinking',
		undefined,
		ctx.session.convModel,
		ctx.session.threadId ?? undefined,
	);

	const result = await ctx.session.startReview(transport, params);
	return await ctx.waitForTurnResult(
		params.timeoutMs ?? ctx.requestTimeoutMs,
		result.turn.id ?? undefined,
		result.reviewThreadId,
	);
}

export async function forkCodexThread(
	ctx: CodexAppServerOpsContext,
	params: Pick<
		ThreadForkParams,
		| 'path'
		| 'model'
		| 'modelProvider'
		| 'cwd'
		| 'approvalPolicy'
		| 'sandbox'
		| 'config'
		| 'baseInstructions'
		| 'developerInstructions'
	> & {
		persistExtendedHistory?: boolean;
	} = {},
): Promise<ThreadForkResponse> {
	await ctx.ensureStarted();
	const { transport, threadId } = requireThread(ctx);

	const result = (await transport.send('thread/fork', {
		threadId,
		path: params.path ?? null,
		model: params.model ?? null,
		modelProvider: params.modelProvider ?? null,
		cwd: params.cwd ?? ctx.projectPath,
		approvalPolicy: params.approvalPolicy ?? ctx.approvalPolicy,
		sandbox: params.sandbox ?? null,
		config: params.config ?? null,
		baseInstructions: params.baseInstructions ?? null,
		developerInstructions: params.developerInstructions ?? null,
		persistExtendedHistory: params.persistExtendedHistory ?? false,
	})) as ThreadForkResponse;

	ctx.session.threadId = result.thread.id;
	ctx.session.convModel = result.model || ctx.session.convModel;
	ctx.observability.writeActivityLog(
		'fork_created',
		result.thread.id,
		ctx.session.convModel,
		result.thread.id,
	);
	ctx.observability.writeStatusSignal(
		'idle',
		undefined,
		ctx.session.convModel,
		ctx.session.threadId ?? undefined,
	);
	return result;
}

export async function rollbackCodexThread(
	ctx: CodexAppServerOpsContext,
	numTurns: number,
): Promise<ThreadRollbackResponse> {
	await ctx.ensureStarted();
	const { transport, threadId } = requireThread(ctx);

	const result = (await transport.send('thread/rollback', {
		threadId,
		numTurns,
	} as ThreadRollbackParams)) as ThreadRollbackResponse;
	ctx.observability.writeActivityLog(
		'tool_activity',
		`thread rollback · ${numTurns}`,
		ctx.session.convModel,
		ctx.session.threadId ?? undefined,
	);
	return result;
}

export async function archiveCodexThread(
	ctx: CodexAppServerOpsContext,
): Promise<ThreadArchiveResponse> {
	await ctx.ensureStarted();
	const { transport, threadId } = requireThread(ctx);

	const result = (await transport.send('thread/archive', {
		threadId,
	} as ThreadArchiveParams)) as ThreadArchiveResponse;
	ctx.observability.writeActivityLog(
		'tool_activity',
		'thread archive',
		ctx.session.convModel,
		ctx.session.threadId ?? undefined,
	);
	return result;
}

export async function unarchiveCodexThread(
	ctx: CodexAppServerOpsContext,
): Promise<ThreadUnarchiveResponse> {
	await ctx.ensureStarted();
	const { transport, threadId } = requireThread(ctx);

	const result = (await transport.send('thread/unarchive', {
		threadId,
	} as ThreadUnarchiveParams)) as ThreadUnarchiveResponse;
	ctx.session.threadId = result.thread.id;
	ctx.observability.writeActivityLog(
		'tool_activity',
		'thread unarchive',
		ctx.session.convModel,
		ctx.session.threadId ?? undefined,
	);
	return result;
}

export async function getCodexDiff(
	ctx: CodexAppServerOpsContext,
): Promise<GitDiffToRemoteResponse | { diff: string }> {
	await ctx.ensureStarted();
	const transport = requireTransport(ctx);
	if (ctx.session.lastTurnDiff) {
		return { diff: ctx.session.lastTurnDiff };
	}
	return (await transport.send('gitDiffToRemote', {
		cwd: ctx.projectPath,
	})) as GitDiffToRemoteResponse;
}

export async function respondToCodexApproval(
	ctx: CodexAppServerOpsContext,
	requestId: number,
	payload: ApprovalResponsePayload,
): Promise<boolean> {
	if (!ctx.transport) {
		return false;
	}

	const pending = ctx.session.pendingApprovals.get(requestId);
	if (!pending) {
		return false;
	}

	await ctx.transport.respond(requestId, payload);
	ctx.session.resolveApproval(requestId);
	ctx.observability.writeActivityLog(
		'tool_activity',
		`approval resolved · ${pending.kind}`,
		ctx.session.convModel,
		pending.threadId,
		pending.turnId,
		{ requestId: String(requestId) },
	);
	return true;
}

export async function sendCodexTurn(
	ctx: CodexAppServerOpsContext,
	message: string,
	options?: { approvalPolicy?: AskForApproval | null },
): Promise<void> {
	const { transport, threadId } = requireThread(ctx);

	ctx.ensureViewer();
	ctx.session.resetTurnState();
	ctx.observability.writeActivityLog(
		'task_started',
		message,
		ctx.session.convModel,
		ctx.session.threadId ?? undefined,
	);
	ctx.observability.writeStatusSignal(
		'thinking',
		undefined,
		ctx.session.convModel,
		ctx.session.threadId ?? undefined,
	);

	const turnParams: TurnStartParams = {
		threadId,
		input: [{ type: 'text', text: message, text_elements: [] }],
		cwd: ctx.projectPath,
		approvalPolicy: options?.approvalPolicy ?? ctx.approvalPolicy,
		sandboxPolicy: { type: 'dangerFullAccess' },
		model: ctx.session.convModel,
		effort: null,
		summary: 'auto',
		personality: null,
		outputSchema: null,
		collaborationMode: null,
	};
	const result = (await transport.send(
		'turn/start',
		turnParams,
	)) as TurnStartResponse;
	ctx.session.markTurnStarted(result.turn.id ?? null);
	ctx.emitActivity({
		type: 'task_started',
		content: message,
		sessionId: ctx.session.threadId ?? undefined,
		taskId: result.turn.id ?? undefined,
		model: ctx.session.convModel,
	});
	ctx.observability.writeStatusSignal(
		'thinking',
		undefined,
		ctx.session.convModel,
		ctx.session.threadId ?? undefined,
		result.turn.id ?? undefined,
	);
}
