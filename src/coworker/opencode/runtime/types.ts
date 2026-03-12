import type { CoworkerObservability } from '../../observability';
import type { CoworkerTaskEvent, CoworkerTaskRequest, CoworkerTaskResult } from '../../types';
import type { OpenCodeExecutionConfig } from '../execution';
import type { OpenCodePendingPermission } from '../permissions';
import type { OpenCodeServerProcess } from '../server';

export interface OpenCodeRuntimeActionContext {
	name: 'opencode';
	projectPath: string;
	server: OpenCodeServerProcess;
	observability: CoworkerObservability;
	pendingPermissions: Map<string, OpenCodePendingPermission>;
	runTask(request: CoworkerTaskRequest): Promise<CoworkerTaskResult>;
	startSession(): Promise<string>;
	resolveExecutionConfig(
		request: CoworkerTaskRequest,
	): Promise<OpenCodeExecutionConfig>;
	getCurrentModelLabel(): string | null;
	getCurrentRuntimeMeta(): Record<string, unknown>;
	getSessionId(): string | null;
	setSessionId(sessionId: string | null): void;
	getActiveAbortController(): AbortController | null;
	setActiveAbortController(controller: AbortController | null): void;
	incrementActiveTaskCount(): void;
	decrementActiveTaskCount(): void;
	setLastActivityAt(value: string | null): void;
	scheduleViewerCloseIfIdle(): void;
	syncViewerSession(sessionId: string): Promise<void>;
	capturePermissionEvent(
		type: string,
		properties: Record<string, unknown> | undefined,
		sessionId: string,
	): void;
	updateResolvedModel(args: {
		requestedAgent?: string | null;
		agentName: string | null;
		agentNative?: boolean | null;
		providerId: string | null;
		modelId: string | null;
	}): void;
}

export type OpenCodeEventEmitter = (event: Omit<CoworkerTaskEvent, 'target' | 'timestamp'>) => void;
