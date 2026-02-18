/**
 * Multi-provider API clients for oh-my-claude
 *
 * Default providers use Anthropic-compatible endpoints:
 * - DeepSeek: https://api.deepseek.com/anthropic
 * - ZhiPu GLM: https://open.bigmodel.cn/api/anthropic
 * - MiniMax: https://api.minimaxi.com/anthropic
 * - Kimi: https://api.kimi.com/coding
 *
 * OAuth providers:
 * - OpenAI/Codex: Codex OAuth
 */

export * from "./types";
export * from "./base-client";
export * from "./anthropic-client";
export * from "./deepseek";
export * from "./zhipu";
export * from "./minimax";
export * from "./openai-native";
export * from "./router";
