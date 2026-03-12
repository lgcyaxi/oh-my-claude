/**
 * Aliyun Coding Plan API client (Anthropic-compatible)
 *
 * Models:
 * - qwen3.5-plus: Latest Qwen 3.5 flagship model
 * - qwen3-max-2026-01-23: Qwen 3 Max snapshot
 * - qwen3-coder-next: Next-gen Qwen code model
 * - qwen3-coder-plus: Qwen code model (Plus tier)
 * - glm-4.7: Third-party GLM model via Aliyun
 * - kimi-k2.5: Third-party Kimi model via Aliyun
 *
 * Endpoints:
 *   Anthropic-compatible: https://coding.dashscope.aliyuncs.com/apps/anthropic
 *   OpenAI-compatible:    https://coding.dashscope.aliyuncs.com/v1
 *
 * Note: This uses the Aliyun Coding Plan (阿里云灵码), NOT the standard
 * DashScope API. Do not mix with dashscope.aliyuncs.xxx endpoints.
 */

import { AnthropicCompatibleClient, createAnthropicClientFromEnv } from "./anthropic-client";

const ALIYUN_BASE_URL = "https://coding.dashscope.aliyuncs.com/apps/anthropic";
const ALIYUN_API_KEY_ENV = "ALIYUN_API_KEY";

export function createAliyunClient(): AnthropicCompatibleClient {
  return createAnthropicClientFromEnv(
    "Aliyun",
    ALIYUN_BASE_URL,
    ALIYUN_API_KEY_ENV,
    "qwen3.5-plus"
  );
}

export const aliyunClient = createAliyunClient();
