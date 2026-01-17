/**
 * Agent definitions for oh-my-claude
 *
 * Agents are organized by execution mode:
 * - Task tool agents (Claude subscription): sisyphus, claude-reviewer, claude-scout
 * - MCP background agents (external APIs): oracle, analyst, librarian, frontend-ui-ux, document-writer
 *
 * Original agents (MIT Licensed) are available in ./original/
 */

export * from "./types";

// Original agents (MIT Licensed - independent implementation)
export * as original from "./original";

// Claude subscription agents (Task tool - sync)
export { sisyphusAgent } from "./sisyphus";
export { claudeReviewerAgent } from "./claude-reviewer";
export { claudeScoutAgent } from "./claude-scout";
export { prometheusAgent } from "./prometheus";

// External API agents (MCP - async)
export { oracleAgent } from "./oracle";
export { librarianAgent } from "./librarian";
export { analystAgent } from "./analyst";
export { frontendUiUxAgent } from "./frontend-ui-ux";
export { documentWriterAgent } from "./document-writer";

// Re-export individual agents
import { sisyphusAgent } from "./sisyphus";
import { claudeReviewerAgent } from "./claude-reviewer";
import { claudeScoutAgent } from "./claude-scout";
import { prometheusAgent } from "./prometheus";
import { oracleAgent } from "./oracle";
import { librarianAgent } from "./librarian";
import { analystAgent } from "./analyst";
import { frontendUiUxAgent } from "./frontend-ui-ux";
import { documentWriterAgent } from "./document-writer";
import type { AgentDefinition } from "./types";

/**
 * All available agents
 */
export const agents: Record<string, AgentDefinition> = {
  // Claude subscription agents
  sisyphus: sisyphusAgent,
  "claude-reviewer": claudeReviewerAgent,
  "claude-scout": claudeScoutAgent,
  prometheus: prometheusAgent,

  // External API agents
  oracle: oracleAgent,
  analyst: analystAgent,
  librarian: librarianAgent,
  "frontend-ui-ux": frontendUiUxAgent,
  "document-writer": documentWriterAgent,
};

/**
 * Agents that run via Claude Code Task tool (sync, uses Claude subscription)
 */
export const taskAgents = [sisyphusAgent, claudeReviewerAgent, claudeScoutAgent, prometheusAgent];

/**
 * Agents that run via MCP background server (async, uses external APIs)
 */
export const mcpAgents = [
  oracleAgent,
  analystAgent,
  librarianAgent,
  frontendUiUxAgent,
  documentWriterAgent,
];

/**
 * Get agent by name
 */
export function getAgent(name: string): AgentDefinition | undefined {
  return agents[name.toLowerCase()];
}

/**
 * Check if agent uses Claude subscription (Task tool) or external API (MCP)
 */
export function isTaskAgent(agent: AgentDefinition): boolean {
  return agent.executionMode === "task";
}

export function isMcpAgent(agent: AgentDefinition): boolean {
  return agent.executionMode === "mcp";
}
