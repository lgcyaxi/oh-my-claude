import { z } from "zod";
import { MultiBridgeConfigSchema, type MultiBridgeConfig } from "./bridge";

// Provider configuration schemas
export const ProviderTypeSchema = z.enum([
  "claude-subscription",
  "openai-compatible",
  "anthropic-compatible",
  // OAuth-based providers (credentials via `oh-my-claude auth login`)
  "openai-oauth",
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
  defaultReadScope: z.enum(["project", "global", "all"]).default("all"),
  /** Default scope for write operations (default: auto - project if available) */
  defaultWriteScope: z.enum(["project", "global", "auto"]).default("auto"),
  /** Context threshold percentage for auto-save (0 to disable, default: 75) */
  autoSaveThreshold: z.number().min(0).max(100).default(75),
  /** Provider priority for AI-powered features (compaction, summarization) */
  aiProviderPriority: z.array(z.string()).default(["zhipu", "minimax", "deepseek"]),
  /** Embedding provider configuration for semantic search */
  embedding: z.object({
    /** Embedding provider: "custom" (OpenAI-compatible via EMBEDDING_API_BASE), "zhipu", or "none" */
    provider: z.enum(["custom", "zhipu", "none"]).default("custom"),
    /** Embedding model name (for zhipu; custom reads EMBEDDING_MODEL env) */
    model: z.string().default("embedding-3"),
    /** Embedding dimensions (optional, auto-detected for custom provider) */
    dimensions: z.number().min(64).max(8192).optional(),
  }).optional(),
  /** Markdown chunking configuration for indexing */
  chunking: z.object({
    /** Target tokens per chunk (default: 400) */
    tokens: z.number().min(100).max(2000).default(400),
    /** Overlap tokens between chunks (default: 80) */
    overlap: z.number().min(0).max(200).default(80),
  }).optional(),
  /** Search configuration */
  search: z.object({
    /** Hybrid search (FTS5 + vector) configuration */
    hybrid: z.object({
      /** Enable hybrid search when embeddings are available (default: true) */
      enabled: z.boolean().default(true),
      /** Weight for vector similarity (default: 0.7) */
      vectorWeight: z.number().min(0).max(1).default(0.7),
      /** Weight for FTS5 BM25 text matching (default: 0.3) */
      textWeight: z.number().min(0).max(1).default(0.3),
      /** Multiplier for candidate pool size (default: 4) */
      candidateMultiplier: z.number().min(1).max(10).default(4),
    }).optional(),
    /** Maximum characters for recall snippets (default: 300) */
    snippetMaxChars: z.number().min(100).max(1000).default(300),
  }).optional(),
  /** Deduplication configuration */
  dedup: z.object({
    /** Skip exact hash matches silently (default: true) */
    exactHashSkip: z.boolean().default(true),
    /** Cosine similarity threshold for near-duplicate detection (default: 0.90) */
    semanticThreshold: z.number().min(0.5).max(1.0).default(0.90),
    /** Tag near-duplicates for deferred resolution during compact (default: true) */
    tagAndDefer: z.boolean().default(true),
  }).optional(),
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
      type: "claude-subscription",
      note: "Uses Claude Code's native subscription - no API key needed",
    },
    deepseek: {
      type: "anthropic-compatible",
      base_url: "https://api.deepseek.com/anthropic",
      api_key_env: "DEEPSEEK_API_KEY",
    },
    zhipu: {
      type: "anthropic-compatible",
      base_url: "https://open.bigmodel.cn/api/anthropic",
      api_key_env: "ZHIPU_API_KEY",
    },
    minimax: {
      type: "anthropic-compatible",
      base_url: "https://api.minimaxi.com/anthropic",
      api_key_env: "MINIMAX_API_KEY",
    },
    kimi: {
      type: "anthropic-compatible",
      base_url: "https://api.kimi.com/coding",
      api_key_env: "KIMI_API_KEY",
    },
    // OAuth-based providers (credentials via `oh-my-claude auth login`)
    openai: {
      type: "openai-oauth",
      base_url: "https://chatgpt.com/backend-api/codex",
      note: "OpenAI Codex via OAuth - run 'oh-my-claude auth login openai'",
    },
  }),

  agents: z.record(z.string(), AgentConfigSchema).default({
    // Claude subscription agents
    Sisyphus: { provider: "claude", model: "claude-opus-4.5" },
    "claude-reviewer": {
      provider: "claude",
      model: "claude-sonnet-4.5",
      temperature: 0.1,
    },
    "claude-scout": {
      provider: "claude",
      model: "claude-haiku-4.5",
      temperature: 0.3,
    },
    // External API agents
    oracle: {
      provider: "openai",
      model: "gpt-5.2",
      temperature: 0.1,
      fallback: { provider: "deepseek", model: "deepseek-reasoner" },
    },
    analyst: {
      provider: "deepseek",
      model: "deepseek-chat",
      temperature: 0.1,
    },
    librarian: {
      provider: "zhipu",
      model: "GLM-5",
      temperature: 0.3,
    },

    "document-writer": {
      provider: "minimax",
      model: "MiniMax-M2.5",
      temperature: 0.5,
    },
    navigator: {
      provider: "kimi",
      model: "K2.5",
      temperature: 0.3,
    },
    hephaestus: {
      provider: "openai",
      model: "gpt-5.3-codex",
      temperature: 0.3,
    },
  }),

  categories: z.record(z.string(), CategoryConfigSchema).default({
    "quick-scout": {
      provider: "claude",
      model: "claude-haiku-4.5",
      temperature: 0.3,
    },
    review: { provider: "claude", model: "claude-sonnet-4.5", temperature: 0.1 },
    "most-capable": {
      provider: "claude",
      model: "claude-opus-4.5",
      temperature: 0.1,
    },
    "visual-engineering": {
      provider: "kimi",
      model: "K2.5",
      temperature: 0.7,
    },
    ultrabrain: {
      provider: "openai",
      model: "gpt-5.2",
      temperature: 0.1,
    },
    "deep-coding": {
      provider: "openai",
      model: "gpt-5.3-codex",
      temperature: 0.3,
    },
    quick: { provider: "deepseek", model: "deepseek-chat", temperature: 0.3 },
    writing: { provider: "minimax", model: "MiniMax-M2.5", temperature: 0.5 },
    "visual-execution": { provider: "kimi", model: "K2.5", temperature: 0.3 },
  }),

  disabled_agents: z.array(z.string()).optional(),
  disabled_hooks: z.array(z.string()).optional(),

  // Concurrency limits for background tasks
  concurrency: ConcurrencyConfigSchema.optional(),

  // Proxy configuration for live model switching
  proxy: ProxyConfigSchema.optional(),

  // Memory configuration
  memory: MemoryConfigSchema.optional(),

  // Bridge configuration (Multi-AI Bridge system)
  bridge: MultiBridgeConfigSchema.optional(),

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
export type { MultiBridgeConfig };

// Default configuration
export const DEFAULT_CONFIG: OhMyClaudeConfig =
  OhMyClaudeConfigSchema.parse({});
