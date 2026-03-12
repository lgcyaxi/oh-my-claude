import {
	CoworkerObservability,
	type CoworkerActivityEntry,
	type CoworkerSignalState,
} from '../observability';

export class CodexObservability extends CoworkerObservability {
	constructor() {
		super('codex');
	}

	writeActivityLog(
		type: CoworkerActivityEntry['type'],
		content: string,
		model?: string,
		sessionId?: string,
		taskId?: string,
		meta?: Record<string, unknown>,
	): void {
		this.writeActivity({
			type,
			content,
			sessionId,
			taskId,
			model,
			meta,
		});
	}

	override writeStatusSignal(
		state: CoworkerSignalState,
		tool?: string,
		model?: string,
		sessionId?: string,
		taskId?: string,
	): void {
		super.writeStatusSignal(state, tool, model, sessionId, taskId);
	}
}
