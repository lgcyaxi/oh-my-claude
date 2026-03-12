import type { ToolContext, CallToolResult } from '../shared/types';

import { handleCoworkerAction, parseCoworkerTaskAction } from './actions';
import { errorResult } from './tool-utils';

export {
	buildScopedCodexReviewPrompt,
	estimateCodexReviewTimeout,
	estimateCodexScopedPromptTimeout,
	parseGitShortStat,
	recommendCodexReviewTimeout,
} from './review-helpers';

export async function handleCoworkerTool(
	name: string,
	args: Record<string, unknown>,
	ctx: ToolContext,
): Promise<CallToolResult | undefined> {
	if (name !== 'coworker_task') {
		return undefined;
	}

	try {
		const action = parseCoworkerTaskAction(args.action);
		const nextArgs = { ...args };
		delete nextArgs.action;
		return await handleCoworkerAction(action, nextArgs, ctx);
	} catch (error) {
		return errorResult(String(args.target ?? 'coworker'), error);
	}
}
