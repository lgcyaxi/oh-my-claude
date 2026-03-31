import type { CallToolResult } from '../../shared/types';

import {
	buildReviewTarget,
	errorResult,
	resolveCoworker,
	successResult,
} from '../tool-utils';

export async function handleCoworkerSend(
	args: Record<string, unknown>,
	projectRoot: string,
): Promise<CallToolResult> {
	const {
		target,
		message,
		timeout_ms,
		agent,
		provider_id,
		model_id,
		approval_policy,
	} = args as {
		target: string;
		message: string;
		timeout_ms?: number;
		agent?: string;
		provider_id?: string;
		model_id?: string;
		approval_policy?: string;
	};

	if (!message) {
		return errorResult(
			String(target ?? 'coworker'),
			new Error('message is required'),
		);
	}

	try {
		const coworker = await resolveCoworker(target, projectRoot);
		const result = await coworker.runTask({
			message,
			timeoutMs: timeout_ms,
			agent,
			providerId: provider_id,
			modelId: model_id,
			approvalPolicy: approval_policy,
		});
		return successResult({
			target,
			waited: true,
			response: result.content,
			request_id: result.requestId,
			session_id: result.sessionId ?? null,
			task_id: result.taskId ?? null,
			model: result.model ?? null,
			meta: result.meta ?? null,
		});
	} catch (error) {
		return errorResult(String(target ?? 'coworker'), error);
	}
}

export async function handleCoworkerReview(
	args: Record<string, unknown>,
	projectRoot: string,
): Promise<CallToolResult> {
	const {
		target,
		message,
		timeout_ms,
		review_target,
		base_branch,
		commit_sha,
		commit_title,
		instructions,
		delivery,
		agent,
		provider_id,
		model_id,
		paths,
		approval_policy,
	} = args as {
		target: string;
		message?: string;
		timeout_ms?: number;
		review_target?: string;
		base_branch?: string;
		commit_sha?: string;
		commit_title?: string;
		instructions?: string;
		delivery?: 'inline' | 'detached';
		agent?: string;
		provider_id?: string;
		model_id?: string;
		paths?: string[];
		approval_policy?: string;
	};

	try {
		const coworker = await resolveCoworker(target, projectRoot);
		if (!coworker.reviewTask) {
			throw new Error(`${target} does not support coworker review`);
		}
		const reviewTarget = buildReviewTarget({
			review_target,
			base_branch,
			commit_sha,
			commit_title,
			instructions,
		});

		const result = await coworker.reviewTask({
			message,
			timeoutMs: timeout_ms,
			agent,
			providerId: provider_id,
			modelId: model_id,
			approvalPolicy: approval_policy,
			paths,
			delivery,
			target: reviewTarget,
		});
		return successResult({
			target,
			response: result.content,
			request_id: result.requestId,
			session_id: result.sessionId ?? null,
			task_id: result.taskId ?? null,
			model: result.model ?? null,
			meta: result.meta ?? null,
		});
	} catch (error) {
		return errorResult(String(target ?? 'coworker'), error);
	}
}
