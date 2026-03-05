import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { OhMyClaudeConfigSchema, type OhMyClaudeConfig, DEFAULT_CONFIG } from "./schema";
import { DEFAULT_BRIDGE_CONFIG, MultiBridgeConfigSchema, type MultiBridgeConfig } from "./bridge";
import { isOAuthProvider } from "../auth/types";
import modelsRegistry from "./models-registry.json";

const CONFIG_FILENAME = "oh-my-claude.json";

/**
 * Get all possible config file paths in priority order
 */
export function getConfigPaths(): string[] {
  const home = homedir();
  return [
    // Project-level config (highest priority)
    join(process.cwd(), ".claude", CONFIG_FILENAME),
    // User-level config
    join(home, ".claude", CONFIG_FILENAME),
    // Alternative user config location
    join(home, ".config", "oh-my-claude", CONFIG_FILENAME),
  ];
}

/**
 * Load configuration from file
 */
export function loadConfig(): OhMyClaudeConfig {
  const configPaths = getConfigPaths();

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(content);
        return OhMyClaudeConfigSchema.parse(parsed);
      } catch (error) {
        console.warn(`Warning: Failed to parse config at ${configPath}:`, error);
      }
    }
  }

  // Return default config if no file found
  return DEFAULT_CONFIG;
}

/**
 * Get the path where config should be written
 */
export function getDefaultConfigPath(): string {
  const home = homedir();
  return join(home, ".claude", CONFIG_FILENAME);
}

/**
 * Resolve provider config for an agent or category
 */
export function resolveProviderForAgent(
  config: OhMyClaudeConfig,
  agentName: string
): { provider: string; model: string; temperature?: number } | null {
  const agentConfig = config.agents[agentName];
  if (agentConfig) {
    return {
      provider: agentConfig.provider,
      model: agentConfig.model,
      temperature: agentConfig.temperature,
    };
  }
  return null;
}

/**
 * Resolve provider config for a category (with cross-provider + universal fallback)
 */
export function resolveProviderForCategory(
  config: OhMyClaudeConfig,
  categoryName: string
): { provider: string; model: string; temperature?: number } | null {
  const categoryConfig = config.categories[categoryName];
  if (!categoryConfig) return null;

  // Try configured provider first
  if (isProviderConfigured(config, categoryConfig.provider)) {
    return {
      provider: categoryConfig.provider,
      model: categoryConfig.model,
      temperature: categoryConfig.temperature,
    };
  }

  // Try cross-provider alias (same model via hub like Aliyun)
  const crossProvider = resolveViaCrossProvider(config, categoryConfig.model);
  if (crossProvider) {
    return {
      ...crossProvider,
      temperature: categoryConfig.temperature,
    };
  }

  // Try universal fallback (skip Claude subscription categories — they can't use MCP)
  const providerDetails = getProviderDetails(config, categoryConfig.provider);
  if (providerDetails?.type !== "claude-subscription") {
    for (const fb of UNIVERSAL_FALLBACK_CHAIN) {
      if (fb.provider === categoryConfig.provider) continue;
      if (isProviderConfigured(config, fb.provider)) {
        return {
          provider: fb.provider,
          model: fb.model,
          temperature: categoryConfig.temperature,
        };
      }
    }
  }

  // Return original (Claude subscription categories or no fallback available)
  return {
    provider: categoryConfig.provider,
    model: categoryConfig.model,
    temperature: categoryConfig.temperature,
  };
}

/**
 * Get provider base URL and API key env var
 */
export function getProviderDetails(
  config: OhMyClaudeConfig,
  providerName: string
): { baseUrl?: string; apiKeyEnv?: string; type: string } | null {
  const providerConfig = config.providers[providerName];
  if (providerConfig) {
    return {
      baseUrl: providerConfig.base_url,
      apiKeyEnv: providerConfig.api_key_env,
      type: providerConfig.type,
    };
  }
  return null;
}

/**
 * Check if a provider is configured (has API key or OAuth credentials)
 */
export function isProviderConfigured(
  config: OhMyClaudeConfig,
  providerName: string
): boolean {
  const providerConfig = config.providers[providerName];
  if (!providerConfig) {
    return false;
  }

  // Claude subscription is always "configured"
  if (providerConfig.type === "claude-subscription") {
    return true;
  }

  // OAuth providers: check auth.json for stored credentials
  if (isOAuthProvider(providerConfig.type)) {
    try {
      // Lazy import to avoid circular deps and keep this function sync-compatible
      const { hasCredential } = require("../auth/store");
      return hasCredential(providerName);
    } catch {
      return false;
    }
  }

  // Check if API key environment variable is set
  if (providerConfig.api_key_env) {
    const apiKey = process.env[providerConfig.api_key_env];
    if (apiKey && apiKey.length > 0) return true;

    // Ollama-style providers: API key is optional (local/remote inference)
    // Consider configured if base_url (or OLLAMA_HOST override) is set
    if (providerName === "ollama") {
      const effectiveUrl = process.env.OLLAMA_HOST || process.env.OLLAMA_API_BASE || providerConfig.base_url;
      if (effectiveUrl) {
        try {
          const url = new URL(effectiveUrl);
          if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || process.env.OLLAMA_HOST || process.env.OLLAMA_API_BASE) {
            return true;
          }
        } catch {
          // Invalid URL — not configured
        }
      }
    }

    return false;
  }

  return false;
}

/**
 * Universal fallback order: try any configured API-key provider.
 * Used when primary + explicit fallback both fail.
 */
const UNIVERSAL_FALLBACK_CHAIN: { provider: string; model: string }[] = [
  { provider: "deepseek", model: "deepseek-chat" },
  { provider: "aliyun", model: "qwen3.5-plus" },
  { provider: "zhipu", model: "glm-5" },
  { provider: "zhipu-global", model: "glm-5" },
  { provider: "minimax-cn", model: "MiniMax-M2.5" },
  { provider: "minimax", model: "MiniMax-M2.5" },
  { provider: "kimi", model: "kimi-for-coding" },
];

/**
 * Cross-provider model resolution.
 *
 * Hub providers like Aliyun Coding Plan serve models from other providers
 * (GLM-5, MiniMax-M2.5, K2.5). When the primary provider isn't configured,
 * this checks if a hub can serve the *same* model — preserving quality by
 * using the exact model the agent was designed for, just via a different route.
 *
 * Example: librarian wants zhipu/GLM-5, zhipu key not set, but Aliyun has
 * GLM-5 → route to aliyun/GLM-5 (same model, different API endpoint).
 */
function resolveViaCrossProvider(
  config: OhMyClaudeConfig,
  modelId: string,
): { provider: string; model: string } | null {
  const aliases = (modelsRegistry as any).crossProviderAliases;
  if (!aliases) return null;

  const alternatives = aliases[modelId] as Array<{ provider: string; model: string }> | undefined;
  if (!alternatives) return null;

  for (const alt of alternatives) {
    if (isProviderConfigured(config, alt.provider)) {
      return { provider: alt.provider, model: alt.model };
    }
  }

  return null;
}

/**
 * Resolve provider for agent with fallback support.
 *
 * Fallback chain:
 * 1. Primary provider (as configured)
 * 2. Cross-provider alias (same model via hub like Aliyun)
 * 3. Explicit fallback (different model)
 * 4. Universal fallback (any configured provider)
 */
export function resolveProviderForAgentWithFallback(
  config: OhMyClaudeConfig,
  agentName: string
): { provider: string; model: string; temperature?: number } | null {
  const agentConfig = config.agents[agentName];
  if (!agentConfig) return null;

  // 1. Try primary provider
  if (isProviderConfigured(config, agentConfig.provider)) {
    return {
      provider: agentConfig.provider,
      model: agentConfig.model,
      temperature: agentConfig.temperature,
    };
  }

  // 2. Try cross-provider alias (same model via hub provider like Aliyun)
  //    This preserves model quality — e.g. zhipu/GLM-5 → aliyun/GLM-5
  const crossProvider = resolveViaCrossProvider(config, agentConfig.model);
  if (crossProvider) {
    return {
      ...crossProvider,
      temperature: agentConfig.temperature,
    };
  }

  // 3. Try explicit fallback if primary not configured
  if (agentConfig.fallback && isProviderConfigured(config, agentConfig.fallback.provider)) {
    return {
      provider: agentConfig.fallback.provider,
      model: agentConfig.fallback.model,
      temperature: agentConfig.temperature,
    };
  }

  // 4. Try universal fallback: any configured non-Claude provider
  for (const fb of UNIVERSAL_FALLBACK_CHAIN) {
    if (fb.provider === agentConfig.provider) continue;
    if (agentConfig.fallback && fb.provider === agentConfig.fallback.provider) continue;

    if (isProviderConfigured(config, fb.provider)) {
      return {
        provider: fb.provider,
        model: fb.model,
        temperature: agentConfig.temperature,
      };
    }
  }

  // Return primary anyway (will fail at runtime with helpful error)
  return {
    provider: agentConfig.provider,
    model: agentConfig.model,
    temperature: agentConfig.temperature,
  };
}

/**
 * Load bridge configuration from main config
 */
export function loadBridgeConfig(config: OhMyClaudeConfig): MultiBridgeConfig {
  if (config.bridge) {
    return config.bridge;
  }
  return DEFAULT_BRIDGE_CONFIG;
}

/**
 * Get bridge configuration path
 */
export function getBridgeConfigPath(): string {
  const home = homedir();
  return join(home, ".claude", "bridge.json");
}

/**
 * Load bridge configuration from dedicated file (if exists)
 */
export function loadBridgeConfigFromFile(): MultiBridgeConfig {
  const bridgeConfigPath = getBridgeConfigPath();
  
  if (existsSync(bridgeConfigPath)) {
    try {
      const content = readFileSync(bridgeConfigPath, "utf-8");
      const parsed = JSON.parse(content);
      return MultiBridgeConfigSchema.parse(parsed);
    } catch (error) {
      console.warn(`Warning: Failed to parse bridge config at ${bridgeConfigPath}:`, error);
    }
  }

  return DEFAULT_BRIDGE_CONFIG;
}


