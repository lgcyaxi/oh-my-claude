import type { CallToolResult } from '../shared/types';
import type { CoworkerReviewTarget } from '../../coworker/types';
import { toErrorMessage } from '../../shared/utils';

export type CoworkerTaskAction =
	| 'send'
	| 'review'
	| 'diff'
	| 'fork'
	| 'approve'
	| 'revert'
	| 'status'
	| 'recent_activity';

export async function resolveCoworker(target: string, projectRoot: string) {
	const { getOpenCodeCoworker } = await import('../../coworker');
	if (target === 'opencode') {
		return getOpenCodeCoworker(projectRoot);
	}
	throw new Error(`Unsupported coworker target: ${target}`);
}

export function errorResult(
	target: string,
	error: unknown,
	meta?: Record<string, unknown>,
): CallToolResult {
	return {
		content: [
			{
				type: 'text',
				text: JSON.stringify({
					error:
						toErrorMessage(error),
					target,
					...(meta ? { meta } : {}),
				}),
			},
		],
		isError: true,
	};
}

export function successResult(
	payload: Record<string, unknown>,
): CallToolResult {
	return {
		content: [
			{
				type: 'text',
				text: JSON.stringify(payload),
			},
		],
	};
}

export function normalizeCoworkerTaskAction(
	action: string,
): CoworkerTaskAction | null {
	switch (action) {
		case 'send':
		case 'review':
		case 'diff':
		case 'fork':
		case 'approve':
		case 'revert':
		case 'status':
		case 'recent_activity':
			return action;
		default:
			return null;
	}
}

export function buildReviewTarget(args: {
	review_target?: string;
	base_branch?: string;
	commit_sha?: string;
	commit_title?: string;
	instructions?: string;
}): CoworkerReviewTarget {
	switch (args.review_target) {
		case 'baseBranch':
			if (!args.base_branch) {
				throw new Error(
					'base_branch is required for baseBranch review',
				);
			}
			return { type: 'baseBranch', branch: args.base_branch };
		case 'commit':
			if (!args.commit_sha) {
				throw new Error('commit_sha is required for commit review');
			}
			return {
				type: 'commit',
				sha: args.commit_sha,
				title: args.commit_title ?? null,
			};
		case 'custom':
			if (!args.instructions) {
				throw new Error('instructions is required for custom review');
			}
			return { type: 'custom', instructions: args.instructions };
		case undefined:
		case 'uncommittedChanges':
			return { type: 'uncommittedChanges' };
		default:
			throw new Error(`Unsupported review_target: ${args.review_target}`);
	}
}
