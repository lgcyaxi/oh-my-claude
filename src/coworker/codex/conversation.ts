import type { RpcTransport } from './transport';
import type { CodexObservability } from './observability';
import type { CoworkerTaskEvent } from '../types';
import { registerConversationApproval } from './conversation/approvals';
import { handleConversationNotification } from './conversation/notifications';
import type { GetAuthStatusResponse } from './protocol';
import type {
	ReviewStartResponse,
	AskForApproval,
	ThreadStartParams,
	ThreadStartResponse,
} from './protocol/v2';

export interface CodexPendingApproval {
	requestId: number;
	kind:
		| 'command'
		| 'file_change'
		| 'user_input'
		| 'legacy_command'
		| 'legacy_patch';
	itemId: string;
	turnId: string;
	threadId: string;
	summary: string;
	decisionOptions: string[];
	questions?: Array<{
		id: string;
		header: string;
		question: string;
		options: string[];
		isOther: boolean;
		isSecret: boolean;
	}>;
	details?: Record<string, unknown>;
	params: unknown;
}

export class ConversationSession {
	threadId: string | null = null;
	convModel = 'gpt-5.3-codex';
	activeTurnId: string | null = null;

	messageBuffer = '';
	turnComplete = false;
	lastAgentMessage: string | null = null;
	turnError: Error | null = null;
	lastTurnDiff: string | null = null;
	reviewThreadId: string | null = null;
	readonly pendingApprovals = new Map<number, CodexPendingApproval>();

	async checkAuth(transport: RpcTransport): Promise<void> {
		const result = (await transport.send(
			'getAuthStatus',
			{},
		)) as GetAuthStatusResponse;

		if (!result.authMethod) {
			throw new Error(
				'codex app-server: not authenticated.\nRun: omc auth openai   (or: codex login)',
			);
		}
	}

	async initThread(
		transport: RpcTransport,
		projectPath: string,
		approvalPolicy: AskForApproval,
	): Promise<void> {
		const params: ThreadStartParams = {
			model: null,
			modelProvider: null,
			cwd: projectPath,
			approvalPolicy,
			sandbox: 'danger-full-access',
			config: null,
			serviceName: 'oh-my-claude',
			baseInstructions: null,
			developerInstructions: null,
			personality: null,
			ephemeral: false,
			experimentalRawEvents: false,
			persistExtendedHistory: false,
		};
		const result = (await transport.send(
			'thread/start',
			params,
		)) as ThreadStartResponse;

		this.threadId = result.thread.id;
		this.convModel = result.model || this.convModel;
	}

	async startReview(
		transport: RpcTransport,
		params: {
			target:
				| { type: 'uncommittedChanges' }
				| { type: 'baseBranch'; branch: string }
				| { type: 'commit'; sha: string; title?: string | null }
				| { type: 'custom'; instructions: string };
			delivery?: 'inline' | 'detached';
		},
	): Promise<ReviewStartResponse> {
		if (!this.threadId) {
			throw new Error('codex app-server: no active thread');
		}

		const result = (await transport.send('review/start', {
			threadId: this.threadId,
			target: params.target,
			delivery: params.delivery ?? 'inline',
		})) as ReviewStartResponse;

		this.activeTurnId = result.turn.id ?? null;
		this.reviewThreadId = result.reviewThreadId;
		return result;
	}

	registerApproval(
		requestId: number,
		method: string,
		params: unknown,
		observability: CodexObservability,
		emitEvent: (
			event: Omit<CoworkerTaskEvent, 'target' | 'timestamp'>,
		) => void,
	): void {
		registerConversationApproval({
			requestId,
			method,
			params,
			activeTurnId: this.activeTurnId,
			convModel: this.convModel,
			pendingApprovals: this.pendingApprovals,
			observability,
			emitEvent,
		});
	}

	resolveApproval(requestId: number): void {
		this.pendingApprovals.delete(requestId);
	}

	handleNotification(
		method: string,
		params: unknown,
		observability: CodexObservability,
		emitEvent: (
			event: Omit<CoworkerTaskEvent, 'target' | 'timestamp'>,
		) => void,
	): void {
		handleConversationNotification({
			session: this,
			method,
			params,
			observability,
			emitEvent,
		});
	}

	markTurnStarted(turnId: string | null): void {
		this.activeTurnId = turnId;
	}

	resetTurnState(): void {
		this.activeTurnId = null;
		this.messageBuffer = '';
		this.turnComplete = false;
		this.lastAgentMessage = null;
		this.turnError = null;
		this.lastTurnDiff = null;
		this.reviewThreadId = null;
		this.pendingApprovals.clear();
	}
}
