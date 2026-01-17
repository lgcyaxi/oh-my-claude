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
 * Generate agent markdown content for Claude Code
 *
 * Note: Claude Code agent files are simple markdown files.
 * The filename (without .md) becomes the agent name.
 * Task tool can reference these agents via subagent_type parameter.
 */
export function generateAgentMarkdown(agent: AgentDefinition): string {
  const lines: string[] = [];

  // Header with agent name and description
  lines.push(`# ${agent.name}`);
  lines.push("");
  lines.push(`> ${agent.description}`);
  lines.push("");

  // Execution mode note
  if (agent.executionMode === "task") {
    lines.push(
      `<!-- Execution: Claude Code Task tool (sync) - Uses Claude subscription -->`
    );
  } else {
    lines.push(
      `<!-- Execution: oh-my-claude MCP server (async) - Uses ${agent.defaultProvider} API -->`
    );
  }
  lines.push("");

  // The actual prompt
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
