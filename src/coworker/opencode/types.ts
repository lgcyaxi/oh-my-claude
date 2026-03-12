import type { CoworkerReviewRequest, CoworkerTaskRequest } from '../types';

export interface OpenCodeSessionResponse {
	id: string;
	title?: string;
}

export interface OpenCodeAgentEntry {
	name: string;
	mode?: string;
	native?: boolean;
}

export interface OpenCodeProviderEntry {
	id?: string;
	name?: string;
}

export interface OpenCodeProviderResponse {
	all?: OpenCodeProviderEntry[];
	connected?: string[];
}

export interface OpenCodeMessageInfo {
	id?: string;
	sessionID?: string;
	modelID?: string;
	providerID?: string;
	structured_output?: unknown;
}

export interface OpenCodeMessagePart {
	type?: string;
	text?: string;
	content?: string;
	reason?: string;
	command?: string;
	snapshot?: string;
	cost?: number;
	tokens?: Record<string, number>;
	metadata?: Record<string, unknown>;
}

export interface OpenCodeMessageResponse {
	info?: OpenCodeMessageInfo;
	parts?: OpenCodeMessagePart[];
}

export interface OpenCodeSessionDiffEntry {
	path?: string;
	diff?: string;
}

export function formatTaskMessage(request: CoworkerTaskRequest): string {
	if (!request.context) {
		return request.message;
	}
	return `${request.context}\n\n${request.message}`;
}

export function extractMessageText(result: OpenCodeMessageResponse): string {
	const parts = result.parts ?? [];
	const text = parts
		.map((part) => {
			if (typeof part.text === 'string' && part.text.trim().length > 0) {
				return part.text;
			}
			if (
				typeof part.content === 'string' &&
				part.content.trim().length > 0
			) {
				return part.content;
			}
			return '';
		})
		.filter(Boolean)
		.join('\n')
		.trim();

	return text || '(no response)';
}

export function isAbortLikeError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}
	return (
		error.name === 'AbortError' ||
		error.name === 'TimeoutError' ||
		/aborted|timed out|timeout/i.test(error.message)
	);
}

export function buildOpenCodeReviewPrompt(
	target: NonNullable<CoworkerReviewRequest['target']>,
	message?: string,
	paths?: string[],
): string {
	const targetText = (() => {
		switch (target.type) {
			case 'uncommittedChanges':
				return 'Review the uncommitted changes in the current workspace.';
			case 'baseBranch':
				return `Review changes relative to the base branch ${target.branch}.`;
			case 'commit':
				return `Review commit ${target.sha}.${target.title ? ` ${target.title}` : ''}`.trim();
			case 'custom':
				return target.instructions;
		}
	})();

	const scopeText =
		paths && paths.length > 0
			? `Restrict the review to these paths: ${paths.join(', ')}.`
			: null;

	return [targetText, scopeText, message].filter(Boolean).join('\n\n');
}
