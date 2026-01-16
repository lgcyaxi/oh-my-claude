/**
 * Original agent type definitions (MIT Licensed)
 */

export type OriginalAgentExecutionMode = "task" | "mcp";

export interface OriginalAgentDefinition {
  name: string;
  description: string;
  provider: string;
  model: string;
  executionMode: OriginalAgentExecutionMode;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}
