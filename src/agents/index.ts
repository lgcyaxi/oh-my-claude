/**
 * Agent definitions for oh-my-claude
 *
 * Agents are organized by execution mode:
 * - Task tool agents (Claude subscription): sisyphus, claude-reviewer, claude-scout
 * - MCP background agents (external APIs): oracle, analyst, librarian, document-writer
 * - External CLI agents (task mode): opencode, codex-cli
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

// External CLI agents (Task tool - external CLI tools)
export { opencodeAgent } from "./opencode";
export { codexCliAgent } from "./codex-cli";

// Fallback agents (Task tool - when external CLI unavailable)
export { uiDesignerAgent } from "./ui-designer";

// MCP background agents (async - external APIs)
export { oracleAgent } from "./oracle";
export { librarianAgent } from "./librarian";
export { analystAgent } from "./analyst";
export { documentWriterAgent } from "./document-writer";
export { navigatorAgent } from "./navigator";
export { hephaestusAgent } from "./hephaestus";

// Re-export individual agents
import { sisyphusAgent } from "./sisyphus";
import { claudeReviewerAgent } from "./claude-reviewer";
import { claudeScoutAgent } from "./claude-scout";
import { prometheusAgent } from "./prometheus";
import { opencodeAgent } from "./opencode";
import { codexCliAgent } from "./codex-cli";
import { uiDesignerAgent } from "./ui-designer";
import { oracleAgent } from "./oracle";
import { librarianAgent } from "./librarian";
import { analystAgent } from "./analyst";
import { documentWriterAgent } from "./document-writer";
import { navigatorAgent } from "./navigator";
import { hephaestusAgent } from "./hephaestus";
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

  // External CLI agents
  opencode: opencodeAgent,
  "codex-cli": codexCliAgent,

  // Fallback agents
  "ui-designer": uiDesignerAgent,

  // MCP background agents
  oracle: oracleAgent,
  analyst: analystAgent,
  librarian: librarianAgent,
  "document-writer": documentWriterAgent,
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
  opencodeAgent,
  codexCliAgent,
  uiDesignerAgent,
];

/**
 * Agents that run via MCP background server (async, uses external APIs)
 */
export const mcpAgents = [
  oracleAgent,
  analystAgent,
  librarianAgent,
  documentWriterAgent,
  navigatorAgent,
  hephaestusAgent,
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
