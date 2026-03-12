import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export type CoworkerEventType =
	| 'session_started'
	| 'task_started'
	| 'review_started'
	| 'text_delta'
	| 'plan_update'
	| 'tool_activity'
	| 'approval_request'
	| 'diff_updated'
	| 'fork_created'
	| 'task_completed'
	| 'task_failed'
	| 'provider_event';

export type CoworkerSignalState =
	| 'idle'
	| 'starting'
	| 'thinking'
	| 'streaming'
	| 'complete'
	| 'error';

export interface CoworkerStatusSignal {
	target: string;
	state: CoworkerSignalState;
	updatedAt: number;
	sessionId?: string;
	taskId?: string;
	model?: string;
	tool?: string;
	meta?: Record<string, unknown>;
	viewerAvailable?: boolean;
}

export interface CoworkerActivityEntry {
	ts: string;
	target: string;
	type: CoworkerEventType;
	content: string;
	sessionId?: string;
	taskId?: string;
	model?: string;
	meta?: Record<string, unknown>;
}

function ensureParent(path: string): void {
	mkdirSync(dirname(path), { recursive: true });
}

function getCoworkerStorageRoot(): string {
	return (
		process.env.OMC_COWORKER_STATE_DIR ||
		join(homedir(), '.claude', 'oh-my-claude')
	);
}

export function getCoworkerLogPath(target: string): string {
	return join(
		getCoworkerStorageRoot(),
		'logs',
		'coworker',
		`${target}.jsonl`,
	);
}

export function getCoworkerActivityLogPath(target: string): string {
	return getCoworkerLogPath(target);
}

export function getCoworkerStatusPath(target: string): string {
	return join(getCoworkerStorageRoot(), 'run', `${target}-status.json`);
}

export function getCoworkerStatusSignalPath(target: string): string {
	return getCoworkerStatusPath(target);
}

export function readCoworkerStatusSignal(
	target: string,
): CoworkerStatusSignal | null {
	const path = getCoworkerStatusPath(target);
	try {
		if (!existsSync(path)) return null;
		return JSON.parse(readFileSync(path, 'utf8')) as CoworkerStatusSignal;
	} catch {
		return null;
	}
}

export function readRecentCoworkerActivity(
	target: string,
	limit = 20,
): CoworkerActivityEntry[] {
	const path = getCoworkerLogPath(target);
	try {
		if (!existsSync(path)) return [];
		return readFileSync(path, 'utf8')
			.split('\n')
			.filter((line) => line.trim().length > 0)
			.slice(-Math.max(1, limit))
			.map((line) => {
				try {
					return JSON.parse(line) as CoworkerActivityEntry;
				} catch {
					return null;
				}
			})
			.filter((entry): entry is CoworkerActivityEntry => entry !== null);
	} catch {
		return [];
	}
}

export class CoworkerObservability {
	readonly activityLogPath: string;
	readonly statusSignalPath: string;

	constructor(readonly target: string) {
		this.activityLogPath = getCoworkerLogPath(target);
		this.statusSignalPath = getCoworkerStatusPath(target);
	}

	writeActivity(entry: Omit<CoworkerActivityEntry, 'ts' | 'target'>): void {
		try {
			ensureParent(this.activityLogPath);
			const payload: CoworkerActivityEntry = {
				ts: new Date().toISOString(),
				target: this.target,
				...entry,
			};
			appendFileSync(
				this.activityLogPath,
				`${JSON.stringify(payload)}\n`,
				'utf8',
			);
		} catch {}
	}

	appendActivity(entry: Omit<CoworkerActivityEntry, 'ts' | 'target'>): void {
		this.writeActivity(entry);
	}

	writeStatus(
		signal: Omit<CoworkerStatusSignal, 'target' | 'updatedAt'>,
	): void {
		try {
			ensureParent(this.statusSignalPath);
			const payload: CoworkerStatusSignal = {
				target: this.target,
				updatedAt: Date.now(),
				...signal,
			};
			const tmpPath = `${this.statusSignalPath}.tmp`;
			writeFileSync(tmpPath, JSON.stringify(payload), 'utf8');
			renameSync(tmpPath, this.statusSignalPath);
		} catch {}
	}

	writeStatusSignal(
		state: CoworkerSignalState,
		tool?: string,
		model?: string,
		sessionId?: string | null,
		taskId?: string | null,
	): void {
		this.writeStatus({
			state,
			tool,
			model,
			sessionId: sessionId ?? undefined,
			taskId: taskId ?? undefined,
		});
	}

	readRecentActivity(limit = 20): CoworkerActivityEntry[] {
		return readRecentCoworkerActivity(this.target, limit);
	}

	readStatus(): CoworkerStatusSignal | null {
		return readCoworkerStatusSignal(this.target);
	}
}
