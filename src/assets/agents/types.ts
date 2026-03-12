/**
 * Agent definition types for oh-my-claude
 */

export interface AgentDefinition {
	/** Agent identifier (used in config) */
	name: string;
	/** Human-readable description */
	description: string;
	/** The system prompt for the agent */
	prompt: string;
	/**
	 * Preferred provider hint (optional). When omitted, provider is resolved
	 * from defaultModel at routing time via the models registry.
	 * For Claude-native agents, set to "claude".
	 */
	defaultProvider?: string;
	/** Default model — used for proxy auto-routing via [omc-route:model] directive */
	defaultModel: string;
	/** Default temperature */
	defaultTemperature?: number;
	/** Whether this agent runs via Claude subscription (Task tool) */
	executionMode: 'task';
	/** Agent categories: native (Claude subscription Task tool), proxy (external APIs via proxy auto-routing) */
	category: ('native' | 'proxy')[];
	/** Tools this agent should NOT use (restrictions) */
	restrictedTools?: string[];
	/**
	 * Agent classification:
	 * - "role": Specialized agents with role-specific prompts (oracle, hephaestus, etc.)
	 * - "provider": Generic agents bound to a specific provider for direct model access (@kimi, @mm-cn, etc.)
	 * Defaults to "role" when omitted.
	 */
	agentType?: 'role' | 'provider';
}

export interface AgentMarkdownOptions {
	/** Override provider from config */
	provider?: string;
	/** Override model from config */
	model?: string;
	/** Override temperature */
	temperature?: number;
}

/**
 * Escape YAML string values that may contain special characters
 */
function escapeYamlString(str: string): string {
	if (/[:\{\}\[\],&*#?|\-<>=!%@`]/.test(str) || str.includes('\n')) {
		return `"${str.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
	}
	return str;
}

/**
 * Generate Claude Code agent .md file content
 *
 * Claude Code agent files require YAML frontmatter with:
 * - name: agent identifier
 * - description: what the agent does
 * - tools: (optional) allowed tools for the agent
 */
export function generateAgentMarkdown(
	agent: AgentDefinition,
	options?: AgentMarkdownOptions,
): string {
	const lines: string[] = [];

	// YAML frontmatter (required by Claude Code)
	lines.push('---');
	lines.push(`name: ${agent.name.toLowerCase()}`);
	lines.push(`description: ${escapeYamlString(agent.description)}`);

	// Add tools based on execution mode
	if (agent.executionMode === 'task') {
		lines.push(
			'tools: Read, Glob, Grep, Bash, Edit, Write, Task, WebFetch, WebSearch',
		);
	} else {
		lines.push('tools: Read, Glob, Grep, Bash, Edit, Write');
	}

	lines.push('---');
	lines.push('');
	lines.push(agent.prompt);

	return lines.join('\n');
}
