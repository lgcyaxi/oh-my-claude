/**
 * Type definitions for the oh-my-claude proxy server
 *
 * The proxy intercepts Claude Code's native API calls, enabling
 * in-conversation model switching to external providers.
 */

/** State of the proxy switch — persisted as proxy-switch.json */
export interface ProxySwitchState {
  /** Whether the proxy is currently switched to an external provider */
  switched: boolean;
  /** Provider name (e.g., "deepseek", "zhipu", "minimax") */
  provider?: string;
  /** Model name (e.g., "deepseek-reasoner", "GLM-5") */
  model?: string;
  /** Timestamp when the switch was activated */
  switchedAt?: number;
}

/** Proxy server configuration */
export interface ProxyConfig {
  /** Main proxy port (Claude Code connects here) */
  port: number;
  /** Control API port (health/status/switch endpoints) */
  controlPort: number;
  /** Whether the proxy feature is enabled */
  enabled: boolean;
}

/** Stored auth configuration for the proxy */
export interface ProxyAuthConfig {
  /** The real Anthropic API key (captured from env on enable, empty for OAuth) */
  anthropicApiKey: string;
  /** The proxy token used by Claude Code as ANTHROPIC_API_KEY */
  proxyToken: string;
  /** Auth mode: "api-key" (traditional) or "oauth" (passthrough headers) */
  authMode: "api-key" | "oauth";
  /** Timestamp when auth was configured */
  configuredAt: string;
}

/** Options for forwarding a request to an upstream server */
export interface ForwardOptions {
  /** Target base URL (e.g., "https://api.anthropic.com") */
  targetBase: string;
  /** API key for the target */
  apiKey: string;
  /** Optional body override (for model rewriting) */
  bodyOverride?: Record<string, unknown>;
}

/** Default proxy configuration */
export const DEFAULT_PROXY_CONFIG: ProxyConfig = {
  port: 18910,
  controlPort: 18911,
  enabled: false,
};

/** Default switch state (passthrough mode) */
export const DEFAULT_SWITCH_STATE: ProxySwitchState = {
  switched: false,
};
