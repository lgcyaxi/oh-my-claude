/**
 * DeepSeek API client (Anthropic-compatible)
 *
 * Models:
 * - deepseek-v4-pro: Unified V4 model (thinking mode toggleable per request).
 *   Thinking mode is enabled by default; this client injects
 *   `output_config.effort = "max"` via the sanitizer for Claude Code workloads.
 *
 * Endpoint: https://api.deepseek.com/anthropic
 * Docs: https://api-docs.deepseek.com/guides/anthropic_api
 *       https://api-docs.deepseek.com/zh-cn/guides/thinking_mode
 */

import { AnthropicCompatibleClient, createAnthropicClientFromEnv } from "./anthropic-client";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/anthropic";
const DEEPSEEK_API_KEY_ENV = "DEEPSEEK_API_KEY";

export function createDeepSeekClient(): AnthropicCompatibleClient {
  return createAnthropicClientFromEnv(
    "DeepSeek",
    DEEPSEEK_BASE_URL,
    DEEPSEEK_API_KEY_ENV,
    "deepseek-v4-pro"
  );
}