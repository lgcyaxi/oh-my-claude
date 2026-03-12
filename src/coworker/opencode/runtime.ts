import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
	CoworkerObservability,
	getCoworkerLogPath,
	readCoworkerStatusSignal,
	readRecentCoworkerActivity,
} from '../observability';
import type {
	CoworkerActivityEntry,
	CoworkerApprovalRequest,
	CoworkerApprovalResult,
	CoworkerDiffRequest,
	CoworkerDiffResult,
	CoworkerForkRequest,
	CoworkerForkResult,
	CoworkerRevertRequest,
	CoworkerRevertResult,
	CoworkerReviewRequest,
	CoworkerRuntime,
	CoworkerStatus,
	CoworkerTaskRequest,
	CoworkerTaskResult,
} from '../types';
import { OpenCodeServerProcess } from './server';
import { spawnOpenCodeViewer, type ViewerHandle } from './viewer';
import {
	buildOpenCodeRuntimeMeta,
	currentOpenCodeModelLabel,
	ensureOpenCodeSession,
	type OpenCodeExecutionConfig,
	resolveOpenCodeExecutionConfig,
} from './execution';
import {
	syncOpenCodePermissionState,
	type OpenCodePendingPermission,
} from './permissions';
import {
	approveOpenCodePermission,
	cancelOpenCodeTask,
	diffOpenCodeSession,
	forkOpenCodeSession,
	reviewOpenCodeTask,
	revertOpenCodeSession,
	streamOpenCodeTask,
} from './runtime/actions';

const runtimes = new Map<string, OpenCodeCoworkerRuntime>();
const VIEWER_IDLE_CLOSE_MS = 20_000;

export class OpenCodeCoworkerRuntime implements CoworkerRuntime {
	readonly name = 'opencode';

	private readonly server: OpenCodeServerProcess;
	private readonly observability = new CoworkerObservability('opencode');
	private sessionId: string | null = null;
	private startedAt: string | null = null;
	private requestedAgent: string | null = null;
	private agentName: string | null = null;
	private agentNative: boolean | null = null;
	private providerId: string | null = null;
	private modelId: string | null = null;
	private lastActivityAt: string | null = null;
	private activeTaskCount = 0;
	private activeAbortController: AbortController | null = null;
	private viewer: ViewerHandle | null = null;
	private viewerCloseTimer: NodeJS.Timeout | null = null;
	private pendingPermissions = new Map<string, OpenCodePendingPermission>();

	constructor(private readonly projectPath: string) {
		this.server = new OpenCodeServerProcess(projectPath);
	}

	ensureViewer(sessionId?: string | null): boolean {
		if (process.env.OPENCODE_NO_VIEWER === '1') {
			return false;
		}
		this.clearViewerCloseTimer();
		if (this.viewer?.attached) {
			return true;
		}
		this.viewer?.close();
		this.viewer = spawnOpenCodeViewer(
			this.server.baseUrl,
			this.projectPath,
			sessionId ?? this.sessionId,
		);
		return this.viewer.attached;
	}

	async startSession(): Promise<string> {
		await this.server.start();
		const sessionId = await this.ensureSession();
		if (this.startedAt === null) {
			this.startedAt = new Date().toISOString();
		}
		this.ensureViewer(sessionId);
		await this.syncViewerSession(sessionId);
		this.observability.writeStatus({
			state: 'idle',
			sessionId,
			model: this.currentModelLabel() ?? undefined,
			meta: this.currentRuntimeMeta(),
		});
		return sessionId;
	}

	async runTask(request: CoworkerTaskRequest): Promise<CoworkerTaskResult> {
		return this.streamTask(request);
	}

	async streamTask(
		request: CoworkerTaskRequest,
		onEvent?: (event: import('../types').CoworkerTaskEvent) => void,
	): Promise<CoworkerTaskResult> {
		return streamOpenCodeTask(this.createActionContext(), request, onEvent);
	}

	async reviewTask(
		request: CoworkerReviewRequest,
	): Promise<CoworkerTaskResult> {
		return reviewOpenCodeTask(this.createActionContext(), request);
	}

	async getDiff(request?: CoworkerDiffRequest): Promise<CoworkerDiffResult> {
		return diffOpenCodeSession(this.createActionContext(), request);
	}

	async forkSession(
		request?: CoworkerForkRequest,
	): Promise<CoworkerForkResult> {
		return forkOpenCodeSession(this.createActionContext(), request);
	}

	async approve(
		request: CoworkerApprovalRequest,
	): Promise<CoworkerApprovalResult> {
		return approveOpenCodePermission(this.createActionContext(), request);
	}

	async revert(
		request: CoworkerRevertRequest,
	): Promise<CoworkerRevertResult> {
		return revertOpenCodeSession(this.createActionContext(), request);
	}

	async cancelTask(_taskId?: string): Promise<boolean> {
		return cancelOpenCodeTask(this.createActionContext());
	}

	async stop(): Promise<void> {
		this.clearViewerCloseTimer();
		this.sessionId = null;
		this.requestedAgent = null;
		this.agentName = null;
		this.agentNative = null;
		this.providerId = null;
		this.modelId = null;
		this.activeTaskCount = 0;
		this.pendingPermissions.clear();
		this.activeAbortController?.abort();
		this.activeAbortController = null;
		this.viewer?.close();
		this.viewer = null;
		await this.server.stop();
		this.observability.writeStatus({ state: 'idle' });
	}

	getStatus(): CoworkerStatus {
		const signal = readCoworkerStatusSignal('opencode');
		return {
			name: this.name,
			projectPath: this.projectPath,
			status: this.server.status,
			startedAt: this.startedAt,
			sessionId: this.sessionId,
			activeTaskCount: this.activeTaskCount,
			lastActivityAt: this.lastActivityAt,
			logAvailable: existsSync(getCoworkerLogPath('opencode')),
			viewerAvailable: process.env.OPENCODE_NO_VIEWER !== '1',
			viewerAttached: this.viewer?.attached ?? false,
			signalState: signal?.state ?? null,
			requestedAgent: this.requestedAgent,
			agent: this.agentName,
			agentNative: this.agentNative,
			provider: this.providerId,
			model: this.modelId,
			approvalPolicy: 'external',
			pendingApprovals: [...this.pendingPermissions.entries()].map(
				([requestId, permission]) => ({
					requestId,
					kind: permission.kind ?? 'permission',
					summary: permission.summary,
					sessionId: permission.sessionId,
					status: permission.status ?? null,
					lastEventType: permission.lastEventType ?? null,
					decisionOptions: permission.decisionOptions,
					details: {
						rawDecisionOptions: permission.decisionOptions,
						kind: permission.kind ?? null,
						status: permission.status ?? null,
						lastEventType: permission.lastEventType ?? null,
						...(permission.details ?? {}),
					},
				}),
			),
		};
	}

	async getRecentActivity(limit = 20): Promise<CoworkerActivityEntry[]> {
		return readRecentCoworkerActivity('opencode', limit);
	}

	private async ensureSession(): Promise<string> {
		const sessionId = await ensureOpenCodeSession(
			this.server,
			this.projectPath,
			this.sessionId,
		);
		this.sessionId = sessionId;
		return sessionId;
	}

	private async resolveExecutionConfig(
		request: CoworkerTaskRequest,
	): Promise<OpenCodeExecutionConfig> {
		const execution = await resolveOpenCodeExecutionConfig({
			server: this.server,
			request,
			state: {
				requestedAgent: this.requestedAgent,
				agentName: this.agentName,
				agentNative: this.agentNative,
				providerId: this.providerId,
				modelId: this.modelId,
			},
		});
		this.requestedAgent = execution.requestedAgent;
		this.agentName = execution.agent;
		this.agentNative = execution.agentNative;
		this.providerId = execution.providerId;
		this.modelId = execution.modelId;
		return execution;
	}

	private currentModelLabel(): string | null {
		return currentOpenCodeModelLabel(this.providerId, this.modelId);
	}

	private currentRuntimeMeta(): Record<string, unknown> {
		return buildOpenCodeRuntimeMeta({
			requestedAgent: this.requestedAgent,
			agentName: this.agentName,
			agentNative: this.agentNative,
			providerId: this.providerId,
			modelId: this.modelId,
		});
	}

	private async syncViewerSession(sessionId: string): Promise<void> {
		if (process.env.OPENCODE_NO_VIEWER === '1') {
			return;
		}
		await this.server.selectTuiSession(sessionId);
	}

	private capturePermissionEvent(
		type: string,
		properties: Record<string, unknown> | undefined,
		sessionId: string,
	): void {
		syncOpenCodePermissionState({
			type,
			properties,
			sessionId,
			pendingPermissions: this.pendingPermissions,
			observability: this.observability,
		});
	}

	private clearViewerCloseTimer(): void {
		if (this.viewerCloseTimer) {
			clearTimeout(this.viewerCloseTimer);
			this.viewerCloseTimer = null;
		}
	}

	private scheduleViewerCloseIfIdle(): void {
		this.clearViewerCloseTimer();
		if (
			this.activeTaskCount > 0 ||
			process.env.OPENCODE_KEEP_VIEWER === '1'
		) {
			return;
		}
		this.viewerCloseTimer = setTimeout(() => {
			this.viewer?.close();
			this.viewer = null;
			this.viewerCloseTimer = null;
		}, VIEWER_IDLE_CLOSE_MS);
	}

	private createActionContext() {
		return {
			name: this.name,
			projectPath: this.projectPath,
			server: this.server,
			observability: this.observability,
			pendingPermissions: this.pendingPermissions,
			runTask: (request: CoworkerTaskRequest) => this.runTask(request),
			startSession: () => this.startSession(),
			resolveExecutionConfig: (request: CoworkerTaskRequest) =>
				this.resolveExecutionConfig(request),
			getCurrentModelLabel: () => this.currentModelLabel(),
			getCurrentRuntimeMeta: () => this.currentRuntimeMeta(),
			getSessionId: () => this.sessionId,
			setSessionId: (sessionId: string | null) => {
				this.sessionId = sessionId;
			},
			getActiveAbortController: () => this.activeAbortController,
			setActiveAbortController: (controller: AbortController | null) => {
				this.activeAbortController = controller;
			},
			incrementActiveTaskCount: () => {
				this.activeTaskCount += 1;
			},
			decrementActiveTaskCount: () => {
				this.activeTaskCount = Math.max(0, this.activeTaskCount - 1);
			},
			setLastActivityAt: (value: string | null) => {
				this.lastActivityAt = value;
			},
			scheduleViewerCloseIfIdle: () => this.scheduleViewerCloseIfIdle(),
			syncViewerSession: (sessionId: string) =>
				this.syncViewerSession(sessionId),
			capturePermissionEvent: (
				type: string,
				properties: Record<string, unknown> | undefined,
				sessionId: string,
			) => this.capturePermissionEvent(type, properties, sessionId),
			updateResolvedModel: ({
				requestedAgent,
				agentName,
				agentNative,
				providerId,
				modelId,
			}: {
				requestedAgent?: string | null;
				agentName: string | null;
				agentNative?: boolean | null;
				providerId: string | null;
				modelId: string | null;
			}) => {
				if (requestedAgent !== undefined) {
					this.requestedAgent = requestedAgent;
				}
				this.agentName = agentName;
				if (agentNative !== undefined) {
					this.agentNative = agentNative;
				}
				this.providerId = providerId;
				this.modelId = modelId;
			},
		} as const;
	}
}

export function getOpenCodeCoworker(
	projectPath = process.cwd(),
): OpenCodeCoworkerRuntime {
	const normalized = resolve(projectPath);
	const existing = runtimes.get(normalized);
	if (existing) {
		return existing;
	}

	const runtime = new OpenCodeCoworkerRuntime(normalized);
	runtimes.set(normalized, runtime);
	return runtime;
}

export function listOpenCodeCoworkers(): CoworkerStatus[] {
	return [...runtimes.values()].map((runtime) => runtime.getStatus());
}

export async function stopOpenCodeCoworker(
	projectPath = process.cwd(),
): Promise<void> {
	const normalized = resolve(projectPath);
	const runtime = runtimes.get(normalized);
	if (!runtime) return;
	await runtime.stop();
	runtimes.delete(normalized);
}

export function resetOpenCodeCoworkers(): void {
	runtimes.clear();
}
