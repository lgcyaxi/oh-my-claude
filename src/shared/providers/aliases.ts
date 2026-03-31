/**
 * Canonical provider alias map — single source of truth
 *
 * Maps short CLI aliases (e.g. "mm-cn") to provider config names and default models.
 * Used by proxy server startup, CC command, coworker-related launches, and control API.
 */

/** Full provider metadata (for CLI display and validation) */
export interface ProviderInfo {
	provider: string;
	defaultModel: string;
	name: string;
	baseUrl: string;
	apiKeyEnv: string;
}

/** Alias resolution result: config provider name + model */
export interface AliasTarget {
	provider: string;
	model: string;
}

const PROVIDER_INFO_ENTRIES: Record<string, ProviderInfo> = {
	deepseek: {
		provider: 'deepseek',
		defaultModel: 'deepseek-chat',
		name: 'DeepSeek',
		baseUrl: 'https://api.deepseek.com/anthropic',
		apiKeyEnv: 'DEEPSEEK_API_KEY',
	},
	zhipu: {
		provider: 'zhipu',
		defaultModel: 'glm-5.1',
		name: 'ZhiPu',
		baseUrl: 'https://open.bigmodel.cn/api/anthropic',
		apiKeyEnv: 'ZHIPU_API_KEY',
	},
	zai: {
		provider: 'zai',
		defaultModel: 'glm-5.1',
		name: 'Z.AI',
		baseUrl: 'https://api.z.ai/api/anthropic',
		apiKeyEnv: 'ZAI_API_KEY',
	},
	minimax: {
		provider: 'minimax',
		defaultModel: 'MiniMax-M2.5',
		name: 'MiniMax',
		baseUrl: 'https://api.minimax.io/anthropic',
		apiKeyEnv: 'MINIMAX_API_KEY',
	},
	'minimax-cn': {
		provider: 'minimax-cn',
		defaultModel: 'MiniMax-M2.5',
		name: 'MiniMax CN',
		baseUrl: 'https://api.minimaxi.com/anthropic',
		apiKeyEnv: 'MINIMAX_CN_API_KEY',
	},
	kimi: {
		provider: 'kimi',
		defaultModel: 'kimi-for-coding',
		name: 'Kimi',
		baseUrl: 'https://api.kimi.com/coding',
		apiKeyEnv: 'KIMI_API_KEY',
	},
	aliyun: {
		provider: 'aliyun',
		defaultModel: 'qwen3.5-plus',
		name: 'Aliyun',
		baseUrl: 'https://coding.dashscope.aliyuncs.com/apps/anthropic',
		apiKeyEnv: 'ALIYUN_API_KEY',
	},
	openrouter: {
		provider: 'openrouter',
		defaultModel: 'nvidia/nemotron-3-super-120b-a12b:free',
		name: 'OpenRouter',
		baseUrl: 'https://openrouter.ai/api',
		apiKeyEnv: 'OPENROUTER_API_KEY',
	},
	ollama: {
		provider: 'ollama',
		defaultModel: '',
		name: 'Ollama',
		baseUrl: 'http://localhost:11434',
		apiKeyEnv: '',
	},
};

/** All recognized aliases → { provider, model }. Includes short forms and full names. */
const ALIAS_MAP: Record<string, AliasTarget> = {
	// DeepSeek
	ds: { provider: 'deepseek', model: 'deepseek-chat' },
	deepseek: { provider: 'deepseek', model: 'deepseek-chat' },
	'ds-r': { provider: 'deepseek', model: 'deepseek-reasoner' },
	'deepseek-reasoner': { provider: 'deepseek', model: 'deepseek-reasoner' },
	// ZhiPu
	zp: { provider: 'zhipu', model: 'glm-5.1' },
	zhipu: { provider: 'zhipu', model: 'glm-5.1' },
	// Z.AI (ZhiPu global)
	zai: { provider: 'zai', model: 'glm-5.1' },
	'zp-g': { provider: 'zai', model: 'glm-5.1' },
	'zhipu-global': { provider: 'zai', model: 'glm-5.1' },
	// MiniMax
	mm: { provider: 'minimax', model: 'MiniMax-M2.5' },
	minimax: { provider: 'minimax', model: 'MiniMax-M2.5' },
	// MiniMax CN
	'mm-cn': { provider: 'minimax-cn', model: 'MiniMax-M2.5' },
	'minimax-cn': { provider: 'minimax-cn', model: 'MiniMax-M2.5' },
	// Kimi
	km: { provider: 'kimi', model: 'kimi-for-coding' },
	kimi: { provider: 'kimi', model: 'kimi-for-coding' },
	// Aliyun
	ay: { provider: 'aliyun', model: 'qwen3.5-plus' },
	ali: { provider: 'aliyun', model: 'qwen3.5-plus' },
	aliyun: { provider: 'aliyun', model: 'qwen3.5-plus' },
	// OpenRouter (multi-model gateway, free tier available)
	or: { provider: 'openrouter', model: 'nvidia/nemotron-3-super-120b-a12b:free' },
	openrouter: { provider: 'openrouter', model: 'nvidia/nemotron-3-super-120b-a12b:free' },
	// Ollama (model must be specified separately)
	ol: { provider: 'ollama', model: '' },
	ollama: { provider: 'ollama', model: '' },
};

/**
 * Resolve an alias to { provider, model }.
 * Returns undefined if the alias is not recognized.
 */
export function resolveAlias(alias: string): AliasTarget | undefined {
	return ALIAS_MAP[alias.toLowerCase()];
}

/**
 * Resolve an alias to its config provider name.
 * Returns the alias as-is if not found (passthrough for already-resolved names).
 */
export function resolveProviderName(alias: string): string {
	const target = ALIAS_MAP[alias.toLowerCase()];
	return target ? target.provider : alias;
}

/**
 * Get full provider info by config provider name.
 * Returns undefined for unknown providers.
 */
export function getProviderInfo(
	providerName: string,
): ProviderInfo | undefined {
	return PROVIDER_INFO_ENTRIES[providerName];
}

/**
 * Get all provider info entries (for building CLI PROVIDER_MAP-compatible structures).
 */
export function getAllProviderInfo(): Record<string, ProviderInfo> {
	return { ...PROVIDER_INFO_ENTRIES };
}

/**
 * Build a PROVIDER_MAP-compatible record keyed by alias.
 * Each alias maps to { name, baseUrl, apiKeyEnv, defaultModel }.
 */
export function buildProviderMap(): Record<
	string,
	{ name: string; baseUrl: string; apiKeyEnv: string; defaultModel: string }
> {
	const result: Record<
		string,
		{
			name: string;
			baseUrl: string;
			apiKeyEnv: string;
			defaultModel: string;
		}
	> = {};
	for (const [alias, target] of Object.entries(ALIAS_MAP)) {
		const info = PROVIDER_INFO_ENTRIES[target.provider];
		if (!info) continue;
		result[alias] = {
			name: info.name,
			baseUrl: info.baseUrl,
			apiKeyEnv: info.apiKeyEnv,
			defaultModel: target.model || info.defaultModel,
		};
	}
	return result;
}
