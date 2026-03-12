import type { AskForApproval } from './protocol/v2';

const REJECT_KEYS = ['sandbox_approval', 'rules', 'mcp_elicitations'] as const;

type RejectKey = (typeof REJECT_KEYS)[number];

export function normalizeCodexApprovalPolicy(
	policy: AskForApproval | string | undefined | null,
): AskForApproval {
	if (policy && typeof policy !== 'string') {
		return policy;
	}
	const raw = policy?.trim();
	const normalized = raw?.toLowerCase().replace(/\s+/g, '');
	switch (normalized) {
		case undefined:
		case '':
		case 'never':
			return 'never';
		case 'on-request':
		case 'onrequest':
		case 'on_request':
			return 'on-request';
		case 'on-failure':
		case 'onfailure':
		case 'on_failure':
			return 'on-failure';
		case 'untrusted':
			return 'untrusted';
		case 'reject':
			return { reject: buildRejectFlags(REJECT_KEYS) };
		default:
			if (
				normalized?.startsWith('reject:') ||
				normalized?.startsWith('reject=')
			) {
				const separator = normalized.includes(':') ? ':' : '=';
				const suffix = normalized.slice(
					normalized.indexOf(separator) + 1,
				);
				const tokens = suffix
					.split(',')
					.map((token) => token.trim())
					.filter(Boolean)
					.flatMap((token) =>
						token === 'all'
							? [...REJECT_KEYS]
							: token === 'none'
								? []
								: [token as RejectKey],
					);
				const invalid = tokens.filter(
					(token) => !REJECT_KEYS.includes(token),
				);
				if (invalid.length > 0) {
					throw new Error(
						`Unsupported Codex reject approval policy keys: ${invalid.join(', ')}. Expected any of ${REJECT_KEYS.join(', ')}`,
					);
				}
				return { reject: buildRejectFlags(tokens as RejectKey[]) };
			}
			throw new Error(
				`Unsupported Codex approval policy: ${policy}. Expected one of never, on-request, on-failure, untrusted, reject.`,
			);
	}
}

export function stringifyCodexApprovalPolicy(
	policy: AskForApproval | string | undefined | null,
): string {
	if (!policy) {
		return 'never';
	}
	if (typeof policy === 'string') {
		const normalized = normalizeCodexApprovalPolicy(policy);
		if (typeof normalized === 'string') {
			return normalized;
		}
		policy = normalized;
	}
	const enabled = REJECT_KEYS.filter((key) => policy.reject[key]);
	return enabled.length > 0 ? `reject:${enabled.join(',')}` : 'reject:none';
}

function buildRejectFlags(keys: readonly RejectKey[]) {
	return {
		sandbox_approval: keys.includes('sandbox_approval'),
		rules: keys.includes('rules'),
		mcp_elicitations: keys.includes('mcp_elicitations'),
	};
}
