import { resolve } from 'node:path';

import type { AIConfig } from './internal/daemon/types';
import { readRecentCoworkerActivity } from './observability';
import { CodexAppServerDaemon } from './codex';
import {
	normalizeCodexApprovalPolicy,
	stringifyCodexApprovalPolicy,
} from './codex/approval-policy';
import type {
	CoworkerApprovalRequest,
	CoworkerApprovalResult,
	CoworkerActivityEntry,
	CoworkerDiffRequest,
	CoworkerDiffResult,
	CoworkerForkRequest,
	CoworkerForkResult,
	CoworkerRevertRequest,
	CoworkerRevertResult,
	CoworkerReviewRequest,
	CoworkerRuntime,
	CoworkerStatus,
	CoworkerTaskEvent,
	CoworkerTaskRequest,
	CoworkerTaskResult,
} from './types';
import {
	approveCodexRequest,
	diffCodexSession,
	forkCodexSession,
	revertCodexSession,
	reviewCodexTask,
	streamCodexTask,
} from './codex/runtime/actions';
import { buildCodexStatus } from './codex/runtime/status';

const DEFAULT_CODEX_CONFIG: AIConfig = {
	name: 'codex',
	cliCommand: 'codex',
	cliArgs: ['app-server'],
	idleTimeoutMs: 60_000,
	requestTimeoutMs: 300_000,
	maxRetries: 3,
};

const runtimes = new Map<string, CodexCoworkerRuntime>();
const VIEWER_IDLE_CLOSE_MS = 20_000;

export class CodexCoworkerRuntime implements CoworkerRuntime {
	readonly name = 'codex';

	private readonly daemon: CodexAppServerDaemon;
	private startedAt: string | null = null;
	private lastActivityAt: string | null = null;
	private activeTaskCount = 0;
	private viewerCloseTimer: NodeJS.Timeout | null = null;

	constructor(private readonly projectPath: string) {
		this.daemon = new CodexAppServerDaemon({
			config: { ...DEFAULT_CODEX_CONFIG },
			projectPath,
		});
	}

	async startSession(): Promise<string> {
		if (
			this.daemon.getStatus() === 'stopped' ||
			this.daemon.getStatus() === 'error'
		) {
			await this.daemon.start();
		}
		this.clearViewerCloseTimer();
		this.daemon.ensureViewer();
		if (this.startedAt === null) {
			this.startedAt = new Date().toISOString();
		}
		return this.daemon.getSessionId() ?? 'codex-session';
	}

	async runTask(request: CoworkerTaskRequest): Promise<CoworkerTaskResult> {
		return this.streamTask(request);
	}

	async streamTask(
		request: CoworkerTaskRequest,
		onEvent?: (event: CoworkerTaskEvent) => void,
	): Promise<CoworkerTaskResult> {
		return streamCodexTask(this.createRuntimeContext(), request, onEvent);
	}

	async cancelTask(_taskId?: string): Promise<boolean> {
		return this.daemon.interruptActiveTurn();
	}

	async getRecentActivity(limit = 20): Promise<CoworkerActivityEntry[]> {
		return readRecentCoworkerActivity('codex', limit);
	}

	async stop(): Promise<void> {
		this.clearViewerCloseTimer();
		this.activeTaskCount = 0;
		await this.daemon.stop();
	}

	getStatus(): CoworkerStatus {
		return buildCodexStatus(this.createRuntimeContext());
	}

	async reviewTask(
		request: CoworkerReviewRequest,
	): Promise<CoworkerTaskResult> {
		return reviewCodexTask(this.createRuntimeContext(), request);
	}

	async getDiff(_request?: CoworkerDiffRequest): Promise<CoworkerDiffResult> {
		return diffCodexSession(this.createRuntimeContext(), _request);
	}

	async forkSession(
		request?: CoworkerForkRequest,
	): Promise<CoworkerForkResult> {
		return forkCodexSession(this.createRuntimeContext(), request);
	}

	async approve(
		request: CoworkerApprovalRequest,
	): Promise<CoworkerApprovalResult> {
		return approveCodexRequest(this.createRuntimeContext(), request);
	}

	async revert(
		request: CoworkerRevertRequest,
	): Promise<CoworkerRevertResult> {
		return revertCodexSession(this.createRuntimeContext(), request);
	}

	private clearViewerCloseTimer(): void {
		if (this.viewerCloseTimer) {
			clearTimeout(this.viewerCloseTimer);
			this.viewerCloseTimer = null;
		}
	}

	private scheduleViewerCloseIfIdle(): void {
		this.clearViewerCloseTimer();
		if (this.activeTaskCount > 0 || process.env.CODEX_KEEP_VIEWER === '1') {
			return;
		}
		this.viewerCloseTimer = setTimeout(() => {
			this.daemon.closeViewer();
			this.viewerCloseTimer = null;
		}, VIEWER_IDLE_CLOSE_MS);
	}

	private async ensureApprovalPolicy(overridePolicy?: string): Promise<void> {
		const nextPolicy = normalizeCodexApprovalPolicy(
			overridePolicy ?? process.env.OMC_CODEX_APPROVAL_POLICY,
		);
		if (
			this.currentApprovalPolicy() ===
			stringifyCodexApprovalPolicy(nextPolicy)
		) {
			return;
		}
		const wasRunning = this.daemon.getStatus() === 'running';
		if (wasRunning) {
			await this.daemon.stop();
		}
		this.daemon.setApprovalPolicy(nextPolicy);
		this.startedAt = null;
		this.lastActivityAt = null;
	}

	private currentApprovalPolicy(): string {
		if (typeof this.daemon.getApprovalPolicy !== 'function') {
			return 'never';
		}
		const policy = this.daemon.getApprovalPolicy();
		return stringifyCodexApprovalPolicy(policy);
	}

	private createRuntimeContext() {
		return {
			name: this.name,
			projectPath: this.projectPath,
			daemon: this.daemon,
			getStartedAt: () => this.startedAt,
			setStartedAt: (value: string | null) => {
				this.startedAt = value;
			},
			getLastActivityAt: () => this.lastActivityAt,
			setLastActivityAt: (value: string | null) => {
				this.lastActivityAt = value;
			},
			getActiveTaskCount: () => this.activeTaskCount,
			incrementActiveTaskCount: () => {
				this.activeTaskCount += 1;
			},
			decrementActiveTaskCount: () => {
				this.activeTaskCount = Math.max(0, this.activeTaskCount - 1);
			},
			scheduleViewerCloseIfIdle: () => this.scheduleViewerCloseIfIdle(),
			ensureApprovalPolicy: (overridePolicy?: string) =>
				this.ensureApprovalPolicy(overridePolicy),
			currentApprovalPolicy: () => this.currentApprovalPolicy(),
		} as const;
	}
}

export function getCodexCoworker(
	projectPath = process.cwd(),
): CodexCoworkerRuntime {
	const normalized = resolve(projectPath);
	const existing = runtimes.get(normalized);
	if (existing) return existing;
	const runtime = new CodexCoworkerRuntime(normalized);
	runtimes.set(normalized, runtime);
	return runtime;
}

export function listCodexCoworkers(): CoworkerStatus[] {
	return [...runtimes.values()].map((runtime) => runtime.getStatus());
}

export async function stopCodexCoworker(
	projectPath = process.cwd(),
): Promise<void> {
	const normalized = resolve(projectPath);
	const runtime = runtimes.get(normalized);
	if (!runtime) return;
	await runtime.stop();
	runtimes.delete(normalized);
}

export function resetCodexCoworkers(): void {
	runtimes.clear();
}
