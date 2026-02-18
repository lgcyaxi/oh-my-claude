/**
 * Base client for OpenAI-compatible APIs
 */

import type {
  ProviderClient,
  ProviderClientOptions,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from "./types";

export class OpenAICompatibleClient implements ProviderClient {
  name: string;
  protected baseUrl: string;
  protected apiKey: string;
  protected defaultModel?: string;
  protected timeout: number;
  protected tokenResolver?: () => Promise<string>;

  constructor(name: string, options: ProviderClientOptions) {
    this.name = name;
    this.baseUrl = options.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.apiKey = options.apiKey;
    this.defaultModel = options.defaultModel;
    this.timeout = options.timeout ?? 120000; // 2 minutes default
    this.tokenResolver = options.tokenResolver;
  }

  isConfigured(): boolean {
    // OAuth providers are configured if they have a tokenResolver
    if (this.tokenResolver) return true;
    return !!this.apiKey && this.apiKey.length > 0;
  }

  async createChatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    // Resolve API key: use tokenResolver for OAuth, or static apiKey
    const apiKey = this.tokenResolver ? await this.tokenResolver() : this.apiKey;
    if (!apiKey) {
      throw new Error(`${this.name} API key not configured`);
    }

    const url = `${this.baseUrl}/chat/completions`;

    const body = {
      model: request.model || this.defaultModel,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      stream: false, // We don't support streaming in background tasks
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
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

/**
 * Create a provider client from environment variables
 */
export function createClientFromEnv(
  name: string,
  baseUrl: string,
  apiKeyEnv: string,
  defaultModel?: string
): OpenAICompatibleClient {
  const apiKey = process.env[apiKeyEnv] ?? "";
  return new OpenAICompatibleClient(name, {
    baseUrl,
    apiKey,
    defaultModel,
  });
}
