/**
 * MiniMax API client (Anthropic-compatible) — CN endpoint
 *
 * Models:
 * - MiniMax-M2.7: Latest flagship model for coding & agent tasks
 * - MiniMax-M2.1: Previous generation model
 *
 * CN Endpoint: https://api.minimaxi.com/anthropic (MINIMAX_CN_API_KEY)
 * Global Endpoint: https://api.minimax.io/anthropic (MINIMAX_API_KEY) — via minimax provider
 * Docs: https://platform.minimax.io/docs/api-reference/text-anthropic-api
 *
 * Note: MiniMax recommends the Anthropic-compatible interface for full
 * support of advanced features like interleaved thinking.
 */

import { AnthropicCompatibleClient, createAnthropicClientFromEnv } from "./anthropic-client";

// CN endpoint — global endpoint is configured via the "minimax" provider in schema.ts
const MINIMAX_BASE_URL = "https://api.minimaxi.com/anthropic";
const MINIMAX_API_KEY_ENV = "MINIMAX_CN_API_KEY";

export function createMiniMaxClient(): AnthropicCompatibleClient {
  return createAnthropicClientFromEnv(
    "MiniMax",
    MINIMAX_BASE_URL,
    MINIMAX_API_KEY_ENV,
    "MiniMax-M2.7"
  );
}