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
  /** Default provider (from config) */
  defaultProvider: string;
  /** Default model */
  defaultModel: string;
  /** Default temperature */
  defaultTemperature?: number;
  /** Whether this agent runs via Claude subscription (Task tool) */
  executionMode: "task";
  /** Agent categories: native (Claude subscription Task tool), proxy (external APIs via MCP), bridge (delegates to bridge workers). Agents can belong to multiple. */
  category: ("native" | "proxy" | "bridge")[];
  /** Bridge worker role for bridge agents */
  bridgeRole?: WorkerRole;
  /** Tools this agent should NOT use (restrictions) */
  restrictedTools?: string[];
}

export interface AgentMarkdownOptions {
  /** Override provider from config */
  provider?: string;
  /** Override model from config */
  model?: string;
  /** Override temperature */
  temperature?: number;
}

export type WorkerRole = "code" | "audit" | "docs" | "design" | "general";

export interface BridgeWorkerDefinition {
  name: string;
  switchAlias: string;
  role: WorkerRole;
  taskCategories: string[];
  label: string;
}

/**
 * Escape YAML string values that may contain special characters
 */
function escapeYamlString(str: string): string {
  if (/[:\{\}\[\],&*#?|\-<>=!%@`]/.test(str) || str.includes("\n")) {
    return `"${str.replace(/"/g, '\\"').replace(/\n/g, " ")}"`;
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
  options?: AgentMarkdownOptions
): string {
  const lines: string[] = [];

  // YAML frontmatter (required by Claude Code)
  lines.push("---");
  lines.push(`name: ${agent.name.toLowerCase()}`);
  lines.push(`description: ${escapeYamlString(agent.description)}`);

  // Add tools based on execution mode
  if (agent.executionMode === "task") {
    lines.push("tools: Read, Glob, Grep, Bash, Edit, Write, Task, WebFetch, WebSearch");
  } else {
    lines.push("tools: Read, Glob, Grep, Bash, Edit, Write");
  }

  lines.push("---");
  lines.push("");
  lines.push(agent.prompt);

  return lines.join("\n");
}
