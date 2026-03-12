import type { DaemonStatus, RequestPriority } from './internal/daemon/types';
import type {
	CoworkerActivityEntry,
	CoworkerEventType,
	CoworkerSignalState,
	CoworkerStatusSignal,
} from './observability';

export interface CoworkerTaskRequest {
	message: string;
	context?: string;
	priority?: RequestPriority;
	timeoutMs?: number;
	agent?: string;
	providerId?: string;
	modelId?: string;
	approvalPolicy?: string;
	meta?: Record<string, unknown>;
}

export type CoworkerReviewTarget =
	| { type: 'uncommittedChanges' }
	| { type: 'baseBranch'; branch: string }
	| { type: 'commit'; sha: string; title?: string | null }
	| { type: 'custom'; instructions: string };

export interface CoworkerReviewRequest {
	target?: CoworkerReviewTarget;
	paths?: string[];
	delivery?: 'inline' | 'detached';
	timeoutMs?: number;
	message?: string;
	agent?: string;
	providerId?: string;
	modelId?: string;
	approvalPolicy?: string;
}

export interface CoworkerDiffRequest {
	messageId?: string;
}

export interface CoworkerDiffResult {
	coworker: string;
	sessionId?: string | null;
	content: string;
	entries?: unknown[];
	meta?: Record<string, unknown>;
}

export interface CoworkerForkRequest {
	messageId?: string;
}

export interface CoworkerForkResult {
	coworker: string;
	sessionId?: string | null;
	parentSessionId?: string | null;
	model?: string;
	provider?: string;
	meta?: Record<string, unknown>;
}

export interface CoworkerApprovalRequest {
	requestId?: string;
	sessionId?: string;
	permissionId?: string;
	decision: string;
	remember?: boolean;
	answers?: Record<string, string[]>;
	execPolicyAmendment?: string[];
	networkPolicyAmendment?: {
		host: string;
		action: string;
	};
}

export interface CoworkerApprovalResult {
	coworker: string;
	approved: boolean;
	requestId?: string;
	sessionId?: string | null;
	meta?: Record<string, unknown>;
}

export interface CoworkerRevertRequest {
	messageId?: string;
	partId?: string;
	undo?: boolean;
	numTurns?: number;
}

export interface CoworkerRevertResult {
	coworker: string;
	sessionId?: string | null;
	reverted: boolean;
	meta?: Record<string, unknown>;
}

export interface CoworkerTaskEvent {
	target: string;
	type: CoworkerEventType;
	content: string;
	timestamp: number;
	sessionId?: string | null;
	taskId?: string | null;
	model?: string;
	meta?: Record<string, unknown>;
	raw?: unknown;
}

export interface CoworkerTaskResult {
	requestId: string;
	coworker: string;
	content: string;
	timestamp: Date;
	sessionId?: string | null;
	taskId?: string | null;
	model?: string;
	meta?: Record<string, unknown>;
}

export interface CoworkerStatus {
	name: string;
	projectPath: string;
	status: DaemonStatus;
	startedAt: string | null;
	sessionId: string | null;
	activeTaskCount: number;
	lastActivityAt: string | null;
	logAvailable: boolean;
	viewerAvailable: boolean;
	viewerAttached: boolean;
	signalState: CoworkerSignalState | null;
	requestedAgent?: string | null;
	agent: string | null;
	agentNative?: boolean | null;
	provider: string | null;
	model: string | null;
	approvalPolicy?: string | null;
	pendingApprovals?: Array<{
		requestId: string;
		kind: string;
		summary: string;
		sessionId?: string | null;
		taskId?: string | null;
		status?: string | null;
		lastEventType?: string | null;
		decisionOptions?: string[];
		questions?: Array<{
			id: string;
			header: string;
			question: string;
			options: string[];
			isOther: boolean;
			isSecret: boolean;
		}>;
		details?: Record<string, unknown>;
	}>;
}

export interface CoworkerRuntime {
	readonly name: string;
	startSession(): Promise<string>;
	runTask(request: CoworkerTaskRequest): Promise<CoworkerTaskResult>;
	streamTask(
		request: CoworkerTaskRequest,
		onEvent?: (event: CoworkerTaskEvent) => void,
	): Promise<CoworkerTaskResult>;
	cancelTask(taskId?: string): Promise<boolean>;
	reviewTask?(request: CoworkerReviewRequest): Promise<CoworkerTaskResult>;
	getDiff?(request?: CoworkerDiffRequest): Promise<CoworkerDiffResult>;
	forkSession?(request?: CoworkerForkRequest): Promise<CoworkerForkResult>;
	approve?(request: CoworkerApprovalRequest): Promise<CoworkerApprovalResult>;
	revert?(request: CoworkerRevertRequest): Promise<CoworkerRevertResult>;
	getRecentActivity(limit?: number): Promise<CoworkerActivityEntry[]>;
	stop(): Promise<void>;
	getStatus(): CoworkerStatus;
}

export type {
	CoworkerActivityEntry,
	CoworkerEventType,
	CoworkerSignalState,
	CoworkerStatusSignal,
};
