/**
 * Provider agents — generic agents bound to specific providers.
 *
 * Unlike role agents (oracle, hephaestus, etc.) which have specialized prompts,
 * provider agents are general-purpose and simply route to a specific provider/model.
 * Use @kimi, @mm-cn, @deepseek, etc. to target a provider directly.
 */

export { kimiAgent } from './kimi';
export { mmCnAgent } from './mm-cn';
export { deepseekAgent } from './deepseek';
export { deepseekRAgent } from './deepseek-r';
export { qwenAgent } from './qwen';
export { zhipuAgent } from './zhipu';

import { kimiAgent } from './kimi';
import { mmCnAgent } from './mm-cn';
import { deepseekAgent } from './deepseek';
import { deepseekRAgent } from './deepseek-r';
import { qwenAgent } from './qwen';
import { zhipuAgent } from './zhipu';
import type { AgentDefinition } from '../types';

/** All provider agents */
export const providerAgentList: AgentDefinition[] = [
	kimiAgent,
	mmCnAgent,
	deepseekAgent,
	deepseekRAgent,
	qwenAgent,
	zhipuAgent,
];
