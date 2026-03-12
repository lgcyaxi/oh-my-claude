import type { ToolContext, CallToolResult } from '../shared/types';

import { handleCoworkerReview, handleCoworkerSend } from './task/handlers';
import {
	handleCoworkerApprove,
	handleCoworkerDiff,
	handleCoworkerFork,
	handleCoworkerRecentActivity,
	handleCoworkerRevert,
	handleCoworkerStatus,
} from './task/session-handlers';
import {
	normalizeCoworkerTaskAction,
	type CoworkerTaskAction,
} from './tool-utils';

export async function handleCoworkerAction(
	action: CoworkerTaskAction,
	args: Record<string, unknown>,
	ctx: ToolContext,
): Promise<CallToolResult> {
	const projectRoot = ctx.getProjectRoot() ?? process.cwd();

	switch (action) {
		case 'send':
			return handleCoworkerSend(args, projectRoot);
		case 'review':
			return handleCoworkerReview(args, projectRoot);
		case 'diff':
			return handleCoworkerDiff(args, projectRoot);
		case 'fork':
			return handleCoworkerFork(args, projectRoot);
		case 'approve':
			return handleCoworkerApprove(args, projectRoot);
		case 'revert':
			return handleCoworkerRevert(args, projectRoot);
		case 'status':
			return handleCoworkerStatus(projectRoot);
		case 'recent_activity':
			return handleCoworkerRecentActivity(args, projectRoot);
	}
}

export function parseCoworkerTaskAction(action: unknown): CoworkerTaskAction {
	const normalized = normalizeCoworkerTaskAction(String(action ?? '').trim());
	if (!normalized) {
		throw new Error(`Unsupported coworker action: ${String(action ?? '')}`);
	}
	return normalized;
}
