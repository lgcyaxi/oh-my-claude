import type { ChildProcess } from 'node:child_process';

import { AIDaemon } from '../internal/daemon/base';
import type { AIConfig } from '../internal/daemon/types';
import type { CoworkerTaskEvent } from '../types';
import { RpcTransport } from './transport';
import { ConversationSession, type CodexPendingApproval } from './conversation';
import {
	archiveCodexThread,
	forkCodexThread,
	getCodexDiff,
	respondToCodexApproval,
	rollbackCodexThread,
	runCodexReview,
	sendCodexTurn,
	unarchiveCodexThread,
} from './app-server-ops';
import { normalizeCodexApprovalPolicy } from './approval-policy';
import { CodexObservability } from './observability';
import type {
	ApplyPatchApprovalResponse,
	ExecCommandApprovalResponse,
} from './protocol';
import type {
	CommandExecutionRequestApprovalResponse,
	FileChangeRequestApprovalResponse,
	AskForApproval,
	ThreadArchiveResponse,
	ThreadForkParams,
	ThreadForkResponse,
	ThreadRollbackResponse,
	ToolRequestUserInputResponse,
	ThreadUnarchiveResponse,
	TurnInterruptParams,
} from './protocol/v2';
import { spawnCodexViewer } from './viewer';
import type { ViewerHandle } from './viewer';
import {
	startCodexProcess,
	stopCodexProcess,
	verifyCodexInstallation,
} from './app-server/lifecycle';
import {
	attachCodexTransport,
	initializeCodexSession,
} from './app-server/transport';
import { handleCodexServerRequest } from './app-server/server-requests';

export interface CodexAppServerDaemonOptions {
	config: AIConfig;
	projectPath: string;
}

export class CodexAppServerDaemon extends AIDaemon {
	readonly name = 'codex-app-server';
	readonly config: AIConfig;

	private readonly projectPath: string;
	private approvalPolicy: AskForApproval = normalizeCodexApprovalPolicy(
		process.env.OMC_CODEX_APPROVAL_POLICY,
	);
	private proc: ChildProcess | null = null;
	private transport: RpcTransport | null = null;
	private readonly session = new ConversationSession();
	private readonly observability = new CodexObservability();
	private viewer: ViewerHandle | null = null;

	constructor(options: CodexAppServerDaemonOptions) {
		super();
		this.config = options.config;
		this.projectPath = options.projectPath;
	}

	override getProjectPath(): string | null {
		return this.projectPath;
	}

	getSessionId(): string | null {
		return this.session.threadId;
	}

	getModel(): string {
		return this.session.convModel;
	}

	getPendingApprovals(): CodexPendingApproval[] {
		return [...this.session.pendingApprovals.values()];
	}

	getApprovalPolicy(): AskForApproval {
		return this.approvalPolicy;
	}

	setApprovalPolicy(
		policy: AskForApproval | string | undefined | null,
	): void {
		this.approvalPolicy = normalizeCodexApprovalPolicy(policy);
	}

	isViewerAvailable(): boolean {
		return process.env.CODEX_NO_VIEWER !== '1';
	}

	isViewerAttached(): boolean {
		return this.viewer?.attached ?? false;
	}

	ensureViewer(): boolean {
		if (process.env.CODEX_NO_VIEWER === '1') {
			return false;
		}
		if (this.viewer?.attached) {
			return true;
		}
		this.viewer?.close();
		this.viewer = spawnCodexViewer();
		return this.viewer.attached;
	}

	closeViewer(): void {
		this.viewer?.close();
		this.viewer = null;
	}

	async start(): Promise<void> {
		await verifyCodexInstallation(this.config.cliCommand);
		this.setStatus('starting');
		this.observability.writeStatusSignal('starting');

		this.proc = startCodexProcess({
			command: this.config.cliCommand,
			commandArgs: [...(this.config.cliArgs ?? [])],
			projectPath: this.projectPath,
		});

		this.transport = new RpcTransport(this.proc);
		attachCodexTransport({
			transport: this.transport,
			session: this.session,
			observability: this.observability,
			emitActivity: (event) => {
				this.emitActivity(null, {
					target: 'codex',
					timestamp: Date.now(),
					...event,
				});
			},
			handleServerRequest: async (id, method, params) => {
				await this.handleServerRequest(id, method, params);
			},
		});

		this.proc.stderr?.on('data', (chunk: Buffer) => {
			process.stderr.write(
				`[codex-app-server] ${chunk.toString('utf8')}`,
			);
		});

		this.proc.on('error', (err) => {
			this.transport?.rejectAll(err);
			this.setStatus('error');
			this.observability.writeStatusSignal(
				'error',
				undefined,
				this.session.convModel,
				this.session.threadId ?? undefined,
			);
		});

		this.proc.on('close', (code) => {
			if (this.status === 'running' && code !== 0 && code !== null) {
				const err = new Error(
					`codex app-server exited with code ${code}`,
				);
				this.transport?.rejectAll(err);
				this.setStatus('error');
				this.observability.writeStatusSignal(
					'error',
					undefined,
					this.session.convModel,
					this.session.threadId ?? undefined,
				);
				if (!this.session.turnComplete && !this.session.turnError) {
					this.session.turnError = err;
				}
			}
		});

		await initializeCodexSession({
			transport: this.transport,
			session: this.session,
			projectPath: this.projectPath,
			approvalPolicy: this.approvalPolicy,
		});

		this.observability.writeActivityLog(
			'session_started',
			this.projectPath,
			this.session.convModel,
			this.session.threadId ?? undefined,
		);
		this.observability.writeStatusSignal(
			'idle',
			undefined,
			this.session.convModel,
			this.session.threadId ?? undefined,
		);

		this.setStatus('running');
		this.ensureViewer();
	}

	async stop(): Promise<void> {
		this.setStatus('stopping');
		const proc = this.proc;
		if (!proc) {
			this.setStatus('stopped');
			return;
		}

		await stopCodexProcess(proc);

		this.transport?.rejectAll(new Error('Daemon stopped'));
		this.proc = null;
		this.transport = null;
		this.session.threadId = null;
		this.closeViewer();
		this.observability.writeStatusSignal('idle');
		this.setStatus('stopped');
	}

	async interruptActiveTurn(): Promise<boolean> {
		if (
			!this.transport ||
			!this.session.threadId ||
			!this.session.activeTurnId
		) {
			return false;
		}

		try {
			const params: TurnInterruptParams = {
				threadId: this.session.threadId,
				turnId: this.session.activeTurnId,
			};
			await this.transport.send('turn/interrupt', params);
			this.observability.writeActivityLog(
				'tool_activity',
				'turn/interrupt',
				this.session.convModel,
				this.session.threadId ?? undefined,
				this.session.activeTurnId ?? undefined,
			);
			return true;
		} catch {
			return false;
		}
	}

	async runReview(params: {
		target:
			| { type: 'uncommittedChanges' }
			| { type: 'baseBranch'; branch: string }
			| { type: 'commit'; sha: string; title?: string | null }
			| { type: 'custom'; instructions: string };
		delivery?: 'inline' | 'detached';
		timeoutMs?: number;
	}): Promise<{
		content: string;
		taskId?: string | null;
		sessionId?: string | null;
		reviewThreadId?: string | null;
	}> {
		return runCodexReview(this.createOpsContext(), params);
	}

	async forkThread(
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
		return forkCodexThread(this.createOpsContext(), params);
	}

	async rollbackThread(numTurns: number): Promise<ThreadRollbackResponse> {
		return rollbackCodexThread(this.createOpsContext(), numTurns);
	}

	async archiveThread(): Promise<ThreadArchiveResponse> {
		return archiveCodexThread(this.createOpsContext());
	}

	async unarchiveThread(): Promise<ThreadUnarchiveResponse> {
		return unarchiveCodexThread(this.createOpsContext());
	}

	async getDiff(): Promise<
		import('./protocol').GitDiffToRemoteResponse | { diff: string }
	> {
		return getCodexDiff(this.createOpsContext());
	}

	async respondToApproval(
		requestId: number,
		payload:
			| CommandExecutionRequestApprovalResponse
			| FileChangeRequestApprovalResponse
			| ToolRequestUserInputResponse
			| ExecCommandApprovalResponse
			| ApplyPatchApprovalResponse,
	): Promise<boolean> {
		return respondToCodexApproval(
			this.createOpsContext(),
			requestId,
			payload,
		);
	}

	async send(
		message: string,
		options?: { approvalPolicy?: AskForApproval | null },
	): Promise<void> {
		return sendCodexTurn(this.createOpsContext(), message, options);
	}

	async checkResponse(): Promise<string | null> {
		if (this.session.turnError) {
			const err = this.session.turnError;
			this.session.turnError = null;
			throw err;
		}

		if (this.session.turnComplete) {
			this.session.turnComplete = false;
			const text =
				this.session.messageBuffer.trim() ||
				this.session.lastAgentMessage ||
				'(no response)';
			this.observability.writeStatusSignal(
				'complete',
				undefined,
				this.session.convModel,
				this.session.threadId ?? undefined,
			);
			return text;
		}

		return null;
	}

	private async waitForTurnResult(
		timeoutMs: number,
		taskId?: string,
		reviewThreadId?: string | null,
	): Promise<{
		content: string;
		taskId?: string | null;
		sessionId?: string | null;
		reviewThreadId?: string | null;
	}> {
		const startedAt = Date.now();
		while (Date.now() - startedAt < timeoutMs) {
			const response = await this.checkResponse();
			if (response !== null) {
				return {
					content: response,
					taskId: taskId ?? this.session.activeTurnId,
					sessionId: this.session.threadId,
					reviewThreadId:
						reviewThreadId ?? this.session.reviewThreadId,
				};
			}
			await new Promise((resolve) => setTimeout(resolve, 250));
		}

		await this.interruptActiveTurn();
		throw new Error(`Codex coworker review timed out after ${timeoutMs}ms`);
	}

	private async ensureStarted(): Promise<void> {
		if (this.status === 'running') {
			return;
		}
		await this.start();
	}

	private createOpsContext() {
		return {
			projectPath: this.projectPath,
			approvalPolicy: this.approvalPolicy,
			requestTimeoutMs: this.config.requestTimeoutMs,
			transport: this.transport,
			session: this.session,
			observability: this.observability,
			ensureStarted: () => this.ensureStarted(),
			ensureViewer: () => this.ensureViewer(),
			waitForTurnResult: (
				timeoutMs: number,
				taskId?: string,
				reviewThreadId?: string | null,
			) => this.waitForTurnResult(timeoutMs, taskId, reviewThreadId),
			emitActivity: (
				event: Omit<CoworkerTaskEvent, 'target' | 'timestamp'>,
			) => {
				this.emitActivity(null, {
					target: 'codex',
					timestamp: Date.now(),
					...event,
				});
			},
		};
	}

	private async handleServerRequest(
		id: number,
		method: string,
		params: unknown,
	): Promise<void> {
		await handleCodexServerRequest({
			id,
			method,
			params,
			transport: this.transport,
			session: this.session,
			observability: this.observability,
			emitActivity: (event) => {
				this.emitActivity(null, {
					target: 'codex',
					timestamp: Date.now(),
					...event,
				});
			},
		});
	}

	protected override shouldRetryRequest(error: unknown): boolean {
		return !(
			error instanceof Error && /turn interrupted/i.test(error.message)
		);
	}
}
