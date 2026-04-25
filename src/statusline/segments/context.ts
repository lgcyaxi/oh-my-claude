/**
 * Context segment - shows token usage and context window percentage
 *
 * Parses Claude Code's transcript JSONL to get token usage from the last
 * assistant message with usage data.
 *
 * Data source: Claude Code transcript file (path from stdin)
 */

import { existsSync, readFileSync } from 'node:fs';
import type {
	Segment,
	SegmentData,
	SegmentContext,
	SegmentConfig,
	StyleConfig,
} from './types';
import { wrapBrackets, applyColor } from './index';
import { readSwitchState } from '../../proxy/state/switch';
import type { ProxySwitchState } from '../../proxy/state/types';
import { DEFAULT_PROXY_CONFIG } from '../../proxy/state/types';

// Context window sizes for different models (in tokens).
// Matching is substring-based (modelId.toLowerCase().includes(pattern)),
// so more specific patterns must come before broader ones.
const CONTEXT_WINDOWS: Record<string, number> = {
	// Claude 4.7 — new default, Opus carries a 1M window at standard pricing
	// (https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-7).
	// Sonnet / Haiku 4.7 remain at 200K.
	'claude-opus-4-7': 1_000_000,
	'claude-sonnet-4-7': 200_000,
	'claude-haiku-4-7': 200_000,
	// Claude 4.6 — Opus 4.6 also ships with a 1M context window
	// (https://www.anthropic.com/news/claude-opus-4-6). Earlier entries were
	// wrong at 200K; fixed here.
	'claude-opus-4-6': 1_000_000,
	'claude-sonnet-4-6': 200_000,
	'claude-haiku-4-6': 200_000,
	// Claude 4.5 (Sonnet 4.5 can negotiate 1M via beta flag, but the
	// unflagged default is still 200K — keep conservative.)
	'claude-opus-4-5': 200_000,
	'claude-sonnet-4-5': 200_000,
	'claude-haiku-4-5': 200_000,
	// Claude 3.x
	'claude-3-opus': 200_000,
	'claude-3-sonnet': 200_000,
	'claude-3-haiku': 200_000,
	// DeepSeek V4 (上下文长度 1M per official pricing docs —
	// https://api-docs.deepseek.com/zh-cn/quick_start/pricing).
	// Legacy `deepseek-chat` / `deepseek-reasoner` names are hard-removed.
	'deepseek-v4-pro': 1_000_000,
	'deepseek-v4-flash': 1_000_000,
	deepseek: 1_000_000,
	// ZhiPu GLM — official numbers sourced per row, most-specific first so
	// substring matching picks the right window.
	// - GLM-5.1   : 200K (docs.bigmodel.cn/cn/guide/models/text/glm-5.1)
	// - GLM-5-Turbo: 128K (bigmodel 模型矩阵 / aipuzi 对比表)
	// - GLM-5     : 200K (glm-5.org overview)
	// - GLM-4.6   : 200K (docs.z.ai/guides/llm/glm-4.6)
	// - GLM-4.5 / 4.5-Air: 128K (docs.z.ai/guides/llm/glm-4.5)
	'glm-5.1': 200_000,
	'glm-5-turbo': 128_000,
	'glm-5': 200_000,
	'glm-4.6': 200_000,
	'glm-4.5-air': 128_000,
	'glm-4.5': 128_000,
	'glm-4': 128_000,
	// MiniMax
	minimax: 204_800,
	// Kimi (kimi-for-coding, kimi-k2.5)
	kimi: 256_000,
	// Qwen (specific before broad)
	'qwen3.6': 1_000_000,
	'qwen3.5': 1_000_000,
	'qwen3-coder': 128_000,
	'qwen3-max': 128_000,
	// OpenAI (specific before broad)
	'gpt-5.3-codex': 200_000,
	'gpt-5': 128_000,
	'o3-mini': 200_000,
	// Default fallback
	default: 200_000,
};

/**
 * Token usage from transcript (supports multiple provider formats)
 */
interface RawUsage {
	// Anthropic format
	input_tokens?: number;
	output_tokens?: number;
	cache_creation_input_tokens?: number;
	cache_read_input_tokens?: number;
	// OpenAI format
	prompt_tokens?: number;
	completion_tokens?: number;
	cached_tokens?: number;
	// Fallback
	total_tokens?: number;
}

interface TranscriptEntry {
	type?: string;
	message?: {
		usage?: RawUsage;
		model?: string;
	};
	uuid?: string;
	summary?: string;
}

/** Bundle of data pulled off the latest assistant entry in the transcript. */
interface TranscriptTail {
	usage: RawUsage;
	/**
	 * Upstream model string the provider echoed back (e.g. `qwen3.6-plus`,
	 * `glm-4.6`, `deepseek-v4-pro`, `claude-opus-4-7-20260416`). This is the
	 * most authoritative signal — it reflects what the response was actually
	 * billed against, regardless of what Claude Code sent in stdin.
	 */
	model?: string;
}

/**
 * Normalize token usage from different provider formats
 */
function normalizeUsage(raw: RawUsage): {
	input: number;
	output: number;
	cacheRead: number;
	cacheCreate: number;
	total: number;
} {
	// Anthropic format has priority
	const input = raw.input_tokens ?? raw.prompt_tokens ?? 0;
	const output = raw.output_tokens ?? raw.completion_tokens ?? 0;
	const cacheRead = raw.cache_read_input_tokens ?? raw.cached_tokens ?? 0;
	const cacheCreate = raw.cache_creation_input_tokens ?? 0;

	// Total context tokens = input + output + cache operations
	const total = input + output + cacheRead + cacheCreate;

	// Use raw total_tokens as fallback if our calculation is 0
	const finalTotal = total > 0 ? total : (raw.total_tokens ?? 0);

	return { input, output, cacheRead, cacheCreate, total: finalTotal };
}

/**
 * Parse the Claude Code transcript JSONL and return the latest assistant
 * message's `{ usage, model }` tuple.
 *
 * Claude Code records one line per event. The assistant entries mirror the
 * raw API response, so `message.model` holds the exact model string the
 * upstream provider billed the response against — e.g. `qwen3.6-plus` when
 * the oh-my-claude proxy has rewritten the request, or `claude-opus-4-7-…`
 * for native Claude. That makes it a strictly better signal than either
 * Claude Code's stdin `model.id` (the client-side view) or our proxy
 * switch-state file (requires an HTTP round-trip and can race first-turn).
 */
function parseTranscriptTail(transcriptPath: string): TranscriptTail | null {
	try {
		if (!existsSync(transcriptPath)) {
			return null;
		}

		const content = readFileSync(transcriptPath, 'utf-8');
		const lines = content.trim().split('\n').filter(Boolean);

		// Read from end to find latest assistant message with usage
		for (let i = lines.length - 1; i >= 0; i--) {
			try {
				const line = lines[i];
				if (!line) continue;

				const entry = JSON.parse(line) as TranscriptEntry;

				// Skip summary entries
				if (entry.summary !== undefined) {
					continue;
				}

				// Look for assistant messages with usage
				if (entry.type === 'assistant' && entry.message?.usage) {
					return {
						usage: entry.message.usage,
						model: entry.message.model,
					};
				}
			} catch {
				// Skip invalid JSON lines
			}
		}

		return null;
	} catch {
		return null;
	}
}

/**
 * Parse an explicit context-window suffix from the model ID
 * (e.g. `claude-opus-4-6[1m]`, `deepseek-v4-pro[1m]`, `glm-5.1[200k]`).
 *
 * Claude Code honours this suffix when set via `ANTHROPIC_MODEL=<model>[<size>]`.
 * oh-my-claude does not inject it — tier mapping runs proxy-side through
 * `claudeTierMap` in `models-registry.json`, so the effective model is
 * discovered via `resolveEffectiveModelId()` above. This parser is kept as a
 * passthrough for users who configure `ANTHROPIC_MODEL` manually.
 *
 * Returns the parsed size in tokens, or null if no suffix is present.
 */
function parseContextSuffix(modelId: string): number | null {
	const match = modelId.match(/\[(\d+(?:\.\d+)?)(k|m)\]/i);
	if (!match?.[1] || !match[2]) return null;
	const value = parseFloat(match[1]);
	const unit = match[2].toLowerCase();
	return unit === 'm' ? value * 1_000_000 : value * 1_000;
}

/**
 * Get context window limit for a model.
 * Priority: explicit suffix (e.g. [1m]) > pattern match > default.
 */
function getContextLimit(modelId: string): number {
	// 1. Check for explicit context suffix first (e.g. claude-opus-4-6[1m])
	const fromSuffix = parseContextSuffix(modelId);
	if (fromSuffix) return fromSuffix;

	// 2. Fall back to pattern-based lookup
	const lower = modelId.toLowerCase();
	for (const [pattern, limit] of Object.entries(CONTEXT_WINDOWS)) {
		if (pattern !== 'default' && lower.includes(pattern)) {
			return limit;
		}
	}

	return CONTEXT_WINDOWS.default ?? 200000;
}

/**
 * Format token count for display (e.g., 45000 -> "45k")
 */
function formatTokens(count: number): string {
	if (count >= 1000000) {
		return `${(count / 1000000).toFixed(1)}M`;
	}
	if (count >= 1000) {
		return `${Math.round(count / 1000)}k`;
	}
	return String(count);
}

// ── Proxy switch-state helpers ─────────────────────────────────────────────
// Mirrors the identical helpers in `./model.ts` and `./proxy.ts`. Kept
// inlined for tight focus; dedup opportunity is tracked separately.

/** Control port from env override or default. */
function getControlPort(): number {
	const envPort = process.env.OMC_PROXY_CONTROL_PORT;
	if (envPort) {
		const parsed = parseInt(envPort, 10);
		if (!isNaN(parsed)) return parsed;
	}
	return DEFAULT_PROXY_CONFIG.controlPort;
}

/** Extract session ID from ANTHROPIC_BASE_URL path `/s/{id}`. */
function extractSessionId(): string | undefined {
	const baseUrl = process.env.ANTHROPIC_BASE_URL;
	if (!baseUrl) return undefined;
	try {
		const url = new URL(baseUrl);
		const match = url.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)\/?$/);
		return match ? match[1] : undefined;
	} catch {
		return undefined;
	}
}

/** Query the proxy control API for session-scoped switch state. */
async function fetchStatusFromControlApi(
	sessionId: string,
): Promise<ProxySwitchState | null> {
	try {
		const controlPort = getControlPort();
		const url = `http://localhost:${controlPort}/status?session=${sessionId}`;
		const resp = await fetch(url, { signal: AbortSignal.timeout(500) });
		if (!resp.ok) return null;
		return (await resp.json()) as ProxySwitchState;
	} catch {
		return null;
	}
}

/**
 * Warm-start fallback: when the transcript is still empty (first turn) but a
 * proxy session is active, consult the control API / switch-state file for
 * the model the proxy has been told to route to.
 *
 * This is only used when the transcript can't answer yet — once the first
 * assistant response lands, `message.model` from the transcript takes over
 * and we stop round-tripping the proxy.
 */
async function resolveSwitchedModelId(): Promise<string | null> {
	try {
		const sessionId = extractSessionId();
		const hasProxySession = !!(
			sessionId || process.env.OMC_PROXY_CONTROL_PORT
		);
		let switchState: ProxySwitchState | null = null;
		if (sessionId) {
			switchState = await fetchStatusFromControlApi(sessionId);
		}
		if (!switchState && hasProxySession) {
			switchState = readSwitchState();
		}
		if (switchState?.switched && switchState.model) {
			return switchState.model;
		}
	} catch {
		// Proxy state unavailable — caller falls back to stdin.
	}
	return null;
}

/**
 * Collect context/token information
 */
async function collectContextData(
	context: SegmentContext,
): Promise<SegmentData | null> {
	const { claudeCodeInput } = context;

	// Need transcript path to parse usage
	if (!claudeCodeInput?.transcript_path) {
		return {
			primary: '?',
			metadata: {},
			color: 'neutral',
		};
	}

	// Pull latest { usage, model } off the transcript. The transcript is
	// the source of truth — Claude Code records the raw assistant response,
	// so `message.model` is exactly what the upstream provider billed.
	const tail = parseTranscriptTail(claudeCodeInput.transcript_path);

	if (!tail) {
		return {
			primary: '?',
			metadata: {},
			color: 'neutral',
		};
	}

	// Normalize usage from different provider formats
	const usage = normalizeUsage(tail.usage);

	if (usage.total === 0) {
		return {
			primary: '0',
			metadata: { total: '0' },
			color: 'good',
		};
	}

	// Resolve the effective model in order of authority:
	//   1. transcript `message.model` — exact upstream billing identity
	//   2. stdin `model.id`          — Claude Code's native view
	//   3. proxy switch-state        — warm start when transcript is empty
	//      (only reachable above when usage.total === 0)
	//   4. `default`                 — 200K safe fallback
	const claudeModelId = claudeCodeInput.model?.id;
	const transcriptModelId = tail.model;
	const switchedModelId = transcriptModelId
		? null
		: await resolveSwitchedModelId();
	const modelId =
		transcriptModelId ?? switchedModelId ?? claudeModelId ?? 'default';
	const modelSource: 'transcript' | 'switch-state' | 'stdin' | 'default' =
		transcriptModelId
			? 'transcript'
			: switchedModelId
				? 'switch-state'
				: claudeModelId
					? 'stdin'
					: 'default';
	const contextLimit = getContextLimit(modelId);

	// Calculate usage percentage
	const percentage = Math.round((usage.total / contextLimit) * 100);

	// Determine color based on usage
	let color: SegmentData['color'] = 'good';
	if (percentage > 50) color = 'warning';
	if (percentage > 80) color = 'critical';

	// Format display: "45% 90k/200k"
	const primary = `${percentage}%`;
	const secondary = `${formatTokens(usage.total)}/${formatTokens(contextLimit)}`;

	return {
		primary,
		secondary,
		metadata: {
			inputTokens: String(usage.input),
			outputTokens: String(usage.output),
			cacheReadTokens: String(usage.cacheRead),
			cacheCreateTokens: String(usage.cacheCreate),
			totalTokens: String(usage.total),
			contextLimit: String(contextLimit),
			percentage: String(percentage),
			modelId,
			modelSource,
			claudeModelId: claudeModelId ?? '',
		},
		color,
	};
}

/**
 * Format context segment for display
 */
function formatContextSegment(
	data: SegmentData,
	_config: SegmentConfig,
	style: StyleConfig,
): string {
	let display = data.primary;
	if (data.secondary) {
		display = `${data.primary} ${data.secondary}`;
	}
	const colored = applyColor(display, data.color, style);
	return wrapBrackets(colored, style);
}

export const contextSegment: Segment = {
	id: 'context',
	collect: collectContextData,
	format: formatContextSegment,
};
