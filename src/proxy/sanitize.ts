/**
 * Message sanitization — re-exports from per-provider sanitizers
 *
 * Provider-specific sanitizers live in `sanitizers/`:
 * - sanitizers/index.ts     — dispatcher: picks the right sanitizer per provider
 * - sanitizers/deepseek.ts  — DeepSeek Chat + Reasoner (+ V4)
 * - sanitizers/openrouter.ts — OpenRouter thinking-block normalization
 * - sanitizers/types.ts     — Shared utilities
 *
 * Native providers (ZhiPu, MiniMax, Aliyun, Ollama, Copilot) need zero
 * sanitization and fall through the dispatcher unchanged. Add a new
 * provider sanitizer by creating `sanitizers/{provider}.ts` and registering
 * it in `sanitizers/index.ts`.
 */
export { sanitizeRequestBody } from './sanitizers';
