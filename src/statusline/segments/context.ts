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

// Context window sizes for different models (in tokens).
// Matching is substring-based (modelId.toLowerCase().includes(pattern)),
// so more specific patterns must come before broader ones.
const CONTEXT_WINDOWS: Record<string, number> = {
	// Claude 4.6
	'claude-opus-4-6': 200_000,
	'claude-sonnet-4-6': 200_000,
	// Claude 4.5
	'claude-opus-4-5': 200_000,
	'claude-sonnet-4-5': 200_000,
	'claude-haiku-4-5': 200_000,
	// Claude 3.x
	'claude-3-opus': 200_000,
	'claude-3-sonnet': 200_000,
	'claude-3-haiku': 200_000,
	// DeepSeek (deepseek-chat V3, deepseek-reasoner)
	deepseek: 128_000,
	// ZhiPu GLM (glm-5 before glm-4 — specificity)
	'glm-5': 200_000,
	'glm-4': 128_000,
	// MiniMax
	minimax: 204_800,
	// Kimi (kimi-for-coding, kimi-k2.5)
	kimi: 256_000,
	// Qwen (specific before broad)
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
	};
	uuid?: string;
	summary?: string;
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
 * Parse transcript JSONL to get latest token usage
 */
function parseTranscript(transcriptPath: string): RawUsage | null {
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
					return entry.message.usage;
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
 * Parse explicit context window suffix from model ID.
 * Claude Code appends [1m], [200k], etc. to signal the actual context window.
 * Returns the parsed size in tokens, or null if no suffix found.
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

	// Parse transcript for usage data
	const rawUsage = parseTranscript(claudeCodeInput.transcript_path);

	if (!rawUsage) {
		return {
			primary: '?',
			metadata: {},
			color: 'neutral',
		};
	}

	// Normalize usage from different provider formats
	const usage = normalizeUsage(rawUsage);

	if (usage.total === 0) {
		return {
			primary: '0',
			metadata: { total: '0' },
			color: 'good',
		};
	}

	// Get context window limit
	const modelId = claudeCodeInput.model?.id ?? 'default';
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
