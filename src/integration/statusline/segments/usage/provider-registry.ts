/**
 * Provider registry — defines which providers are available and how to fetch their data.
 *
 * Each ProviderDefinition encapsulates:
 * - Detection: is the provider configured (API key, credential)?
 * - Fetching: the actual API call to get quota/balance
 * - Display: abbreviation for statusline output
 *
 * The registry is built from environment at call time, so hot-reloading
 * API keys (e.g., after auth login) is supported.
 */

import type { ProviderCacheEntry } from "./types";
import {
  fetchDeepSeekBalance,
  fetchZhiPuQuota,
  fetchMiniMaxQuota,
  fetchKimiQuota,
  fetchLocalUsage,
} from "./providers";
import { fetchAliyunQuota } from "./aliyun";
import { fetchOpenAIUsage, isOpenAIConfigured } from "./openai";
import { hasKimiCredential } from "../../../../shared/auth/kimi";
import { hasAliyunCredential } from "../../../../shared/auth/aliyun";
import { hasMiniMaxCredential } from "../../../../shared/auth/minimax";

/** Provider abbreviations for statusline display */
export const PROVIDER_ABBREV: Record<string, string> = {
  deepseek: "DS",
  zhipu: "ZP",
  minimax: "MM",
  kimi: "KM",
  aliyun: "AY",
  openai: "Codex",
};

export interface ProviderDefinition {
  key: string;
  abbrev: string;
  /** Local-only providers use proxy request counts, not remote API */
  localOnly?: boolean;
  /** Whether results should be cached (default: true for remote APIs) */
  cacheable?: boolean;
  /** Check if provider is configured in this environment */
  isConfigured: () => boolean;
  /** Fetch quota/balance from remote API */
  fetch: () => Promise<ProviderCacheEntry | null>;
}

/**
 * Build the provider registry from current environment.
 *
 * Order here determines display order in the statusline.
 */
export function buildProviderRegistry(): ProviderDefinition[] {
  const registry: ProviderDefinition[] = [];

  // DeepSeek: remote balance API
  registry.push({
    key: "deepseek",
    abbrev: PROVIDER_ABBREV.deepseek!,
    isConfigured: () => !!process.env.DEEPSEEK_API_KEY,
    fetch: () => fetchDeepSeekBalance(process.env.DEEPSEEK_API_KEY!),
  });

  // ZhiPu: remote quota API
  registry.push({
    key: "zhipu",
    abbrev: PROVIDER_ABBREV.zhipu!,
    isConfigured: () => !!process.env.ZHIPU_API_KEY,
    fetch: () => fetchZhiPuQuota(process.env.ZHIPU_API_KEY!),
  });

  // MiniMax: remote quota API with API key or saved credentials
  registry.push({
    key: "minimax",
    abbrev: PROVIDER_ABBREV.minimax!,
    isConfigured: () =>
      !!(process.env.MINIMAX_API_KEY || process.env.MINIMAX_CN_API_KEY) || hasMiniMaxCredential(),
    fetch: () => fetchMiniMaxQuota(),
  });

  // Kimi: remote quota API with API key or saved credentials
  registry.push({
    key: "kimi",
    abbrev: PROVIDER_ABBREV.kimi!,
    isConfigured: () => !!process.env.KIMI_API_KEY || hasKimiCredential(),
    fetch: () => hasKimiCredential() ? fetchKimiQuota() : Promise.resolve(null),
  });

  // Aliyun: remote quota API with saved cookie credentials
  registry.push({
    key: "aliyun",
    abbrev: PROVIDER_ABBREV.aliyun!,
    isConfigured: () => !!process.env.ALIYUN_API_KEY || hasAliyunCredential(),
    fetch: () => hasAliyunCredential() ? fetchAliyunQuota() : Promise.resolve(null),
  });

  // OpenAI / Codex: shows login status ("ok" when authenticated)
  registry.push({
    key: "openai",
    abbrev: PROVIDER_ABBREV.openai!,
    localOnly: false,
    cacheable: true,
    isConfigured: isOpenAIConfigured,
    fetch: fetchOpenAIUsage,
  });

  return registry;
}

/** Re-export fetchLocalUsage for orchestrator use */
export { fetchLocalUsage };
