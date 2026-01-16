import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { OhMyClaudeConfigSchema, type OhMyClaudeConfig, DEFAULT_CONFIG } from "./schema";

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
 * Resolve provider config for a category
 */
export function resolveProviderForCategory(
  config: OhMyClaudeConfig,
  categoryName: string
): { provider: string; model: string; temperature?: number } | null {
  const categoryConfig = config.categories[categoryName];
  if (categoryConfig) {
    return {
      provider: categoryConfig.provider,
      model: categoryConfig.model,
      temperature: categoryConfig.temperature,
    };
  }
  return null;
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
 * Check if a provider is configured (has API key set)
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

  // Check if API key environment variable is set
  if (providerConfig.api_key_env) {
    const apiKey = process.env[providerConfig.api_key_env];
    return !!apiKey && apiKey.length > 0;
  }

  return false;
}

/**
 * Get fallback configuration for an agent
 */
export function getAgentFallback(
  config: OhMyClaudeConfig,
  agentName: string
): { provider: string; model: string; executionMode?: string } | null {
  const agentConfig = config.agents[agentName];
  if (agentConfig?.fallback) {
    return {
      provider: agentConfig.fallback.provider,
      model: agentConfig.fallback.model,
      executionMode: agentConfig.fallback.executionMode,
    };
  }
  return null;
}

/**
 * Check if an agent should use fallback (primary provider not configured)
 */
export function shouldUseFallback(
  config: OhMyClaudeConfig,
  agentName: string
): { useFallback: boolean; reason?: string; fallback?: { provider: string; model: string; executionMode?: string } } {
  const agentConfig = config.agents[agentName];
  if (!agentConfig) {
    return { useFallback: false };
  }

  // Check if primary provider is configured
  if (!isProviderConfigured(config, agentConfig.provider)) {
    const fallback = getAgentFallback(config, agentName);
    if (fallback) {
      const providerConfig = config.providers[agentConfig.provider];
      const envVar = providerConfig?.api_key_env ?? `${agentConfig.provider.toUpperCase()}_API_KEY`;
      return {
        useFallback: true,
        reason: `${envVar} is not set`,
        fallback,
      };
    }
  }

  return { useFallback: false };
}
