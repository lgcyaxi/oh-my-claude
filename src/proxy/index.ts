/**
 * Proxy module barrel export
 */

export type {
  ProxySwitchState,
  ProxyConfig,
  ProxyAuthConfig,
  ForwardOptions,
} from "./types";

export {
  DEFAULT_PROXY_CONFIG,
  DEFAULT_SWITCH_STATE,
} from "./types";

export {
  readSwitchState,
  writeSwitchState,
  resetSwitchState,
  decrementAndCheck,
  isTimedOut,
  getSwitchStatePath,
} from "./state";

export {
  readAuthConfig,
  writeAuthConfig,
  initializeAuth,
  getPassthroughAuth,
  getProviderAuth,
  getAuthConfigPath,
  generateProxyToken,
  validateProxyToken,
} from "./auth";
