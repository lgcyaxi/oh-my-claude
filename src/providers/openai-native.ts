/**
 * OpenAI/Codex provider client
 *
 * Supports dual auth:
 * - OAuth (Codex): ChatGPT Pro/Plus subscription models (gpt-5.2, gpt-5.3-codex)
 * - API key: Standard OpenAI API key (OPENAI_API_KEY env var)
 */

import { OpenAICompatibleClient } from "./base-client";
import type { ProviderClient } from "./types";
import { getAccessToken } from "../auth/token-manager";
import { hasCredential } from "../auth/store";

const CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
const API_BASE_URL = "https://api.openai.com/v1";

/**
 * Create an OpenAI provider client.
 * Prefers OAuth (Codex) if credentials exist, falls back to API key.
 */
export function createOpenAIClient(): ProviderClient {
  // Check if OAuth credentials are available
  if (hasCredential("openai")) {
    return new OpenAICompatibleClient("openai", {
      baseUrl: CODEX_BASE_URL,
      apiKey: "",
      tokenResolver: () => getAccessToken("openai"),
    });
  }

  // Fall back to API key
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  return new OpenAICompatibleClient("openai", {
    baseUrl: API_BASE_URL,
    apiKey,
  });
}
