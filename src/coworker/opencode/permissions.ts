import { CoworkerObservability } from '../observability';
import type { CoworkerApprovalRequest } from '../types';

export interface OpenCodePendingPermission {
	sessionId: string;
	summary: string;
	decisionOptions: string[];
	kind?: string | null;
	status?: string | null;
	lastEventType?: string | null;
	details?: Record<string, unknown>;
}

export function syncOpenCodePermissionState(args: {
	type: string;
	properties: Record<string, unknown> | undefined;
	sessionId: string;
	pendingPermissions: Map<string, OpenCodePendingPermission>;
	observability: CoworkerObservability;
}): void {
	if (!/permission/i.test(args.type)) {
		return;
	}
	const permissionId = extractOpenCodePermissionId(args.properties);
	if (!permissionId) {
		return;
	}
	if (isOpenCodePermissionResolutionEvent(args.type, args.properties)) {
		const pending = args.pendingPermissions.get(permissionId);
		const summary = describeOpenCodePermissionEvent(
			args.type,
			args.properties,
		);
		args.observability.writeActivity({
			type: 'tool_activity',
			content: pending?.summary
				? `${pending.summary} · ${summary}`
				: summary,
			sessionId: args.sessionId,
			meta: {
				permissionId,
				summary: pending?.summary ?? null,
				status: extractOpenCodePermissionStatus(args.properties),
				kind:
					pending?.kind ??
					extractOpenCodePermissionKind(args.properties),
				lastEventType: args.type,
				decisionOptions: pending?.decisionOptions ?? [],
				details: args.properties ?? null,
			},
		});
		args.pendingPermissions.delete(permissionId);
		return;
	}

	const summary = describeOpenCodePermissionEvent(args.type, args.properties);
	const decisionOptions = extractOpenCodePermissionOptions(args.properties);
	args.pendingPermissions.set(permissionId, {
		sessionId: args.sessionId,
		summary,
		decisionOptions,
		kind: extractOpenCodePermissionKind(args.properties),
		status: extractOpenCodePermissionStatus(args.properties),
		lastEventType: args.type,
		details: args.properties
			? {
					eventType: args.type,
					status: extractOpenCodePermissionStatus(args.properties),
					kind: extractOpenCodePermissionKind(args.properties),
					...args.properties,
				}
			: undefined,
	});
	args.observability.writeActivity({
		type: 'approval_request',
		content: summary,
		sessionId: args.sessionId,
		meta: {
			permissionId,
			decisionOptions,
			kind: extractOpenCodePermissionKind(args.properties),
			status: extractOpenCodePermissionStatus(args.properties),
			properties: args.properties ?? null,
		},
	});
}

export function buildOpenCodePermissionResponse(
	request: CoworkerApprovalRequest,
	pending: Pick<OpenCodePendingPermission, 'decisionOptions'> | undefined,
): {
	body: { response: string; remember: boolean };
	resolvedDecision: string;
} {
	const resolvedDecision = normalizeOpenCodePermissionDecision(
		request.decision,
		pending?.decisionOptions ?? [],
	);
	return {
		body: {
			response: resolvedDecision,
			remember: request.remember ?? false,
		},
		resolvedDecision,
	};
}

export function extractOpenCodePermissionId(
	properties: Record<string, unknown> | undefined,
): string | null {
	return (
		(typeof properties?.permissionID === 'string' &&
			properties.permissionID) ||
		(typeof properties?.permissionId === 'string' &&
			properties.permissionId) ||
		(typeof properties?.id === 'string' && properties.id) ||
		null
	);
}

export function extractOpenCodePermissionStatus(
	properties: Record<string, unknown> | undefined,
): string | null {
	return (
		(typeof properties?.status === 'string' && properties.status) ||
		(typeof properties?.state === 'string' && properties.state) ||
		(typeof properties?.decision === 'string' && properties.decision) ||
		null
	);
}

export function extractOpenCodePermissionKind(
	properties: Record<string, unknown> | undefined,
): string | null {
	return (
		(typeof properties?.kind === 'string' && properties.kind) ||
		(typeof properties?.permissionKind === 'string' &&
			properties.permissionKind) ||
		(typeof properties?.action === 'string' && properties.action) ||
		null
	);
}

export function describeOpenCodePermissionEvent(
	type: string,
	properties: Record<string, unknown> | undefined,
): string {
	const message =
		(typeof properties?.message === 'string' && properties.message) ||
		(typeof properties?.title === 'string' && properties.title) ||
		null;
	const status = extractOpenCodePermissionStatus(properties);
	if (message && status && !message.includes(status)) {
		return `${message} · ${status}`;
	}
	return message ?? status ?? type;
}

export function isOpenCodePermissionResolutionEvent(
	type: string,
	properties: Record<string, unknown> | undefined,
): boolean {
	if (
		/(approved|denied|rejected|resolved|completed|cancelled|canceled|aborted)/i.test(
			type,
		)
	) {
		return true;
	}
	const status = extractOpenCodePermissionStatus(properties);
	return Boolean(
		status &&
		/(approved|denied|rejected|resolved|completed|cancelled|canceled|aborted)/i.test(
			status,
		),
	);
}

export function normalizeOpenCodePermissionDecision(
	decision: string,
	decisionOptions: string[],
): string {
	const raw = decision.trim();
	const lower = raw.toLowerCase();
	const aliases: Record<string, string> = {
		accept: 'approve',
		approve: 'approve',
		allow: 'approve',
		yes: 'approve',
		y: 'approve',
		reject: 'deny',
		deny: 'deny',
		no: 'deny',
		n: 'deny',
		cancel: 'abort',
		abort: 'abort',
	};
	const canonical = aliases[lower] ?? raw;

	if (decisionOptions.length === 0) {
		return canonical;
	}

	const exact = decisionOptions.find((option) => option === raw);
	if (exact) {
		return exact;
	}
	const ci = decisionOptions.find(
		(option) => option.toLowerCase() === canonical.toLowerCase(),
	);
	if (ci) {
		return ci;
	}

	throw new Error(
		`OpenCode permission decision ${decision} is not allowed; expected one of ${decisionOptions.join(', ')}`,
	);
}

export function extractOpenCodePermissionOptions(
	properties: Record<string, unknown> | undefined,
): string[] {
	const candidates = [
		properties?.options,
		properties?.responses,
		properties?.choices,
		properties?.allowedResponses,
	];

	for (const candidate of candidates) {
		if (!Array.isArray(candidate)) {
			continue;
		}

		const options = candidate
			.map((entry) => {
				if (typeof entry === 'string') {
					return entry;
				}
				if (entry && typeof entry === 'object') {
					const label =
						(entry as Record<string, unknown>).label ??
						(entry as Record<string, unknown>).value ??
						(entry as Record<string, unknown>).id;
					return typeof label === 'string' ? label : null;
				}
				return null;
			})
			.filter((entry): entry is string => Boolean(entry));

		if (options.length > 0) {
			return options;
		}
	}

	return ['approve', 'deny'];
}
