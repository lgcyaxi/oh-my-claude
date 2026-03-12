import type { CoworkerApprovalRequest } from '../types';
import type { CodexPendingApproval } from './conversation';

export function buildCodexApprovalPayload(
	request: CoworkerApprovalRequest,
	pending: CodexPendingApproval,
): {
	approved: boolean;
	payload:
		| { decision: string | Record<string, unknown> }
		| { answers: Record<string, { answers: string[] }> };
	resolvedDecision: string;
} {
	switch (pending.kind) {
		case 'command': {
			const payload = buildCodexCommandApprovalPayload(request);
			return {
				approved: !isCodexDeclinePayload(payload),
				resolvedDecision: describeCodexDecisionPayload(
					payload.decision,
				),
				payload,
			};
		}
		case 'file_change': {
			const mapped = mapCodexFileDecision(request.decision);
			return {
				approved: mapped !== 'decline' && mapped !== 'cancel',
				resolvedDecision: mapped,
				payload: { decision: mapped },
			};
		}
		case 'user_input': {
			const normalizedAnswers = normalizeCodexUserInputAnswers(
				request,
				pending,
			);
			return {
				approved: true,
				resolvedDecision: 'submit_answers',
				payload: {
					answers: Object.fromEntries(
						Object.entries(normalizedAnswers).map(
							([key, answers]) => [key, { answers }],
						),
					),
				},
			};
		}
		case 'legacy_command':
		case 'legacy_patch': {
			const payload = buildCodexLegacyApprovalPayload(request);
			return {
				approved: !isCodexLegacyDeclinePayload(payload),
				resolvedDecision: describeCodexDecisionPayload(
					payload.decision,
				),
				payload,
			};
		}
	}
}

export function ensureCodexDecisionAllowed(
	decisionOptions: string[] | undefined,
	resolvedDecision: string,
): void {
	if (!decisionOptions?.length) {
		return;
	}
	const normalizedOptions = decisionOptions.map(normalizeCodexDecisionOption);
	if (
		!normalizedOptions.includes(
			normalizeResolvedCodexDecision(resolvedDecision),
		)
	) {
		throw new Error(
			`Codex approval decision ${resolvedDecision} is not allowed for this request; expected one of ${decisionOptions.join(', ')}`,
		);
	}
}

function mapCodexCommandDecision(decision: string) {
	switch (normalizeApprovalToken(decision)) {
		case 'accept':
			return 'accept' as const;
		case 'acceptForSession':
			return 'acceptForSession' as const;
		case 'cancel':
			return 'cancel' as const;
		case 'decline':
			return 'decline' as const;
		default:
			throw new Error(`Unsupported Codex command decision: ${decision}`);
	}
}

function buildCodexCommandApprovalPayload(request: CoworkerApprovalRequest) {
	const explicitDecision = normalizeApprovalToken(request.decision);
	if (explicitDecision === 'decline' || explicitDecision === 'cancel') {
		return { decision: mapCodexCommandDecision(request.decision) } as const;
	}
	if (
		isExecPolicyAmendmentDecision(explicitDecision) &&
		!request.execPolicyAmendment?.length
	) {
		throw new Error(
			'Codex exec-policy amendment decisions require exec_policy_amendment',
		);
	}
	if (
		isNetworkPolicyAmendmentDecision(explicitDecision) &&
		!request.networkPolicyAmendment
	) {
		throw new Error(
			'Codex network-policy amendment decisions require network_policy_amendment',
		);
	}
	if (request.execPolicyAmendment?.length) {
		return {
			decision: {
				acceptWithExecpolicyAmendment: {
					execpolicy_amendment: request.execPolicyAmendment,
				},
			},
		} as const;
	}
	if (request.networkPolicyAmendment) {
		return {
			decision: {
				applyNetworkPolicyAmendment: {
					network_policy_amendment: request.networkPolicyAmendment,
				},
			},
		} as const;
	}
	return { decision: mapCodexCommandDecision(request.decision) } as const;
}

function mapCodexFileDecision(decision: string) {
	switch (normalizeApprovalToken(decision)) {
		case 'accept':
			return 'accept' as const;
		case 'acceptForSession':
			return 'acceptForSession' as const;
		case 'cancel':
			return 'cancel' as const;
		case 'decline':
			return 'decline' as const;
		default:
			throw new Error(
				`Unsupported Codex file-change decision: ${decision}`,
			);
	}
}

function mapCodexLegacyDecision(decision: string) {
	switch (normalizeApprovalToken(decision)) {
		case 'accept':
			return 'approved' as const;
		case 'acceptForSession':
			return 'approved_for_session' as const;
		case 'cancel':
			return 'abort' as const;
		case 'decline':
			return 'denied' as const;
		default:
			throw new Error(`Unsupported Codex legacy decision: ${decision}`);
	}
}

function buildCodexLegacyApprovalPayload(request: CoworkerApprovalRequest) {
	const explicitDecision = normalizeApprovalToken(request.decision);
	if (explicitDecision === 'decline' || explicitDecision === 'cancel') {
		return { decision: mapCodexLegacyDecision(request.decision) } as const;
	}
	if (
		isExecPolicyAmendmentDecision(explicitDecision) &&
		!request.execPolicyAmendment?.length
	) {
		throw new Error(
			'Codex exec-policy amendment decisions require exec_policy_amendment',
		);
	}
	if (
		isNetworkPolicyAmendmentDecision(explicitDecision) &&
		!request.networkPolicyAmendment
	) {
		throw new Error(
			'Codex network-policy amendment decisions require network_policy_amendment',
		);
	}
	if (request.execPolicyAmendment?.length) {
		return {
			decision: {
				approved_execpolicy_amendment: {
					proposed_execpolicy_amendment: request.execPolicyAmendment,
				},
			},
		} as const;
	}
	if (request.networkPolicyAmendment) {
		return {
			decision: {
				network_policy_amendment: {
					network_policy_amendment: request.networkPolicyAmendment,
				},
			},
		} as const;
	}
	return { decision: mapCodexLegacyDecision(request.decision) } as const;
}

function normalizeApprovalToken(decision: string): string {
	const raw = decision.trim();
	const lower = raw.toLowerCase().replace(/[\s-]+/g, '_');
	switch (lower) {
		case 'accept':
		case 'approve':
		case 'allow':
		case 'yes':
		case 'y':
		case 'once':
			return 'accept';
		case 'acceptforsession':
		case 'accept_for_session':
		case 'approve_for_session':
		case 'allow_for_session':
		case 'for_session':
		case 'session':
			return 'acceptForSession';
		case 'cancel':
		case 'abort':
			return 'cancel';
		case 'decline':
		case 'deny':
		case 'reject':
		case 'no':
		case 'n':
			return 'decline';
		case 'approved':
			return 'approve';
		case 'approved_for_session':
			return 'approve_for_session';
		case 'denied':
			return 'deny';
		case 'acceptwithexecpolicyamendment':
		case 'accept_with_execpolicy_amendment':
		case 'approved_execpolicy_amendment':
			return 'exec_policy_amendment';
		case 'applynetworkpolicyamendment':
		case 'apply_network_policy_amendment':
		case 'network_policy_amendment':
			return 'network_policy_amendment';
		default:
			return raw;
	}
}

function isExecPolicyAmendmentDecision(decision: string): boolean {
	return decision === 'exec_policy_amendment';
}

function isNetworkPolicyAmendmentDecision(decision: string): boolean {
	return decision === 'network_policy_amendment';
}

function normalizeCodexUserInputAnswers(
	request: CoworkerApprovalRequest,
	pending: Pick<CodexPendingApproval, 'questions'>,
): Record<string, string[]> {
	if (request.answers && Object.keys(request.answers).length > 0) {
		return request.answers;
	}

	if (pending.questions?.length === 1) {
		const question = pending.questions[0];
		if (!question) {
			throw new Error(
				'codex user-input approval is missing question metadata',
			);
		}
		const token = request.decision.trim();
		if (!token || token === 'submit' || token === 'approve') {
			throw new Error(
				'codex user-input approval requires answers for the pending question',
			);
		}
		return {
			[question.id]: [token],
		};
	}

	throw new Error('codex user-input approval requires answers');
}

function isCodexDeclinePayload(payload: {
	decision: string | Record<string, unknown>;
}): boolean {
	return payload.decision === 'decline' || payload.decision === 'cancel';
}

function isCodexLegacyDeclinePayload(payload: {
	decision: string | Record<string, unknown>;
}): boolean {
	return payload.decision === 'denied' || payload.decision === 'abort';
}

function describeCodexDecisionPayload(
	decision: string | Record<string, unknown>,
): string {
	if (typeof decision === 'string') {
		return decision;
	}
	if ('acceptWithExecpolicyAmendment' in decision) {
		return 'acceptWithExecpolicyAmendment';
	}
	if ('applyNetworkPolicyAmendment' in decision) {
		return 'applyNetworkPolicyAmendment';
	}
	if ('approved_execpolicy_amendment' in decision) {
		return 'approved_execpolicy_amendment';
	}
	if ('network_policy_amendment' in decision) {
		return 'network_policy_amendment';
	}
	return 'custom';
}

function normalizeCodexDecisionOption(option: string): string {
	switch (normalizeApprovalToken(option)) {
		case 'approve':
		case 'accept':
			return 'accept';
		case 'approve_for_session':
		case 'acceptForSession':
			return 'acceptForSession';
		case 'deny':
		case 'decline':
			return 'decline';
		case 'abort':
		case 'cancel':
			return 'cancel';
		case 'exec_policy_amendment':
			return 'exec_policy_amendment';
		case 'network_policy_amendment':
			return 'network_policy_amendment';
		case 'submit':
		case 'submit_answers':
			return 'submit';
		default:
			return option;
	}
}

function normalizeResolvedCodexDecision(resolvedDecision: string): string {
	switch (resolvedDecision) {
		case 'submit_answers':
			return 'submit';
		case 'accept':
		case 'approved':
			return 'accept';
		case 'acceptForSession':
		case 'approved_for_session':
			return 'acceptForSession';
		case 'decline':
		case 'denied':
			return 'decline';
		case 'cancel':
		case 'abort':
			return 'cancel';
		case 'acceptWithExecpolicyAmendment':
		case 'approved_execpolicy_amendment':
			return 'exec_policy_amendment';
		case 'applyNetworkPolicyAmendment':
		case 'network_policy_amendment':
			return 'network_policy_amendment';
		default:
			return resolvedDecision;
	}
}
