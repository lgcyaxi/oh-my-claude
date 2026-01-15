/**
 * MiniMax API client (Anthropic-compatible)
 *
 * Models:
 * - MiniMax-M2.1: Latest model for writing and documentation
 * - MiniMax-M2: Previous generation model
 *
 * Endpoint: https://api.minimaxi.com/anthropic (China)
 *           https://api.minimax.io/anthropic (International)
 * Docs: https://platform.minimax.io/docs/api-reference/text-anthropic-api
 *
 * Note: MiniMax recommends the Anthropic-compatible interface for full
 * support of advanced features like interleaved thinking.
 */

import { AnthropicCompatibleClient, createAnthropicClientFromEnv } from "./anthropic-client";

// Use China endpoint by default, can be configured
const MINIMAX_BASE_URL = "https://api.minimaxi.com/anthropic";
const MINIMAX_API_KEY_ENV = "MINIMAX_API_KEY";

export function createMiniMaxClient(): AnthropicCompatibleClient {
  return createAnthropicClientFromEnv(
    "MiniMax",
    MINIMAX_BASE_URL,
    MINIMAX_API_KEY_ENV,
    "MiniMax-M2.1"
  );
}

export const minimaxClient = createMiniMaxClient();
