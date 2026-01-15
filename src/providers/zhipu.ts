/**
 * ZhiPu GLM API client (Anthropic-compatible)
 *
 * Models:
 * - glm-4.7: Latest general-purpose model (most capable)
 * - glm-4.5-air: Fast, cost-efficient model
 * - glm-4v-flash: Vision model for UI/UX work
 *
 * Endpoint: https://open.bigmodel.cn/api/anthropic
 * Docs: https://docs.bigmodel.cn/cn/guide/develop/claude
 */

import { AnthropicCompatibleClient, createAnthropicClientFromEnv } from "./anthropic-client";

const ZHIPU_BASE_URL = "https://open.bigmodel.cn/api/anthropic";
const ZHIPU_API_KEY_ENV = "ZHIPU_API_KEY";

export function createZhiPuClient(): AnthropicCompatibleClient {
  return createAnthropicClientFromEnv(
    "ZhiPu",
    ZHIPU_BASE_URL,
    ZHIPU_API_KEY_ENV,
    "glm-4.7"
  );
}

export const zhipuClient = createZhiPuClient();
