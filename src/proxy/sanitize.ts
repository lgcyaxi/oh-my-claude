/**
 * Message sanitization — re-exports from per-provider sanitizers
 *
 * Provider-specific sanitizers live in sanitizers/:
 * - sanitizers/deepseek.ts — DeepSeek Chat + Reasoner
 * - sanitizers/default.ts  — Aliyun, Ollama, Copilot, etc.
 * - sanitizers/types.ts    — Shared utilities
 *
 * Native providers (ZhiPu, MiniMax) need zero sanitization.
 * Kimi needs thinking block stripping when switching mid-session.
 * Add new provider sanitizers by creating sanitizers/{provider}.ts
 * and registering in sanitizers/index.ts.
 */
export { sanitizeRequestBody, stripThinkingFromBody } from './sanitizers';
