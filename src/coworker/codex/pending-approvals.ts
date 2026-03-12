import type {
	CommandExecutionRequestApprovalParams,
	FileChangeRequestApprovalParams,
	ToolRequestUserInputParams,
} from './protocol/v2';
import type { CodexPendingApproval } from './conversation';

export function buildCodexPendingApproval(
	requestId: number,
	method: string,
	params: unknown,
	activeTurnId: string | null,
): CodexPendingApproval | null {
	switch (method) {
		case 'item/commandExecution/requestApproval': {
			const payload = params as CommandExecutionRequestApprovalParams;
			return {
				requestId,
				kind: 'command',
				itemId: payload.itemId,
				turnId: payload.turnId,
				threadId: payload.threadId,
				summary: payload.command
					? `command approval · ${payload.command}`
					: 'command approval',
				decisionOptions: normalizeCodexApprovalOptions(
					payload.availableDecisions,
					['accept', 'acceptForSession', 'decline', 'cancel'],
					'command',
				),
				details: {
					command: payload.command ?? null,
					cwd: payload.cwd ?? null,
					reason: payload.reason ?? null,
					additionalPermissions:
						payload.additionalPermissions ?? null,
					proposedExecPolicyAmendment:
						payload.proposedExecpolicyAmendment ?? null,
					proposedNetworkPolicyAmendments:
						payload.proposedNetworkPolicyAmendments ?? null,
				},
				params: payload,
			};
		}
		case 'item/fileChange/requestApproval': {
			const payload = params as FileChangeRequestApprovalParams;
			return {
				requestId,
				kind: 'file_change',
				itemId: payload.itemId,
				turnId: payload.turnId,
				threadId: payload.threadId,
				summary: payload.reason
					? `file change approval · ${payload.reason}`
					: 'file change approval',
				decisionOptions: [
					'accept',
					'acceptForSession',
					'decline',
					'cancel',
				],
				details: {
					reason: payload.reason ?? null,
					grantRoot: payload.grantRoot ?? null,
				},
				params: payload,
			};
		}
		case 'item/tool/requestUserInput': {
			const payload = params as ToolRequestUserInputParams;
			return {
				requestId,
				kind: 'user_input',
				itemId: payload.itemId,
				turnId: payload.turnId,
				threadId: payload.threadId,
				summary: payload.questions[0]?.question ?? 'request user input',
				decisionOptions: ['submit'],
				questions: payload.questions.map((question) => ({
					id: question.id,
					header: question.header,
					question: question.question,
					options:
						question.options?.map((option) => option.label) ?? [],
					isOther: question.isOther,
					isSecret: question.isSecret,
				})),
				details: {
					questionCount: payload.questions.length,
				},
				params: payload,
			};
		}
		case 'execCommandApproval': {
			const payload = params as {
				callId: string;
				conversationId: string;
				approvalId?: string | null;
				command?: string[];
				available_decisions?: unknown[];
			};
			return {
				requestId,
				kind: 'legacy_command',
				itemId: payload.approvalId ?? payload.callId,
				turnId: activeTurnId ?? payload.callId,
				threadId: payload.conversationId,
				summary: payload.command?.length
					? `command approval · ${payload.command.join(' ')}`
					: 'command approval',
				decisionOptions: normalizeCodexApprovalOptions(
					payload.available_decisions,
					['approved', 'approved_for_session', 'denied', 'abort'],
					'legacy',
				),
				details: {
					command: payload.command ?? null,
				},
				params: payload,
			};
		}
		case 'applyPatchApproval': {
			const payload = params as {
				callId: string;
				conversationId: string;
				reason?: string | null;
			};
			return {
				requestId,
				kind: 'legacy_patch',
				itemId: payload.callId,
				turnId: activeTurnId ?? payload.callId,
				threadId: payload.conversationId,
				summary: payload.reason
					? `patch approval · ${payload.reason}`
					: 'patch approval',
				decisionOptions: [
					'approved',
					'approved_for_session',
					'denied',
					'abort',
				],
				details: {
					reason: payload.reason ?? null,
				},
				params: payload,
			};
		}
		default:
			return null;
	}
}

function normalizeCodexApprovalOptions(
	options: unknown,
	fallback: string[],
	mode: 'command' | 'legacy',
): string[] {
	if (!Array.isArray(options)) {
		return fallback;
	}

	const normalized = options
		.map((entry) => {
			let option: string | null = null;
			if (typeof entry === 'string') {
				option = entry;
			}
			if (!option && entry && typeof entry === 'object') {
				option =
					Object.keys(entry as Record<string, unknown>)[0] ?? null;
			}
			return option
				? mapCodexApprovalOptionForDisplay(option, mode)
				: null;
		})
		.filter((entry): entry is string => Boolean(entry));

	return normalized.length > 0 ? [...new Set(normalized)] : fallback;
}

function mapCodexApprovalOptionForDisplay(
	option: string,
	mode: 'command' | 'legacy',
): string {
	switch (normalizeCodexApprovalToken(option)) {
		case 'accept':
			return mode === 'legacy' ? 'approved' : 'accept';
		case 'acceptForSession':
			return mode === 'legacy'
				? 'approved_for_session'
				: 'acceptForSession';
		case 'decline':
			return mode === 'legacy' ? 'denied' : 'decline';
		case 'cancel':
			return mode === 'legacy' ? 'abort' : 'cancel';
		case 'exec_policy_amendment':
			return mode === 'legacy'
				? 'approved_execpolicy_amendment'
				: 'acceptWithExecpolicyAmendment';
		case 'network_policy_amendment':
			return mode === 'legacy'
				? 'network_policy_amendment'
				: 'applyNetworkPolicyAmendment';
		default:
			return option;
	}
}

function normalizeCodexApprovalToken(option: string): string {
	const lower = option
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, '_');
	switch (lower) {
		case 'accept':
		case 'approve':
		case 'allow':
		case 'approved':
			return 'accept';
		case 'acceptforsession':
		case 'accept_for_session':
		case 'approve_for_session':
		case 'allow_for_session':
		case 'for_session':
		case 'session':
		case 'approved_for_session':
			return 'acceptForSession';
		case 'decline':
		case 'deny':
		case 'reject':
		case 'denied':
			return 'decline';
		case 'cancel':
		case 'abort':
			return 'cancel';
		case 'acceptwithexecpolicyamendment':
		case 'accept_with_execpolicy_amendment':
		case 'approved_execpolicy_amendment':
			return 'exec_policy_amendment';
		case 'applynetworkpolicyamendment':
		case 'apply_network_policy_amendment':
		case 'network_policy_amendment':
			return 'network_policy_amendment';
		default:
			return option;
	}
}
