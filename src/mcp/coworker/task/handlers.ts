import type { CallToolResult } from '../../shared/types';

import {
	buildScopedCodexReviewPrompt,
	recommendCodexReviewTimeout,
} from '../review-helpers';
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

	let timeoutMs: number | undefined;
	let reviewMode: 'scoped-diff' | 'native' = 'native';

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
		timeoutMs =
			target === 'codex'
				? recommendCodexReviewTimeout(
						projectRoot,
						reviewTarget,
						timeout_ms,
						paths,
					)
				: timeout_ms;
		const useScopedTaskReview =
			target === 'codex' && Array.isArray(paths) && paths.length > 0;
		reviewMode = useScopedTaskReview ? 'scoped-diff' : 'native';
		if (useScopedTaskReview && delivery === 'detached') {
			throw new Error(
				'Codex scoped review does not support delivery="detached" yet; omit delivery or use native review without paths.',
			);
		}

		const result = useScopedTaskReview
			? await coworker.runTask({
					message: buildScopedCodexReviewPrompt(
						projectRoot,
						reviewTarget,
						paths!,
						message,
					),
					timeoutMs,
					agent,
					providerId: provider_id,
					modelId: model_id,
					approvalPolicy: approval_policy,
					meta: {
						taskType: 'review',
						reviewMode,
						paths: paths!,
					},
				})
			: await coworker.reviewTask({
					message,
					timeoutMs,
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
			meta: {
				...(result.meta ?? {}),
				recommended_timeout_ms: timeoutMs ?? null,
				review_mode: reviewMode,
			},
		});
	} catch (error) {
		return errorResult(String(target ?? 'coworker'), error, {
			recommended_timeout_ms: timeoutMs ?? null,
			review_mode: reviewMode,
		});
	}
}
