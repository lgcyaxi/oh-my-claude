/**
 * Agent definitions for oh-my-claude
 *
 * All agents run via Claude Code's Task tool (Claude subscription).
 * Auto-routing agents embed [omc-route:model] in their system prompt —
 * when a proxy is active, requests are routed to the best available provider.
 * Without proxy, they run natively on Claude's model.
 *
 * Categories:
 * - Claude-native: sisyphus, prometheus, claude-reviewer, claude-scout, oracle
 * - Auto-routing (model-only): analyst, librarian, document-writer, navigator, hephaestus, ui-designer
 * - Provider agents (provider/model): kimi, mm-cn, deepseek, deepseek-r, qwen, zhipu
 */

export * from './types';

// Claude-native agents (Task tool, Claude subscription model)
export { sisyphusAgent } from './sisyphus';
export { claudeReviewerAgent } from './claude-reviewer';
export { claudeScoutAgent } from './claude-scout';
export { prometheusAgent } from './prometheus';
export { oracleAgent } from './oracle';
export { uiDesignerAgent } from './ui-designer';

// Auto-routing agents (model directive triggers proxy routing)
export { analystAgent } from './analyst';
export { librarianAgent } from './librarian';
export { documentWriterAgent } from './document-writer';
export { navigatorAgent } from './navigator';
export { hephaestusAgent } from './hephaestus';

// Provider agents (explicit provider/model routing)
export { kimiAgent } from './providers/kimi';
export { mmCnAgent } from './providers/mm-cn';
export { deepseekAgent } from './providers/deepseek';
export { deepseekRAgent } from './providers/deepseek-r';
export { qwenAgent } from './providers/qwen';
export { zhipuAgent } from './providers/zhipu';
export { providerAgentList } from './providers';

// Re-export individual agents
import { sisyphusAgent } from './sisyphus';
import { claudeReviewerAgent } from './claude-reviewer';
import { claudeScoutAgent } from './claude-scout';
import { prometheusAgent } from './prometheus';
import { uiDesignerAgent } from './ui-designer';
import { analystAgent } from './analyst';
import { librarianAgent } from './librarian';
import { documentWriterAgent } from './document-writer';
import { oracleAgent } from './oracle';
import { navigatorAgent } from './navigator';
import { hephaestusAgent } from './hephaestus';
import { providerAgentList } from './providers';
import type { AgentDefinition } from './types';

/**
 * All available agents (role + provider)
 */
export const agents: Record<string, AgentDefinition> = {
	// Claude-native agents
	sisyphus: sisyphusAgent,
	'claude-reviewer': claudeReviewerAgent,
	'claude-scout': claudeScoutAgent,
	prometheus: prometheusAgent,
	oracle: oracleAgent,
	'ui-designer': uiDesignerAgent,

	// Auto-routing agents (model directive)
	analyst: analystAgent,
	librarian: librarianAgent,
	'document-writer': documentWriterAgent,
	navigator: navigatorAgent,
	hephaestus: hephaestusAgent,

	// Provider agents (explicit provider/model)
	...Object.fromEntries(providerAgentList.map((a) => [a.name, a])),
};

/**
 * Agents that run via Claude Code Task tool (sync, uses Claude subscription)
 */
export const taskAgents = [
	sisyphusAgent,
	claudeReviewerAgent,
	claudeScoutAgent,
	prometheusAgent,
	uiDesignerAgent,
	analystAgent,
	librarianAgent,
	documentWriterAgent,
	oracleAgent,
	navigatorAgent,
	hephaestusAgent,
	...providerAgentList,
];

/**
 * Get agent by name
 */
export function getAgent(name: string): AgentDefinition | undefined {
	return agents[name.toLowerCase()];
}

/**
 * Agents that support native execution via Claude subscription (Task tool)
 */
export const nativeAgents = [
	sisyphusAgent,
	prometheusAgent,
	claudeReviewerAgent,
	claudeScoutAgent,
	uiDesignerAgent,
	analystAgent,
	librarianAgent,
	documentWriterAgent,
	oracleAgent,
	navigatorAgent,
	hephaestusAgent,
	...providerAgentList,
];

/**
 * Provider agents only (agents bound to specific providers, not role-specialized)
 */
export { providerAgentList as providerAgents };

/**
 * Check if agent uses Claude subscription (Task tool)
 */
export function isTaskAgent(agent: AgentDefinition): boolean {
	return agent.executionMode === 'task';
}
