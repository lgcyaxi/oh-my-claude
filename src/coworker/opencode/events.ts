import type { CoworkerTaskEvent } from '../types';
import {
	describeOpenCodePermissionEvent,
	extractOpenCodePermissionId,
	extractOpenCodePermissionKind,
	extractOpenCodePermissionOptions,
	extractOpenCodePermissionStatus,
	isOpenCodePermissionResolutionEvent,
} from './permissions';

export function mapOpenCodeGlobalEvent(
	type: string,
	properties: Record<string, unknown> | undefined,
): {
	type: CoworkerTaskEvent['type'];
	content: string;
	meta?: Record<string, unknown>;
} {
	if (/permission/i.test(type)) {
		const content = describeOpenCodePermissionEvent(type, properties);
		const permissionId = extractOpenCodePermissionId(properties);
		const decisionOptions = extractOpenCodePermissionOptions(properties);
		const kind = extractOpenCodePermissionKind(properties);
		const status = extractOpenCodePermissionStatus(properties);
		return {
			type: isOpenCodePermissionResolutionEvent(type, properties)
				? 'tool_activity'
				: 'approval_request',
			content,
			meta: {
				requestId: permissionId,
				permissionId,
				decisionOptions,
				kind,
				status,
				lastEventType: type,
				properties,
			},
		};
	}

	if (type === 'session.status') {
		const status =
			(typeof properties?.status === 'string' && properties.status) ||
			(typeof properties?.state === 'string' && properties.state) ||
			'updated';
		return {
			type: 'tool_activity',
			content: `session status · ${status}`,
			meta: properties,
		};
	}

	if (type === 'step-start' || type === 'step-finish') {
		return {
			type: 'tool_activity',
			content:
				(typeof properties?.title === 'string' && properties.title) ||
				(typeof properties?.message === 'string' &&
					properties.message) ||
				type,
			meta: properties,
		};
	}

	if (type === 'message.part.delta' || type === 'message.part.updated') {
		const text =
			(typeof properties?.text === 'string' && properties.text) ||
			(typeof properties?.content === 'string' && properties.content) ||
			(typeof properties?.delta === 'string' && properties.delta) ||
			type;
		return {
			type: 'text_delta',
			content: text,
			meta: properties,
		};
	}

	if (/review/i.test(type)) {
		const status = extractOpenCodePermissionStatus(properties);
		const content =
			(typeof properties?.message === 'string' && properties.message) ||
			(typeof properties?.title === 'string' && properties.title) ||
			type;
		if (
			/(complete|completed|done|finished|resolved)/i.test(type) ||
			Boolean(
				status &&
				/(complete|completed|done|finished|resolved)/i.test(status),
			)
		) {
			return {
				type: 'tool_activity',
				content: `review completed · ${content}`,
				meta: { ...properties, status },
			};
		}
		if (
			/(progress|update|updated|running|stream)/i.test(type) ||
			Boolean(
				status &&
				/(progress|update|updated|running|stream)/i.test(status),
			)
		) {
			return {
				type: 'plan_update',
				content: `review progress · ${content}`,
				meta: { ...properties, status },
			};
		}
		return {
			type: 'review_started',
			content,
			meta: { ...properties, status },
		};
	}

	if (/diff/i.test(type)) {
		return {
			type: 'diff_updated',
			content:
				(typeof properties?.diff === 'string' && properties.diff) ||
				(typeof properties?.message === 'string' &&
					properties.message) ||
				type,
			meta: properties,
		};
	}

	return {
		type: 'provider_event',
		content: type,
		meta: properties,
	};
}
