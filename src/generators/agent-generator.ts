/**
 * Agent .md file generator for Claude Code
 *
 * Generates agent markdown files that can be installed to ~/.claude/agents/
 * These files define custom agents that can be invoked via @agent-name
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { AgentDefinition } from "../agents/types";
import { agents, taskAgents } from "../agents";
import { loadConfig, resolveProviderForAgent } from "../config";

/**
 * Get the Claude Code agents directory
 */
export function getAgentsDirectory(): string {
  return join(homedir(), ".claude", "agents");
}

/**
 * Escape YAML string values that may contain special characters
 */
function escapeYamlString(str: string): string {
  // If string contains special YAML characters, wrap in quotes
  if (/[:\{\}\[\],&*#?|\-<>=!%@`]/.test(str) || str.includes("\n")) {
    // Escape double quotes and wrap
    return `"${str.replace(/"/g, '\\"').replace(/\n/g, " ")}"`;
  }
  return str;
}

/**
 * Generate agent markdown content for Claude Code
 *
 * Claude Code agent files require YAML frontmatter with:
 * - name: agent identifier
 * - description: what the agent does
 * - tools: (optional) allowed tools for the agent
 *
 * The filename (without .md) is used for @agent-name invocation.
 * Task tool can reference these agents via subagent_type parameter.
 */
export function generateAgentMarkdown(agent: AgentDefinition): string {
  const lines: string[] = [];

  // YAML frontmatter (required by Claude Code)
  lines.push("---");
  lines.push(`name: ${agent.name.toLowerCase()}`);
  lines.push(`description: ${escapeYamlString(agent.description)}`);

  // All agents get full tool access — both Task and MCP agents can be spawned
  // via subagent_type in the Task tool, which needs all tools for implementation
  lines.push("tools: Read, Glob, Grep, Bash, Edit, Write, Task, WebFetch, WebSearch");

  lines.push("---");
  lines.push("");

  // The actual prompt content
  lines.push(agent.prompt);

  return lines.join("\n");
}

/**
 * Generate all agent files to the specified directory
 */
export function generateAllAgentFiles(
  outputDir?: string,
  options?: {
    /** Only generate Task tool agents (Claude subscription) */
    taskOnly?: boolean;
    /** Include execution mode comments */
    includeComments?: boolean;
  }
): { generated: string[]; skipped: string[] } {
  const dir = outputDir ?? getAgentsDirectory();
  const generated: string[] = [];
  const skipped: string[] = [];

  // Ensure directory exists
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Get agents to generate
  const agentsToGenerate = options?.taskOnly ? taskAgents : Object.values(agents);

  for (const agent of agentsToGenerate) {
    const filename = `${agent.name.toLowerCase()}.md`;
    const filepath = join(dir, filename);

    try {
      const content = generateAgentMarkdown(agent);
      writeFileSync(filepath, content, "utf-8");
      generated.push(filepath);
    } catch (error) {
      console.error(`Failed to generate ${filename}:`, error);
      skipped.push(filename);
    }
  }

  return { generated, skipped };
}

/**
 * Generate a single agent file
 */
export function generateAgentFile(
  agentName: string,
  outputDir?: string
): string | null {
  const agent = agents[agentName.toLowerCase()];
  if (!agent) {
    console.error(`Unknown agent: ${agentName}`);
    return null;
  }

  const dir = outputDir ?? getAgentsDirectory();

  // Ensure directory exists
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const filename = `${agent.name.toLowerCase()}.md`;
  const filepath = join(dir, filename);

  try {
    const content = generateAgentMarkdown(agent);
    writeFileSync(filepath, content, "utf-8");
    return filepath;
  } catch (error) {
    console.error(`Failed to generate ${filename}:`, error);
    return null;
  }
}

/**
 * Check which agents are installed
 */
export function getInstalledAgents(agentsDir?: string): string[] {
  const dir = agentsDir ?? getAgentsDirectory();
  if (!existsSync(dir)) {
    return [];
  }

  const installed: string[] = [];
  for (const agentName of Object.keys(agents)) {
    const filepath = join(dir, `${agentName.toLowerCase()}.md`);
    if (existsSync(filepath)) {
      installed.push(agentName);
    }
  }

  return installed;
}

/**
 * Remove all oh-my-claude agent files
 */
export function removeAgentFiles(agentsDir?: string): string[] {
  const dir = agentsDir ?? getAgentsDirectory();
  const removed: string[] = [];

  if (!existsSync(dir)) {
    return removed;
  }

  const { unlinkSync } = require("node:fs");

  for (const agentName of Object.keys(agents)) {
    const filepath = join(dir, `${agentName.toLowerCase()}.md`);
    if (existsSync(filepath)) {
      try {
        unlinkSync(filepath);
        removed.push(filepath);
      } catch (error) {
        console.error(`Failed to remove ${filepath}:`, error);
      }
    }
  }

  return removed;
}
