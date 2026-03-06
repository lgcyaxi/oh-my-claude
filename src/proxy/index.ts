/**
 * Proxy module barrel export
 *
 * Subdirectory structure:
 *   state/      — session + switch state management
 *   auth/       — authentication + usage tracking
 *   routing/    — model resolution, route directives, provider forwarding
 *   response/   — response builders, cache, streaming
 *   converters/ — Anthropic ↔ OpenAI/Responses format conversion
 *   handlers/   — request handlers (passthrough, switched, directive, etc.)
 *   control/    — control API endpoints (health, switch, providers, etc.)
 *   sanitizers/ — request body sanitization
 */

export type {
  ProxySwitchState,
  ProxyConfig,
  ProxyAuthConfig,
  ForwardOptions,
} from "./state/types";

export {
  DEFAULT_PROXY_CONFIG,
  DEFAULT_SWITCH_STATE,
} from "./state/types";

export {
  readSwitchState,
  writeSwitchState,
  resetSwitchState,
  getSwitchStatePath,
} from "./state/switch";

export {
  readAuthConfig,
  writeAuthConfig,
  initializeAuth,
  getPassthroughAuth,
  getProviderAuth,
  getAuthConfigPath,
  generateProxyToken,
  validateProxyToken,
} from "./auth/auth";

export {
  startDaemon,
  stopDaemon,
  isRunning,
  getPid,
  getServerScript,
} from "./daemon";
