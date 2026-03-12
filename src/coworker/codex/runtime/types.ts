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
	CoworkerStatus,
	CoworkerTaskEvent,
	CoworkerTaskRequest,
	CoworkerTaskResult,
} from '../../types';
import type { CodexAppServerDaemon } from '../app-server';

export interface CodexRuntimeContext {
	name: 'codex';
	projectPath: string;
	daemon: CodexAppServerDaemon;
	getStartedAt(): string | null;
	setStartedAt(value: string | null): void;
	getLastActivityAt(): string | null;
	setLastActivityAt(value: string | null): void;
	getActiveTaskCount(): number;
	incrementActiveTaskCount(): void;
	decrementActiveTaskCount(): void;
	scheduleViewerCloseIfIdle(): void;
	ensureApprovalPolicy(overridePolicy?: string): Promise<void>;
	currentApprovalPolicy(): string;
}

export interface CodexRuntimeActions {
	runTask(
		request: CoworkerTaskRequest,
		onEvent?: (event: CoworkerTaskEvent) => void,
	): Promise<CoworkerTaskResult>;
	reviewTask(request: CoworkerReviewRequest): Promise<CoworkerTaskResult>;
	getDiff(request?: CoworkerDiffRequest): Promise<CoworkerDiffResult>;
	forkSession(request?: CoworkerForkRequest): Promise<CoworkerForkResult>;
	approve(request: CoworkerApprovalRequest): Promise<CoworkerApprovalResult>;
	revert(request: CoworkerRevertRequest): Promise<CoworkerRevertResult>;
	buildStatus(): CoworkerStatus;
}
