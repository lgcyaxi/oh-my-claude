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
  /** Whether this agent runs via Claude subscription (Task tool) or MCP (async) */
  executionMode: "task" | "mcp";
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

/**
 * Generate Claude Code agent .md file content
 */
export function generateAgentMarkdown(
  agent: AgentDefinition,
  options?: AgentMarkdownOptions
): string {
  const lines: string[] = [];

  // Note: Claude Code agent files don't have YAML frontmatter
  // They're just markdown files with the prompt content
  // The filename becomes the agent name (e.g., sisyphus.md -> @sisyphus)

  lines.push(`# ${agent.name}`);
  lines.push("");
  lines.push(`> ${agent.description}`);
  lines.push("");
  lines.push(agent.prompt);

  return lines.join("\n");
}
