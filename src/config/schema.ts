import { z } from "zod";

// Provider configuration schemas
export const ProviderTypeSchema = z.enum([
  "claude-subscription",
  "openai-compatible",
  "anthropic-compatible",
  "openrouter",
]);

export const ProviderConfigSchema = z.object({
  type: ProviderTypeSchema,
  base_url: z.string().url().optional(),
  api_key_env: z.string().optional(),
  note: z.string().optional(),
});

// Agent fallback configuration schema
export const AgentFallbackConfigSchema = z.object({
  provider: z.string(),
  model: z.string(),
  executionMode: z.enum(["task", "mcp"]).optional(),
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
  fallback: AgentFallbackConfigSchema.optional(),
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
  default: z.number().min(1).max(50).default(5),
  per_provider: z.record(z.string(), z.number()).optional(),
  per_model: z.record(z.string(), z.number()).optional(),
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
    openrouter: {
      type: "openrouter",
      base_url: "https://openrouter.ai/api/v1",
      api_key_env: "OPENROUTER_API_KEY",
    },
  }),

  agents: z.record(z.string(), AgentConfigSchema).default({
    // Claude subscription agents (no fallback needed)
    Sisyphus: { provider: "claude", model: "claude-opus-4-5" },
    "claude-reviewer": {
      provider: "claude",
      model: "claude-sonnet-4-5",
      temperature: 0.1,
    },
    "claude-scout": {
      provider: "claude",
      model: "claude-haiku-4-5",
      temperature: 0.3,
    },
    // External API agents (with Claude fallbacks)
    oracle: {
      provider: "deepseek",
      model: "deepseek-reasoner",
      temperature: 0.1,
      fallback: { provider: "claude", model: "claude-opus-4-5", executionMode: "task" },
    },
    librarian: {
      provider: "zhipu",
      model: "glm-4.7",
      temperature: 0.3,
      fallback: { provider: "claude", model: "claude-sonnet-4-5", executionMode: "task" },
    },
    explore: {
      provider: "deepseek",
      model: "deepseek-chat",
      temperature: 0.1,
      fallback: { provider: "claude", model: "claude-haiku-4-5", executionMode: "task" },
    },
    "frontend-ui-ux": {
      provider: "zhipu",
      model: "glm-4v-flash",
      temperature: 0.7,
      fallback: { provider: "claude", model: "claude-sonnet-4-5", executionMode: "task" },
    },
    "document-writer": {
      provider: "minimax",
      model: "MiniMax-M2.1",
      temperature: 0.5,
      fallback: { provider: "claude", model: "claude-sonnet-4-5", executionMode: "task" },
    },
  }),

  categories: z.record(z.string(), CategoryConfigSchema).default({
    "quick-scout": {
      provider: "claude",
      model: "claude-haiku-4-5",
      temperature: 0.3,
    },
    review: { provider: "claude", model: "claude-sonnet-4-5", temperature: 0.1 },
    "most-capable": {
      provider: "claude",
      model: "claude-opus-4-5",
      temperature: 0.1,
    },
    "visual-engineering": {
      provider: "zhipu",
      model: "glm-4v-flash",
      temperature: 0.7,
    },
    ultrabrain: {
      provider: "deepseek",
      model: "deepseek-reasoner",
      temperature: 0.1,
    },
    quick: { provider: "deepseek", model: "deepseek-chat", temperature: 0.3 },
    writing: { provider: "minimax", model: "MiniMax-M2.1", temperature: 0.5 },
  }),

  concurrency: ConcurrencyConfigSchema.default({
    default: 5,
    per_provider: {
      deepseek: 10,
      zhipu: 10,
      minimax: 5,
      openrouter: 5,
    },
  }),

  disabled_agents: z.array(z.string()).optional(),
  disabled_hooks: z.array(z.string()).optional(),
});

export type OhMyClaudeConfig = z.infer<typeof OhMyClaudeConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type CategoryConfig = z.infer<typeof CategoryConfigSchema>;
export type ConcurrencyConfig = z.infer<typeof ConcurrencyConfigSchema>;

// Default configuration
export const DEFAULT_CONFIG: OhMyClaudeConfig =
  OhMyClaudeConfigSchema.parse({});
