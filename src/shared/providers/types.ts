/**
 * Provider types for oh-my-claude
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: string | null;
}

export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: ChatCompletionUsage;
}

export interface ProviderClient {
  /** Provider name */
  name: string;

  /** Create a chat completion */
  createChatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse>;

  /** Check if provider is configured (has API key) */
  isConfigured(): boolean;
}

export interface ProviderClientOptions {
  /** Base URL for the API */
  baseUrl: string;
  /** API key */
  apiKey: string;
  /** Default model */
  defaultModel?: string;
  /** Request timeout in ms */
  timeout?: number;
  /** Async token resolver for OAuth providers (called before each request) */
  tokenResolver?: () => Promise<string>;
}
