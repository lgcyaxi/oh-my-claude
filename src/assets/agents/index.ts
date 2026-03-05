/**
 * Agent definitions for oh-my-claude
 *
 * Agents are organized by category:
 * - Native (Claude subscription, Task tool): sisyphus, claude-reviewer, claude-scout, prometheus, ui-designer
 * - Bridge (delegates to bridge workers): analyst, librarian, document-writer
 */

export * from "./types";

// Claude subscription agents (Task tool - sync)
export { sisyphusAgent } from "./sisyphus";
export { claudeReviewerAgent } from "./claude-reviewer";
export { claudeScoutAgent } from "./claude-scout";
export { prometheusAgent } from "./prometheus";

// Fallback agents (Task tool - when external CLI unavailable)
export { uiDesignerAgent } from "./ui-designer";

// Bridge agents (delegate to bridge workers)
export { analystAgent } from "./analyst";
export { librarianAgent } from "./librarian";
export { documentWriterAgent } from "./document-writer";

// Re-export individual agents
import { sisyphusAgent } from "./sisyphus";
import { claudeReviewerAgent } from "./claude-reviewer";
import { claudeScoutAgent } from "./claude-scout";
import { prometheusAgent } from "./prometheus";
import { uiDesignerAgent } from "./ui-designer";
import { analystAgent } from "./analyst";
import { librarianAgent } from "./librarian";
import { documentWriterAgent } from "./document-writer";
import type { AgentDefinition, WorkerRole } from "./types";

/**
 * All available agents
 */
export const agents: Record<string, AgentDefinition> = {
  // Claude subscription agents
  sisyphus: sisyphusAgent,
  "claude-reviewer": claudeReviewerAgent,
  "claude-scout": claudeScoutAgent,
  prometheus: prometheusAgent,

  // Fallback agents
  "ui-designer": uiDesignerAgent,

  // Bridge agents
  analyst: analystAgent,
  librarian: librarianAgent,
  "document-writer": documentWriterAgent,
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
];

/**
 * Bridge agents that delegate to bridge workers
 */
export const bridgeAgents = [
  analystAgent,
  librarianAgent,
  documentWriterAgent,
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
];

/**
 * Check if agent uses Claude subscription (Task tool)
 */
export function isTaskAgent(agent: AgentDefinition): boolean {
  return agent.executionMode === "task";
}

export function resolveAgentWorker(agent: AgentDefinition): string | undefined {
  if (!agent.category.includes("bridge") || !agent.bridgeRole) return undefined;
  const roleToWorker: Record<WorkerRole, string> = {
    code: "cc:glm", audit: "codex", docs: "cc:mm", design: "cc:kimi", general: "cc:glm",
  };
  return roleToWorker[agent.bridgeRole];
}
