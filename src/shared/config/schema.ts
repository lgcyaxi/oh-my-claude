import { z } from 'zod';
import modelsRegistry from './models-registry.json';

// Build agent defaults from registry (single source of truth)
type RegistryAgent =
	(typeof modelsRegistry.agents)[keyof typeof modelsRegistry.agents];

function buildAgentDefaults(): Record<
	string,
	{
		provider: string;
		model: string;
		temperature?: number;
		fallback?: { provider: string; model: string };
	}
> {
	const agents: Record<string, any> = {};
	for (const [name, agent] of Object.entries(modelsRegistry.agents)) {
		const a = agent as RegistryAgent & {
			temperature?: number;
			fallback?: { provider: string; model: string };
		};
		const entry: any = { provider: a.provider, model: a.model };
		if (a.temperature !== undefined) entry.temperature = a.temperature;
		if (a.fallback) entry.fallback = a.fallback;
		agents[name] = entry;
	}
	return agents;
}

// Build category defaults from registry (single source of truth)
function buildCategoryDefaults(): Record<
	string,
	{ provider: string; model: string; temperature?: number }
> {
	const categories: Record<string, any> = {};
	for (const [name, cat] of Object.entries(modelsRegistry.categories)) {
		categories[name] = {
			provider: cat.provider,
			model: cat.model,
			temperature: cat.temperature,
		};
	}
	return categories;
}

// Provider configuration schemas
export const ProviderTypeSchema = z.enum([
	'claude-subscription',
	'openai-compatible',
	'anthropic-compatible',
	// OAuth-based providers (credentials via `oh-my-claude auth login`)
	'openai-oauth',
]);

export const ProviderConfigSchema = z.object({
	type: ProviderTypeSchema,
	base_url: z.string().url().optional(),
	api_key_env: z.string().optional(),
	note: z.string().optional(),
});

// Agent configuration schema
export const AgentConfigSchema = z.object({
	provider: z.string(),
	model: z.string(),
	temperature: z.number().min(0).max(2).optional(),
	max_tokens: z.number().optional(),
	thinking: z
		.object({
			enabled: z.boolean(),
			budget_tokens: z.number().optional(),
		})
		.optional(),
	/** Fallback provider+model when primary is not configured (e.g., OAuth not set up) */
	fallback: z
		.object({
			provider: z.string(),
			model: z.string(),
		})
		.optional(),
});

// Category configuration schema
export const CategoryConfigSchema = z.object({
	provider: z.string(),
	model: z.string(),
	temperature: z.number().min(0).max(2).optional(),
	variant: z.string().optional(),
	prompt_append: z.string().optional(),
});

// Concurrency configuration schema
export const ConcurrencyConfigSchema = z.object({
	/** Global maximum concurrent tasks across all providers */
	global: z.number().min(1).max(50).default(10),
	/** Per-provider limits */
	per_provider: z.record(z.string(), z.number().min(1).max(20)).optional(),
});

// Memory configuration schema
export const MemoryConfigSchema = z.object({
	/** Default scope for read operations (default: all) */
	defaultReadScope: z.enum(['project', 'global', 'all']).default('all'),
	/** Default scope for write operations (default: auto - project if available) */
	defaultWriteScope: z.enum(['project', 'global', 'auto']).default('auto'),
	/** Context threshold percentage for auto-save (0 to disable, default: 75) */
	autoSaveThreshold: z.number().min(0).max(100).default(75),
	/** Dedicated provider for memory AI operations (independent from main session switch) */
	aiProvider: z.string().optional(),
	/** Dedicated model for memory AI operations */
	aiModel: z.string().optional(),
	/** Provider priority for AI-powered features (compaction, summarization).
	 *  Domestic MiniMax (`minimax-cn`) is tried before the global endpoint
	 *  because the primary user geo gets lower latency + better quota there. */
	aiProviderPriority: z
		.array(z.string())
		.default(['minimax-cn', 'minimax', 'zhipu', 'deepseek']),
	/** Embedding provider configuration for semantic search */
	embedding: z
		.object({
			/** Embedding provider: "custom" (OpenAI-compatible via EMBEDDING_API_BASE), "zhipu", or "none" */
			provider: z.enum(['custom', 'zhipu', 'none']).default('custom'),
			/** Embedding model name (for zhipu; custom reads EMBEDDING_MODEL env) */
			model: z.string().default('embedding-3'),
			/** Embedding dimensions (optional, auto-detected for custom provider) */
			dimensions: z.number().min(64).max(8192).optional(),
		})
		.optional(),
	/** Markdown chunking configuration for indexing */
	chunking: z
		.object({
			/** Target tokens per chunk (default: 400) */
			tokens: z.number().min(100).max(2000).default(400),
			/** Overlap tokens between chunks (default: 80) */
			overlap: z.number().min(0).max(200).default(80),
		})
		.optional(),
	/** Search configuration */
	search: z
		.object({
			/** Hybrid search (FTS5 + vector) configuration */
			hybrid: z
				.object({
					/** Enable hybrid search when embeddings are available (default: true) */
					enabled: z.boolean().default(true),
					/** Weight for vector similarity (default: 0.7) */
					vectorWeight: z.number().min(0).max(1).default(0.7),
					/** Weight for FTS5 BM25 text matching (default: 0.3) */
					textWeight: z.number().min(0).max(1).default(0.3),
					/** Multiplier for candidate pool size (default: 4) */
					candidateMultiplier: z.number().min(1).max(10).default(4),
				})
				.optional(),
			/** Maximum characters for recall snippets (default: 300) */
			snippetMaxChars: z.number().min(100).max(1000).default(300),
		})
		.optional(),
	/** Deduplication configuration */
	dedup: z
		.object({
			/** Skip exact hash matches silently (default: true) */
			exactHashSkip: z.boolean().default(true),
			/** Cosine similarity threshold for near-duplicate detection (default: 0.90) */
			semanticThreshold: z.number().min(0.5).max(1.0).default(0.9),
			/** Tag near-duplicates for deferred resolution during compact (default: true) */
			tagAndDefer: z.boolean().default(true),
		})
		.optional(),
	/**
	 * Automatic past-date rotation. Runs on SessionStart; bundles per-day
	 * session/auto-commit files into a single daily-rollup note so the
	 * memory tree stops growing indefinitely. Uses the configured memory
	 * AI provider when available, falls back to a deterministic concat
	 * when the proxy is unreachable so rotation still happens offline.
	 */
	autoRotate: z
		.object({
			/** Enable automatic rotation on SessionStart (default: true) */
			enabled: z.boolean().default(true),
			/** Do not rotate files whose date is within this many days of today (default: 1) */
			graceDays: z.number().int().min(0).max(30).default(1),
			/** Only rotate a date when it has at least this many files (default: 3) */
			thresholdFiles: z.number().int().min(2).max(50).default(3),
			/** Cap on how many dates to rotate per SessionStart (default: 2) */
			maxDatesPerRun: z.number().int().min(1).max(20).default(2),
			/** Prefer LLM narrative summary when proxy is healthy (default: true) */
			useLLMWhenAvailable: z.boolean().default(true),
		})
		.default({
			enabled: true,
			graceDays: 1,
			thresholdFiles: 3,
			maxDatesPerRun: 2,
			useLLMWhenAvailable: true,
		}),
});

// Proxy configuration schema
export const ProxyConfigSchema = z.object({
	/** Main proxy port (Claude Code connects here) */
	port: z.number().min(1024).max(65535).default(18910),
	/** Control API port (health/status/switch endpoints) */
	controlPort: z.number().min(1024).max(65535).default(18911),
	/** Whether the proxy feature is enabled */
	enabled: z.boolean().default(false),
});

// Main configuration schema
export const OhMyClaudeConfigSchema = z.object({
	$schema: z.string().optional(),

	providers: z.record(z.string(), ProviderConfigSchema).default({
		claude: {
			type: 'claude-subscription',
			note: "Uses Claude Code's native subscription - no API key needed",
		},
		deepseek: {
			type: 'anthropic-compatible',
			base_url: 'https://api.deepseek.com/anthropic',
			api_key_env: 'DEEPSEEK_API_KEY',
		},
		zhipu: {
			type: 'anthropic-compatible',
			base_url: 'https://open.bigmodel.cn/api/anthropic',
			api_key_env: 'ZHIPU_API_KEY',
		},
		zai: {
			type: 'anthropic-compatible',
			base_url: 'https://api.z.ai/api/anthropic',
			api_key_env: 'ZAI_API_KEY',
		},
		minimax: {
			type: 'anthropic-compatible',
			base_url: 'https://api.minimax.io/anthropic',
			api_key_env: 'MINIMAX_API_KEY',
		},
		'minimax-cn': {
			type: 'anthropic-compatible',
			base_url: 'https://api.minimaxi.com/anthropic',
			api_key_env: 'MINIMAX_CN_API_KEY',
		},
		kimi: {
			type: 'anthropic-compatible',
			base_url: 'https://api.kimi.com/coding',
			api_key_env: 'KIMI_API_KEY',
		},
		aliyun: {
			type: 'anthropic-compatible',
			base_url: 'https://coding.dashscope.aliyuncs.com/apps/anthropic',
			api_key_env: 'ALIYUN_API_KEY',
		},
		openrouter: {
			type: 'anthropic-compatible',
			base_url: 'https://openrouter.ai/api',
			api_key_env: 'OPENROUTER_API_KEY',
		},
		ollama: {
			type: 'anthropic-compatible',
			base_url: 'http://localhost:11434',
			api_key_env: 'OLLAMA_API_KEY',
			note: 'Ollama local inference (Anthropic Messages API) - API key optional',
		},
		// OAuth-based providers (credentials via `oh-my-claude auth login`)
		openai: {
			type: 'openai-oauth',
			base_url: 'https://chatgpt.com/backend-api/codex',
			note: "OpenAI Codex via OAuth - run 'oh-my-claude auth login openai'",
		},
	}),

	// Agent and category defaults imported from models-registry.json (single source of truth)
	agents: z
		.record(z.string(), AgentConfigSchema)
		.default(buildAgentDefaults()),

	categories: z
		.record(z.string(), CategoryConfigSchema)
		.default(buildCategoryDefaults()),

	disabled_agents: z.array(z.string()).optional(),
	disabled_hooks: z.array(z.string()).optional(),

	// Concurrency limits for background tasks
	concurrency: ConcurrencyConfigSchema.optional(),

	// Proxy configuration for live model switching
	proxy: ProxyConfigSchema.optional(),

	// Memory configuration
	memory: MemoryConfigSchema.optional(),

	// Debug settings
	debugTaskTracker: z.boolean().optional(),
	debugHooks: z.boolean().optional(),
});

export type OhMyClaudeConfig = z.infer<typeof OhMyClaudeConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type CategoryConfig = z.infer<typeof CategoryConfigSchema>;
export type ConcurrencyConfig = z.infer<typeof ConcurrencyConfigSchema>;
export type ProxyConfig = z.infer<typeof ProxyConfigSchema>;
export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;

// Default configuration
export const DEFAULT_CONFIG: OhMyClaudeConfig = OhMyClaudeConfigSchema.parse(
	{},
);
