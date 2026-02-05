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

    if (!parsed.proxyToken) {
      return null;
    }

    // Normalize legacy configs without authMode
    if (!parsed.authMode) {
      parsed.authMode = parsed.anthropicApiKey ? "api-key" : "oauth";
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
 *
 * Supports two auth modes:
 * - "api-key": Captures ANTHROPIC_API_KEY from env (traditional API key auth)
 * - "oauth": No API key needed — forwards original auth headers from Claude Code
 *
 * Auto-detects mode: if ANTHROPIC_API_KEY is set, uses api-key mode; otherwise oauth.
 */
export function initializeAuth(): ProxyAuthConfig {
  const existing = readAuthConfig();

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? "";
  const authMode = anthropicApiKey ? "api-key" : "oauth";

  // Reuse existing config if auth mode and key match
  if (existing && existing.authMode === authMode && existing.anthropicApiKey === anthropicApiKey) {
    return existing;
  }

  const config: ProxyAuthConfig = {
    anthropicApiKey,
    proxyToken: existing?.proxyToken ?? generateProxyToken(),
    authMode,
    configuredAt: new Date().toISOString(),
  };

  writeAuthConfig(config);
  return config;
}

/**
 * Get the passthrough auth config
 *
 * In api-key mode: returns the captured API key
 * In oauth mode: returns empty apiKey (caller must forward original headers)
 */
export function getPassthroughAuth(): {
  apiKey: string;
  baseUrl: string;
  authMode: "api-key" | "oauth";
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
    authMode: authConfig.authMode,
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
