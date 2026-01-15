/**
 * DeepSeek API client (Anthropic-compatible)
 *
 * Models:
 * - deepseek-chat: Fast general-purpose model (DeepSeek V3.1)
 * - deepseek-reasoner: High-IQ reasoning model with thinking traces
 *
 * Endpoint: https://api.deepseek.com/anthropic
 * Docs: https://api-docs.deepseek.com/guides/anthropic_api
 */

import { AnthropicCompatibleClient, createAnthropicClientFromEnv } from "./anthropic-client";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/anthropic";
const DEEPSEEK_API_KEY_ENV = "DEEPSEEK_API_KEY";

export function createDeepSeekClient(): AnthropicCompatibleClient {
  return createAnthropicClientFromEnv(
    "DeepSeek",
    DEEPSEEK_BASE_URL,
    DEEPSEEK_API_KEY_ENV,
    "deepseek-chat"
  );
}

export const deepseekClient = createDeepSeekClient();
