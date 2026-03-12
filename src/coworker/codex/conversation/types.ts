import type { CoworkerTaskEvent } from '../../types';

export interface NotificationHandlerHelpers {
	writeActivity: (
		type: CoworkerTaskEvent['type'],
		content: string,
		taskId?: string | null,
		meta?: Record<string, unknown>,
	) => void;
	emitPlanUpdate: (
		content: string,
		taskId?: string | null,
		raw?: unknown,
		meta?: Record<string, unknown>,
	) => void;
	emitToolActivity: (
		content: string,
		taskId?: string | null,
		raw?: unknown,
		meta?: Record<string, unknown>,
	) => void;
	stringifyProgress: (value: unknown) => string;
}
