/**
 * DeepSeek V4 provider sanitizer (Anthropic format)
 *
 * V4 consolidates the old `deepseek-chat` / `deepseek-reasoner` split into
 * a single unified thinking model (`deepseek-v4-pro`) plus a lite variant
 * (`deepseek-v4-flash`) that maps to the Claude "haiku" tier. Legacy names
 * are sunset on 2026-07-24 — we never forward them upstream.
 *
 * Docs:
 *   - Thinking mode: https://api-docs.deepseek.com/zh-cn/guides/thinking_mode
 *   - Coding agents: https://api-docs.deepseek.com/zh-cn/guides/coding_agents
 *
 * Anthropic-format controls used here:
 *   - `{"thinking": {"type": "enabled"}}`               — thinking switch (Claude-compatible)
 *   - `{"output_config": {"effort": "high" | "max"}}`   — thinking effort (DeepSeek-specific)
 *
 * Two paths, chosen by `opts.effort` and the target model:
 *   A. Thinking path (opus/sonnet tier, model=deepseek-v4-pro):
 *      1. Force `thinking.type = "enabled"`.
 *      2. Inject `output_config.effort = opts.effort` (defaults to "max").
 *      3. Replace Claude's signed thinking blocks with empty placeholders.
 *      4. Strip unsupported content types, keep thinking blocks.
 *   B. Fast path (haiku tier, model=deepseek-v4-flash, no effort in opts):
 *      1. Drop top-level `thinking` so the upstream treats it as a chat call.
 *      2. Strip all thinking / redacted_thinking content blocks.
 *      3. Strip unsupported content types entirely.
 */

import {
	THINKING_CONTENT_TYPES,
	stripThinkingBlocks,
	stripTopLevelKeys,
	stripUnsupportedContentTypes,
} from './types';

export interface DeepSeekSanitizeOpts {
	/**
	 * Thinking effort to inject as `output_config.effort`.
	 * Omit to take the fast (no-thinking) path for Flash requests.
	 */
	effort?: 'low' | 'medium' | 'high' | 'max';
}

/** Sanitize a DeepSeek V4 request body in-place. */
export function sanitizeDeepSeekV4(
	body: Record<string, unknown>,
	opts: DeepSeekSanitizeOpts = {},
): void {
	const model = typeof body.model === 'string' ? body.model : '';
	const thinkingDisabled = isThinkingExplicitlyDisabled(body);
	const thinkingRequested = isThinkingExplicitlyEnabled(body);

	// MED-10: honour an explicit `thinking: { type: 'disabled' }` from the
	// client even when opts.effort is set or the model is pro. Previously
	// the thinking path still injected `output_config.effort`, which forced
	// the upstream into thinking mode in direct contradiction to the user's
	// request. Fall through to the fast path so both the `thinking` field
	// and any residual `output_config.effort` are stripped.
	if (thinkingDisabled) {
		applyFastPath(body);
		return;
	}

	const useThinkingPath = (() => {
		if (opts.effort) return true;
		if (model === 'deepseek-v4-pro') return true;
		if (thinkingRequested) return true;
		return false;
	})();

	if (useThinkingPath) {
		applyThinkingPath(body, opts.effort ?? 'max');
		return;
	}

	// Fast path — haiku tier (`deepseek-v4-flash`) or any other non-thinking call.
	applyFastPath(body);
}

function isThinkingExplicitlyDisabled(body: Record<string, unknown>): boolean {
	const t = body.thinking;
	if (!t || typeof t !== 'object') return false;
	return (t as Record<string, unknown>).type === 'disabled';
}

// ── Thinking path ──────────────────────────────────────────────────────────

function applyThinkingPath(
	body: Record<string, unknown>,
	effort: NonNullable<DeepSeekSanitizeOpts['effort']>,
): void {
	ensureThinkingEnabled(body);
	ensureEffort(body, effort);

	const replaced = replaceThinkingBlocksForV4(body);
	if (replaced > 0) {
		console.error(
			`[sanitize:deepseek-v4] thinking path: replaced ${replaced} thinking blocks, effort=${effort}`,
		);
	}

	// Keep thinking blocks, drop unsupported content types only.
	stripUnsupportedContentTypes(body, true);
}

/** Ensure `thinking.type === "enabled"` on the top-level body. */
function ensureThinkingEnabled(body: Record<string, unknown>): void {
	const existing = body.thinking;
	if (existing && typeof existing === 'object') {
		const t = existing as Record<string, unknown>;
		if (t.type === 'disabled') return; // respect explicit opt-out
		t.type = 'enabled';
		return;
	}
	body.thinking = { type: 'enabled' };
}

/** Inject `output_config.effort` without clobbering other keys. */
function ensureEffort(
	body: Record<string, unknown>,
	effort: NonNullable<DeepSeekSanitizeOpts['effort']>,
): void {
	const current = body.output_config;
	if (current && typeof current === 'object') {
		(current as Record<string, unknown>).effort = effort;
		return;
	}
	body.output_config = { effort };
}

function isThinkingExplicitlyEnabled(body: Record<string, unknown>): boolean {
	const t = body.thinking;
	if (!t || typeof t !== 'object') return false;
	return (t as Record<string, unknown>).type === 'enabled';
}

/**
 * Replace Claude's thinking blocks with empty DeepSeek-compatible placeholders.
 *
 * DeepSeek V4 (in thinking mode) requires every assistant message in the
 * history to contain a thinking block. Claude Code emits signed thinking
 * blocks that DeepSeek cannot verify, so we substitute empty ones.
 */
function replaceThinkingBlocksForV4(body: Record<string, unknown>): number {
	const messages = body.messages;
	if (!Array.isArray(messages)) return 0;

	let count = 0;

	for (const message of messages) {
		if (!message || typeof message !== 'object') continue;
		const msg = message as Record<string, unknown>;
		if (msg.role !== 'assistant') continue;

		const content = msg.content;
		if (typeof content === 'string') {
			msg.content = [
				{ type: 'thinking', thinking: '' },
				{ type: 'text', text: content },
			];
			count++;
			continue;
		}

		if (!Array.isArray(content)) continue;

		let hasThinking = false;
		const filtered: unknown[] = [];

		for (const block of content) {
			if (!block || typeof block !== 'object') {
				filtered.push(block);
				continue;
			}

			const blockType = (block as Record<string, unknown>).type as
				| string
				| undefined;
			if (blockType && THINKING_CONTENT_TYPES.has(blockType)) {
				if (!hasThinking) {
					filtered.push({ type: 'thinking', thinking: '' });
					hasThinking = true;
				}
				count++;
			} else {
				filtered.push(block);
			}
		}

		if (!hasThinking) {
			filtered.unshift({ type: 'thinking', thinking: '' });
			count++;
		}

		msg.content = filtered;
	}

	return count;
}

// ── Fast path ──────────────────────────────────────────────────────────────

function applyFastPath(body: Record<string, unknown>): void {
	// Drop top-level `thinking` + clear any existing `output_config.effort`.
	const topLevelStripped = stripTopLevelKeys(body);
	if (body.output_config && typeof body.output_config === 'object') {
		const oc = body.output_config as Record<string, unknown>;
		delete oc.effort;
		if (Object.keys(oc).length === 0) delete body.output_config;
	}

	const blocksStripped = stripThinkingBlocks(body);
	stripUnsupportedContentTypes(body, false);

	if (topLevelStripped + blocksStripped > 0) {
		console.error(
			`[sanitize:deepseek-v4] fast path: stripped ${topLevelStripped} top-level keys, ${blocksStripped} thinking blocks`,
		);
	}
}
