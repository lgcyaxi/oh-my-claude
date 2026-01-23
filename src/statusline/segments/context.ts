/**
 * Context segment - shows token usage and context window
 * Data source: Claude Code transcript JSONL parsing
 * Graceful degradation: Shows "?" if data unavailable
 */

import { existsSync, readFileSync } from "node:fs";
import type { Segment, SegmentData, SegmentContext, SegmentConfig, StyleConfig } from "./types";
import { wrapBrackets, applyColor } from "./index";

// Approximate context window sizes for different models (in tokens)
const CONTEXT_WINDOWS: Record<string, number> = {
  "claude-opus-4-5-20251101": 200000,
  "claude-sonnet-4-5-20251101": 200000,
  "claude-haiku-4-5-20251101": 200000,
  default: 200000,
};

interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface TranscriptEntry {
  type?: string;
  usage?: TokenUsage;
  model?: string;
}

/**
 * Parse transcript JSONL to get latest token usage
 */
function parseTranscriptForUsage(transcriptPath: string): TokenUsage | null {
  try {
    if (!existsSync(transcriptPath)) {
      return null;
    }

    const content = readFileSync(transcriptPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    // Read from end to find latest assistant message with usage
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i] ?? "{}") as TranscriptEntry;
        if (entry.usage) {
          return entry.usage;
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
async function collectContextData(context: SegmentContext): Promise<SegmentData | null> {
  const { claudeCodeInput } = context;

  // Try to get usage from transcript
  let usage: TokenUsage | null = null;
  if (claudeCodeInput?.transcript_path) {
    usage = parseTranscriptForUsage(claudeCodeInput.transcript_path);
  }

  // Graceful degradation - no data available
  if (!usage) {
    return {
      primary: "?",
      metadata: {},
      color: "neutral",
    };
  }

  // Calculate total input tokens (including cached)
  const inputTokens =
    (usage.input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0) +
    (usage.cache_read_input_tokens || 0);
  const outputTokens = usage.output_tokens || 0;
  const totalTokens = inputTokens + outputTokens;

  // Get context window size
  const modelId = claudeCodeInput?.model?.id || "default";
  const contextWindow = CONTEXT_WINDOWS[modelId] ?? CONTEXT_WINDOWS.default ?? 200000;

  // Calculate usage percentage
  const percentage = Math.round((totalTokens / contextWindow) * 100);

  // Determine color based on usage
  let color: SegmentData["color"] = "good";
  if (percentage > 50) color = "warning";
  if (percentage > 80) color = "critical";

  // Format display: "45% [90k/200k]" or just "45%"
  const primary = `${percentage}%`;
  const secondary = `${formatTokens(totalTokens)}/${formatTokens(contextWindow)}`;

  return {
    primary,
    secondary,
    metadata: {
      inputTokens: String(inputTokens),
      outputTokens: String(outputTokens),
      totalTokens: String(totalTokens),
      contextWindow: String(contextWindow),
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
  style: StyleConfig
): string {
  // Show percentage and optional detailed view
  let display = data.primary;
  if (data.secondary) {
    display = `${data.primary} ${data.secondary}`;
  }

  const colored = applyColor(display, data.color, style);
  return wrapBrackets(colored, style);
}

export const contextSegment: Segment = {
  id: "context",
  collect: collectContextData,
  format: formatContextSegment,
};
