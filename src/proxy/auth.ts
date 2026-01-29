/**
 * Proxy auth token management
 *
 * Manages the mapping between the proxy token (used by Claude Code)
 * and the real API keys for Anthropic and external providers.
 *
 * Auth config stored at: ~/.claude/oh-my-claude/proxy-auth.json (0600)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import type { ProxyAuthConfig } from "./types";
import { loadConfig } from "../config";

/** Path to the proxy auth config file */
export function getAuthConfigPath(): string {
  return join(homedir(), ".claude", "oh-my-claude", "proxy-auth.json");
}

/**
 * Read proxy auth configuration from disk
 * @returns Auth config or null if not configured
 */
export function readAuthConfig(): ProxyAuthConfig | null {
  const authPath = getAuthConfigPath();

  try {
    if (!existsSync(authPath)) {
      return null;
    }

    const content = readFileSync(authPath, "utf-8");
    const parsed = JSON.parse(content) as ProxyAuthConfig;

    if (!parsed.anthropicApiKey || !parsed.proxyToken) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Write proxy auth configuration to disk with restricted permissions
 */
export function writeAuthConfig(config: ProxyAuthConfig): void {
  const authPath = getAuthConfigPath();
  const dir = dirname(authPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(authPath, JSON.stringify(config, null, 2), "utf-8");

  // Restrict file permissions to owner only (0600)
  try {
    chmodSync(authPath, 0o600);
  } catch {
    // May fail on Windows — not critical
  }
}

/**
 * Generate a new proxy token
 */
export function generateProxyToken(): string {
  return `omc-proxy-${randomUUID()}`;
}

/**
 * Initialize or update proxy auth
 * Captures ANTHROPIC_API_KEY from environment and generates proxy token
 * @returns The proxy token to set as ANTHROPIC_API_KEY for Claude Code
 */
export function initializeAuth(): ProxyAuthConfig {
  const existing = readAuthConfig();

  // Capture real Anthropic API key from environment
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY not set in environment. " +
      "The proxy needs to capture this before replacing it with a proxy token."
    );
  }

  // Reuse existing proxy token if auth is already configured with the same key
  if (existing && existing.anthropicApiKey === anthropicApiKey) {
    return existing;
  }

  const config: ProxyAuthConfig = {
    anthropicApiKey,
    proxyToken: existing?.proxyToken ?? generateProxyToken(),
    configuredAt: new Date().toISOString(),
  };

  writeAuthConfig(config);
  return config;
}

/**
 * Get the passthrough auth (real Anthropic API key + base URL)
 */
export function getPassthroughAuth(): {
  apiKey: string;
  baseUrl: string;
} {
  const authConfig = readAuthConfig();
  if (!authConfig) {
    throw new Error(
      "Proxy auth not configured. Run 'oh-my-claude proxy enable' first."
    );
  }

  return {
    apiKey: authConfig.anthropicApiKey,
    baseUrl: "https://api.anthropic.com",
  };
}

/**
 * Get provider auth for a switched request
 * Resolves API key and base URL from oh-my-claude config
 */
export function getProviderAuth(
  providerName: string
): { apiKey: string; baseUrl: string } {
  const config = loadConfig();
  const providerConfig = config.providers[providerName];

  if (!providerConfig) {
    throw new Error(`Unknown provider: ${providerName}`);
  }

  if (providerConfig.type === "claude-subscription") {
    throw new Error(
      `Provider "${providerName}" is a Claude subscription — cannot switch to it via proxy.`
    );
  }

  // Resolve API key from environment variable
  const apiKeyEnv = providerConfig.api_key_env;
  if (!apiKeyEnv) {
    throw new Error(`Provider "${providerName}" has no api_key_env configured.`);
  }

  const apiKey = process.env[apiKeyEnv];
  if (!apiKey) {
    throw new Error(
      `API key not set for provider "${providerName}". ` +
      `Set the ${apiKeyEnv} environment variable.`
    );
  }

  const baseUrl = providerConfig.base_url;
  if (!baseUrl) {
    throw new Error(`Provider "${providerName}" has no base_url configured.`);
  }

  return { apiKey, baseUrl };
}

/**
 * Validate that a request has the correct proxy token
 */
export function validateProxyToken(token: string): boolean {
  const authConfig = readAuthConfig();
  if (!authConfig) {
    // No auth configured — allow all requests (proxy not in token mode)
    return true;
  }
  return token === authConfig.proxyToken;
}
