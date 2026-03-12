import type { CoworkerReviewRequest, CoworkerTaskResult } from '../../../types';
import { buildOpenCodeReviewPrompt } from '../../types';
import type { OpenCodeRuntimeActionContext } from '../types';

export async function reviewOpenCodeTask(
	ctx: OpenCodeRuntimeActionContext,
	request: CoworkerReviewRequest,
): Promise<CoworkerTaskResult> {
	const target = request.target ?? { type: 'uncommittedChanges' };
	return ctx.runTask({
		message: buildOpenCodeReviewPrompt(
			target,
			request.message,
			request.paths,
		),
		context:
			request.paths && request.paths.length > 0
				? `Scoped review paths:\n${request.paths.map((path) => `- ${path}`).join('\n')}`
				: undefined,
		timeoutMs: request.timeoutMs,
		agent: request.agent,
		providerId: request.providerId,
		modelId: request.modelId,
		meta: {
			taskType: 'review',
			reviewMode:
				request.paths && request.paths.length > 0
					? 'scoped-prompt'
					: 'native-prompt',
			paths: request.paths ?? null,
		},
	});
}
