/**
 * Agent definitions for oh-my-claude
 *
 * Agents are organized by category:
 * - Native (Claude subscription, Task tool): sisyphus, claude-reviewer, claude-scout, prometheus, ui-designer
 * - Native with auto-routing (proxy model field): analyst, librarian, document-writer, navigator, hephaestus
 * - Native Claude (no model field, passthrough): oracle
 */

export * from './types';

// Claude subscription agents (Task tool - sync)
export { sisyphusAgent } from './sisyphus';
export { claudeReviewerAgent } from './claude-reviewer';
export { claudeScoutAgent } from './claude-scout';
export { prometheusAgent } from './prometheus';

// Fallback agents (Task tool - when external CLI unavailable)
export { uiDesignerAgent } from './ui-designer';

// Auto-routing agents (model field triggers proxy routing)
export { analystAgent } from './analyst';
export { librarianAgent } from './librarian';
export { documentWriterAgent } from './document-writer';
export { oracleAgent } from './oracle';
export { navigatorAgent } from './navigator';
export { hephaestusAgent } from './hephaestus';

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
import type { AgentDefinition, WorkerRole } from './types';

/**
 * All available agents
 */
export const agents: Record<string, AgentDefinition> = {
	// Claude subscription agents
	sisyphus: sisyphusAgent,
	'claude-reviewer': claudeReviewerAgent,
	'claude-scout': claudeScoutAgent,
	prometheus: prometheusAgent,

	// Fallback agents
	'ui-designer': uiDesignerAgent,

	// Auto-routing agents (native with model field)
	analyst: analystAgent,
	librarian: librarianAgent,
	'document-writer': documentWriterAgent,
	oracle: oracleAgent,
	navigator: navigatorAgent,
	hephaestus: hephaestusAgent,
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
];

/**
 * Bridge agents that delegate to bridge workers
 * @deprecated All former bridge agents now use auto-routing via model field
 */
export const bridgeAgents: AgentDefinition[] = [];

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
];

/**
 * Check if agent uses Claude subscription (Task tool)
 */
export function isTaskAgent(agent: AgentDefinition): boolean {
	return agent.executionMode === 'task';
}

export function resolveAgentWorker(agent: AgentDefinition): string | undefined {
	if (!agent.category.includes('bridge') || !agent.bridgeRole)
		return undefined;
	const roleToWorker: Record<WorkerRole, string> = {
		code: 'cc:glm',
		audit: 'codex',
		docs: 'cc:mm',
		design: 'cc:kimi',
		general: 'cc:glm',
	};
	return roleToWorker[agent.bridgeRole];
}
