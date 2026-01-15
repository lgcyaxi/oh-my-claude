/**
 * Base client for Anthropic-compatible APIs
 *
 * Used by providers that offer Anthropic-compatible endpoints:
 * - DeepSeek: https://api.deepseek.com/anthropic
 * - ZhiPu GLM: https://open.bigmodel.cn/api/anthropic
 * - MiniMax: https://api.minimaxi.com/anthropic
 */

import type {
  ProviderClient,
  ProviderClientOptions,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
} from "./types";

// Anthropic API types
interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  temperature?: number;
  system?: string;
  stream?: boolean;
}

interface AnthropicContentBlock {
  type: "text";
  text: string;
}

interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}

interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string | null;
  usage: AnthropicUsage;
}

export class AnthropicCompatibleClient implements ProviderClient {
  name: string;
  protected baseUrl: string;
  protected apiKey: string;
  protected defaultModel?: string;
  protected timeout: number;

  constructor(name: string, options: ProviderClientOptions) {
    this.name = name;
    this.baseUrl = options.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.apiKey = options.apiKey;
    this.defaultModel = options.defaultModel;
    this.timeout = options.timeout ?? 120000; // 2 minutes default
  }

  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  /**
   * Convert OpenAI-style messages to Anthropic format
   * Extracts system message and converts message roles
   */
  private convertMessages(messages: ChatMessage[]): {
    system?: string;
    messages: AnthropicMessage[];
  } {
    let system: string | undefined;
    const anthropicMessages: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        // Anthropic uses a separate system parameter
        system = msg.content;
      } else {
        anthropicMessages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        });
      }
    }

    return { system, messages: anthropicMessages };
  }

  /**
   * Convert Anthropic response to OpenAI-compatible format
   */
  private convertResponse(response: AnthropicResponse): ChatCompletionResponse {
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    return {
      id: response.id,
      object: "chat.completion",
      created: Date.now(),
      model: response.model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: text,
          },
          finish_reason: response.stop_reason ?? "stop",
        },
      ],
      usage: {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  async createChatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    if (!this.isConfigured()) {
      throw new Error(`${this.name} API key not configured`);
    }

    const url = `${this.baseUrl}/v1/messages`;

    const { system, messages } = this.convertMessages(request.messages);

    const body: AnthropicRequest = {
      model: request.model || this.defaultModel || "claude-3-sonnet-20240229",
      messages,
      max_tokens: request.max_tokens ?? 4096,
      temperature: request.temperature,
      stream: false,
    };

    if (system) {
      body.system = system;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
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

      const data = (await response.json()) as AnthropicResponse;
      return this.convertResponse(data);
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
 * Create an Anthropic-compatible provider client from environment variables
 */
export function createAnthropicClientFromEnv(
  name: string,
  baseUrl: string,
  apiKeyEnv: string,
  defaultModel?: string
): AnthropicCompatibleClient {
  const apiKey = process.env[apiKeyEnv] ?? "";
  return new AnthropicCompatibleClient(name, {
    baseUrl,
    apiKey,
    defaultModel,
  });
}
