import type { CallToolResult } from '../../shared/types';

import { errorResult, resolveCoworker, successResult } from '../tool-utils';

export async function handleCoworkerDiff(
	args: Record<string, unknown>,
	projectRoot: string,
): Promise<CallToolResult> {
	const { target, message_id } = args as {
		target: string;
		message_id?: string;
	};
	try {
		const coworker = await resolveCoworker(target, projectRoot);
		if (!coworker.getDiff) {
			throw new Error(`${target} does not support coworker diff`);
		}
		const result = await coworker.getDiff({ messageId: message_id });
		return successResult({
			target,
			session_id: result.sessionId ?? null,
			diff: result.content,
			entries: result.entries ?? null,
			meta: result.meta ?? null,
		});
	} catch (error) {
		return errorResult(String(target ?? 'coworker'), error);
	}
}

export async function handleCoworkerFork(
	args: Record<string, unknown>,
	projectRoot: string,
): Promise<CallToolResult> {
	const { target, message_id } = args as {
		target: string;
		message_id?: string;
	};
	try {
		const coworker = await resolveCoworker(target, projectRoot);
		if (!coworker.forkSession) {
			throw new Error(`${target} does not support coworker fork`);
		}
		const result = await coworker.forkSession({ messageId: message_id });
		return successResult({
			target,
			session_id: result.sessionId ?? null,
			parent_session_id: result.parentSessionId ?? null,
			model: result.model ?? null,
			provider: result.provider ?? null,
			meta: result.meta ?? null,
		});
	} catch (error) {
		return errorResult(String(target ?? 'coworker'), error);
	}
}

export async function handleCoworkerApprove(
	args: Record<string, unknown>,
	projectRoot: string,
): Promise<CallToolResult> {
	const {
		target,
		request_id,
		session_id,
		permission_id,
		decision,
		remember,
		answers,
		exec_policy_amendment,
		network_policy_amendment,
	} = args as {
		target: string;
		request_id?: string;
		session_id?: string;
		permission_id?: string;
		decision: string;
		remember?: boolean;
		answers?: Record<string, string[]>;
		exec_policy_amendment?: string[];
		network_policy_amendment?: { host: string; action: string };
	};

	try {
		const coworker = await resolveCoworker(target, projectRoot);
		if (!coworker.approve) {
			throw new Error(`${target} does not support coworker approve`);
		}
		const result = await coworker.approve({
			requestId: request_id,
			sessionId: session_id,
			permissionId: permission_id,
			decision,
			remember,
			answers,
			execPolicyAmendment: exec_policy_amendment,
			networkPolicyAmendment: network_policy_amendment,
		});
		return successResult({
			target,
			approved: result.approved,
			request_id: result.requestId ?? null,
			session_id: result.sessionId ?? null,
			meta: result.meta ?? null,
		});
	} catch (error) {
		return errorResult(String(target ?? 'coworker'), error);
	}
}

export async function handleCoworkerRevert(
	args: Record<string, unknown>,
	projectRoot: string,
): Promise<CallToolResult> {
	const { target, message_id, part_id, undo, num_turns } = args as {
		target: string;
		message_id?: string;
		part_id?: string;
		undo?: boolean;
		num_turns?: number;
	};
	try {
		const coworker = await resolveCoworker(target, projectRoot);
		if (!coworker.revert) {
			throw new Error(`${target} does not support coworker revert`);
		}
		const result = await coworker.revert({
			messageId: message_id,
			partId: part_id,
			undo,
			numTurns: num_turns,
		});
		return successResult({
			target,
			session_id: result.sessionId ?? null,
			reverted: result.reverted,
			meta: result.meta ?? null,
		});
	} catch (error) {
		return errorResult(String(target ?? 'coworker'), error);
	}
}

export async function handleCoworkerStatus(
	projectRoot: string,
): Promise<CallToolResult> {
	const { listCodexCoworkers, listOpenCodeCoworkers } =
		await import('../../../coworker');
	return successResult({
		coworkers: [...listCodexCoworkers(), ...listOpenCodeCoworkers()],
	});
}

export async function handleCoworkerRecentActivity(
	args: Record<string, unknown>,
	projectRoot: string,
): Promise<CallToolResult> {
	const { target, limit } = args as { target?: string; limit?: number };
	try {
		if (target) {
			const coworker = await resolveCoworker(target, projectRoot);
			return successResult({
				activity: await coworker.getRecentActivity(limit),
			});
		}

		const { getCodexCoworker, getOpenCodeCoworker } =
			await import('../../../coworker');
		return successResult({
			activity: [
				...(await getCodexCoworker(projectRoot).getRecentActivity(
					limit,
				)),
				...(await getOpenCodeCoworker(projectRoot).getRecentActivity(
					limit,
				)),
			]
				.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
				.slice(0, limit ?? 20),
		});
	} catch (error) {
		return errorResult(String(target ?? 'coworker'), error);
	}
}
