/**
 * OpenRouter API client
 *
 * Provides access to multiple models:
 * - OpenAI GPT models
 * - Grok models
 * - Google Gemini models
 * - And many more
 */

import { OpenAICompatibleClient } from "./base-client";
import type { ProviderClientOptions, ChatCompletionRequest, ChatCompletionResponse } from "./types";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_API_KEY_ENV = "OPENROUTER_API_KEY";

export class OpenRouterClient extends OpenAICompatibleClient {
  private siteUrl?: string;
  private siteName?: string;

  constructor(options?: {
    siteUrl?: string;
    siteName?: string;
  }) {
    const apiKey = process.env[OPENROUTER_API_KEY_ENV] ?? "";
    super("OpenRouter", {
      baseUrl: OPENROUTER_BASE_URL,
      apiKey,
    });
    this.siteUrl = options?.siteUrl;
    this.siteName = options?.siteName ?? "oh-my-claude";
  }

  override async createChatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    if (!this.isConfigured()) {
      throw new Error(`${this.name} API key not configured`);
    }

    const url = `${this.baseUrl}/chat/completions`;

    const body = {
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      stream: false,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };

    // OpenRouter-specific headers
    if (this.siteUrl) {
      headers["HTTP-Referer"] = this.siteUrl;
    }
    if (this.siteName) {
      headers["X-Title"] = this.siteName;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `${this.name} API error (${response.status}): ${errorText}`
        );
      }

      const data = (await response.json()) as ChatCompletionResponse;
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`${this.name} API request timed out after ${this.timeout}ms`);
      }
      throw error;
    }
  }
}

export function createOpenRouterClient(options?: {
  siteUrl?: string;
  siteName?: string;
}): OpenRouterClient {
  return new OpenRouterClient(options);
}

export const openrouterClient = createOpenRouterClient();
