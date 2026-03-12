/**
 * System prompt identity rewriting for external providers
 *
 * Claude Code's system prompt contains identity markers that cause external
 * models to incorrectly claim they are Claude. This module rewrites those
 * markers so the external model sees its own identity.
 *
 * Separate from sanitize.ts — identity is a presentation concern, not a
 * compatibility/validation concern.
 */

/**
 * Rewrite Claude-specific identity lines in the system prompt when routing
 * to an external provider.
 *
 * Handles both string and content block array forms of body.system.
 * Only touches known identity patterns — everything else passes through.
 *
 * @param body - Parsed request body (mutated in-place)
 * @param model - Target model name (e.g., "deepseek-chat")
 */
export function rewriteSystemIdentity(
	body: Record<string, unknown>,
	model: string,
): void {
	const system = body.system;
	if (!system) return;

	if (typeof system === 'string') {
		body.system = rewriteIdentityText(system, model);
		return;
	}

	// Content block array form: [{type: "text", text: "..."}, ...]
	if (Array.isArray(system)) {
		for (const block of system) {
			if (
				block &&
				typeof block === 'object' &&
				(block as Record<string, unknown>).type === 'text'
			) {
				const b = block as Record<string, unknown>;
				if (typeof b.text === 'string') {
					b.text = rewriteIdentityText(b.text, model);
				}
			}
		}
	}
}

/**
 * Replace Claude identity patterns in a text string.
 *
 * NOTE: Patterns use [^\n]+ instead of [^.]+ because model names contain
 * dots (e.g., "Opus 4.6", "Claude 4.5/4.6"). We match to end-of-line or
 * a known sentence terminator instead.
 *
 * Patterns rewritten:
 * 1. CLI identity line
 * 2. Model name + model ID sentence pair
 * 3. Model family description block
 * 4. Fast mode info block (entire <fast_mode_info> tag)
 * 5. Knowledge cutoff line
 */
function rewriteIdentityText(text: string, model: string): string {
	const original = text;

	// Prepend explicit identity override — models that weakly follow inline
	// rewrites (MiniMax, Kimi) need a strong directive at the top
	const identityOverride =
		`[IMPORTANT: You are ${model}, routed via oh-my-claude proxy. ` +
		`When asked about your identity, respond as ${model}. ` +
		`Do NOT claim to be Claude or any Anthropic model.]\n\n`;

	// Pattern 1: CLI identity line
	// "You are Claude Code, Anthropic's official CLI for Claude."
	text = text.replace(
		/You are Claude Code, Anthropic's official CLI for Claude\./g,
		`You are Claude Code, currently routed to ${model} via oh-my-claude proxy.`,
	);

	// Pattern 2: model identity — match across the two sentences
	// "You are powered by the model named Opus 4.6. The exact model ID is claude-opus-4-6."
	// The model name can contain dots/numbers, so match everything up to ". The exact"
	text = text.replace(
		/You are powered by the model named .+?\. The exact model ID is [\w.-]+\./g,
		`You are powered by the model named ${model}. The exact model ID is ${model}.`,
	);

	// Pattern 3: Model family description — entire sentence pair
	// "The most recent Claude model family is Claude 4.5/4.6. Model IDs — Opus 4.6: ..."
	// Match from "The most recent" to end of line (contains dots in version numbers)
	text = text.replace(
		/The most recent Claude model family is .+$/gm,
		`You are currently running as ${model} via oh-my-claude proxy.`,
	);

	// Pattern 4: Fast mode info block — remove entire tag
	// "<fast_mode_info>...Fast mode for Claude Code uses the same Claude Opus 4.6 model...</fast_mode_info>"
	text = text.replace(/<fast_mode_info>[\s\S]*?<\/fast_mode_info>/g, '');

	// Pattern 5: Knowledge cutoff line
	// "Assistant knowledge cutoff is May 2025."
	text = text.replace(
		/Assistant knowledge cutoff is [A-Za-z]+ \d{4}\./g,
		`Assistant is currently running as ${model}.`,
	);

	// Only prepend identity override if we actually rewrote something
	if (text !== original) {
		text = identityOverride + text;
		console.error(`[identity] Rewrote system prompt identity for ${model}`);
	}

	return text;
}
