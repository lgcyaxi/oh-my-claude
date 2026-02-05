/**
 * Provider router for oh-my-claude
 *
 * Routes requests to the correct provider based on agent/category configuration
 */

import type { ProviderClient, ChatCompletionRequest, ChatCompletionResponse } from "./types";
import { OpenAICompatibleClient } from "./base-client";
import { AnthropicCompatibleClient } from "./anthropic-client";
import { createDeepSeekClient } from "./deepseek";
import { createZhiPuClient } from "./zhipu";
import { createMiniMaxClient } from "./minimax";
import { createOpenRouterClient } from "./openrouter";
import {
  loadConfig,
  resolveProviderForAgent,
  resolveProviderForCategory,
  getProviderDetails,
  isProviderConfigured,
  type OhMyClaudeConfig,
} from "../config";

// Provider client cache
const clientCache = new Map<string, ProviderClient>();

/**
 * Get or create a provider client
 */
function getProviderClient(
  providerName: string,
  config: OhMyClaudeConfig
): ProviderClient {
  // Check cache first
  const cached = clientCache.get(providerName);
  if (cached) {
    return cached;
  }

  const details = getProviderDetails(config, providerName);
  if (!details) {
    throw new Error(`Unknown provider: ${providerName}`);
  }

  let client: ProviderClient;

  switch (details.type) {
    case "claude-subscription":
      // Claude subscription is handled by Claude Code's Task tool, not our MCP server
      throw new Error(
        `Provider "${providerName}" uses Claude subscription and cannot be used with MCP background tasks`
      );

    case "openrouter":
      client = createOpenRouterClient();
      break;

    case "anthropic-compatible": {
      // Create Anthropic-compatible client from config
      const apiKey = details.apiKeyEnv ? process.env[details.apiKeyEnv] ?? "" : "";
      client = new AnthropicCompatibleClient(providerName, {
        baseUrl: details.baseUrl ?? "",
        apiKey,
      });
      break;
    }

    case "openai-compatible":
    default: {
      // Create OpenAI-compatible client from config
      const apiKey = details.apiKeyEnv ? process.env[details.apiKeyEnv] ?? "" : "";
      client = new OpenAICompatibleClient(providerName, {
        baseUrl: details.baseUrl ?? "",
        apiKey,
      });
      break;
    }
  }

  // Cache the client
  clientCache.set(providerName, client);
  return client;
}

/**
 * Route a request to the appropriate provider based on agent name
 */
export async function routeByAgent(
  agentName: string,
  messages: ChatCompletionRequest["messages"],
  options?: {
    temperature?: number;
    maxTokens?: number;
  }
): Promise<ChatCompletionResponse> {
  const config = loadConfig();
  const agentConfig = resolveProviderForAgent(config, agentName);

  if (!agentConfig) {
    throw new Error(`No configuration found for agent: ${agentName}`);
  }

  // Check if this agent uses Claude subscription
  const providerDetails = getProviderDetails(config, agentConfig.provider);
  if (providerDetails?.type === "claude-subscription") {
    throw new Error(
      `Agent "${agentName}" uses Claude subscription. Use Claude Code's Task tool instead of MCP.`
    );
  }

  // Check if provider is configured
  if (!isProviderConfigured(config, agentConfig.provider)) {
    const envVar = providerDetails?.apiKeyEnv ?? `${agentConfig.provider.toUpperCase()}_API_KEY`;
    throw new Error(
      `Provider "${agentConfig.provider}" is not configured. Set ${envVar} environment variable.`
    );
  }

  const client = getProviderClient(agentConfig.provider, config);

  const request: ChatCompletionRequest = {
    model: agentConfig.model,
    messages,
    temperature: options?.temperature ?? agentConfig.temperature,
    max_tokens: options?.maxTokens,
  };

  return client.createChatCompletion(request);
}

/**
 * Route a request to the appropriate provider based on category
 */
export async function routeByCategory(
  categoryName: string,
  messages: ChatCompletionRequest["messages"],
  options?: {
    temperature?: number;
    maxTokens?: number;
  }
): Promise<ChatCompletionResponse> {
  const config = loadConfig();
  const categoryConfig = resolveProviderForCategory(config, categoryName);

  if (!categoryConfig) {
    throw new Error(`No configuration found for category: ${categoryName}`);
  }

  // Check if this category uses Claude subscription
  const providerDetails = getProviderDetails(config, categoryConfig.provider);
  if (providerDetails?.type === "claude-subscription") {
    throw new Error(
      `Category "${categoryName}" uses Claude subscription. Use Claude Code's Task tool instead of MCP.`
    );
  }

  const client = getProviderClient(categoryConfig.provider, config);

  const request: ChatCompletionRequest = {
    model: categoryConfig.model,
    messages,
    temperature: options?.temperature ?? categoryConfig.temperature,
    max_tokens: options?.maxTokens,
  };

  return client.createChatCompletion(request);
}

/**
 * Route a request to an explicit provider and model (no agent/category lookup).
 * Used by execute_with_model MCP tool for direct provider access.
 */
export async function routeByModel(
  providerName: string,
  modelName: string,
  messages: ChatCompletionRequest["messages"],
  options?: {
    temperature?: number;
    maxTokens?: number;
  }
): Promise<ChatCompletionResponse> {
  const config = loadConfig();

  // Validate provider exists
  const providerDetails = getProviderDetails(config, providerName);
  if (!providerDetails) {
    throw new Error(`Unknown provider: "${providerName}"`);
  }

  // Block claude-subscription providers
  if (providerDetails.type === "claude-subscription") {
    throw new Error(
      `Provider "${providerName}" uses Claude subscription. Use Claude Code's Task tool instead.`
    );
  }

  // Check if provider is configured
  if (!isProviderConfigured(config, providerName)) {
    const envVar = providerDetails.apiKeyEnv ?? `${providerName.toUpperCase()}_API_KEY`;
    throw new Error(
      `Provider "${providerName}" is not configured. Set ${envVar} environment variable.`
    );
  }

  const client = getProviderClient(providerName, config);

  const request: ChatCompletionRequest = {
    model: modelName,
    messages,
    temperature: options?.temperature,
    max_tokens: options?.maxTokens,
  };

  return client.createChatCompletion(request);
}

/**
 * Get configured providers status
 */
export function getProvidersStatus(): Record<
  string,
  { configured: boolean; type: string }
> {
  const config = loadConfig();
  const status: Record<string, { configured: boolean; type: string }> = {};

  for (const [name, providerConfig] of Object.entries(config.providers)) {
    let configured = false;

    if (providerConfig.type === "claude-subscription") {
      // Claude subscription is always "configured" (handled by Claude Code)
      configured = true;
    } else if (providerConfig.api_key_env) {
      // Check if API key is set
      const apiKey = process.env[providerConfig.api_key_env];
      configured = !!apiKey && apiKey.length > 0;
    }

    status[name] = {
      configured,
      type: providerConfig.type,
    };
  }

  return status;
}

/**
 * Clear the client cache (useful for testing or config reload)
 */
export function clearClientCache(): void {
  clientCache.clear();
}
