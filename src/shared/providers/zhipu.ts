/**
 * ZhiPu GLM API client (Anthropic-compatible) — CN endpoint
 *
 * Models:
 * - glm-5: Latest flagship model (coding & agent focused)
 * - glm-4.7: Cost-efficient model
 *
 * CN Endpoint: https://open.bigmodel.cn/api/anthropic (ZHIPU_API_KEY)
 * Global Endpoint: https://api.z.ai/api/anthropic (ZAI_API_KEY) — via zhipu-global provider
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
    "glm-5"
  );
}

export const zhipuClient = createZhiPuClient();
