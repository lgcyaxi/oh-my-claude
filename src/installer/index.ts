/**
 * CLI installer for oh-my-claude
 *
 * Installs:
 * - Agent .md files to ~/.claude/agents/
 * - Hook scripts to ~/.claude/oh-my-claude/hooks/
 * - MCP server configuration to ~/.claude/settings.json
 * - Default configuration to ~/.claude/oh-my-claude.json
 */

import { existsSync, mkdirSync, writeFileSync, copyFileSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

import { generateAllAgentFiles, removeAgentFiles } from "../generators/agent-generator";
import { installHooks, installMcpServer, uninstallFromSettings } from "./settings-merger";
import { DEFAULT_CONFIG } from "../config/schema";

/**
 * Get oh-my-claude installation directory
 */
export function getInstallDir(): string {
  return join(homedir(), ".claude", "oh-my-claude");
}

/**
 * Get hooks directory
 */
export function getHooksDir(): string {
  return join(getInstallDir(), "hooks");
}

/**
 * Get MCP server path
 */
export function getMcpServerPath(): string {
  return join(getInstallDir(), "mcp", "server.js");
}

/**
 * Get config file path
 */
export function getConfigPath(): string {
  return join(homedir(), ".claude", "oh-my-claude.json");
}

export interface InstallResult {
  success: boolean;
  agents: { generated: string[]; skipped: string[] };
  hooks: { installed: string[]; skipped: string[] };
  mcp: { installed: boolean };
  config: { created: boolean };
  errors: string[];
}

/**
 * Install oh-my-claude
 */
export async function install(options?: {
  /** Skip agent file generation */
  skipAgents?: boolean;
  /** Skip hooks installation */
  skipHooks?: boolean;
  /** Skip MCP server installation */
  skipMcp?: boolean;
  /** Force overwrite existing files */
  force?: boolean;
  /** Source directory (for built files) */
  sourceDir?: string;
}): Promise<InstallResult> {
  const result: InstallResult = {
    success: true,
    agents: { generated: [], skipped: [] },
    hooks: { installed: [], skipped: [] },
    mcp: { installed: false },
    config: { created: false },
    errors: [],
  };

  const installDir = getInstallDir();
  const hooksDir = getHooksDir();
  const sourceDir = options?.sourceDir ?? dirname(dirname(__dirname)); // Default to project root

  try {
    // Create installation directory
    if (!existsSync(installDir)) {
      mkdirSync(installDir, { recursive: true });
    }

    // 1. Generate agent files
    if (!options?.skipAgents) {
      try {
        result.agents = generateAllAgentFiles();
      } catch (error) {
        result.errors.push(`Failed to generate agents: ${error}`);
      }
    }

    // 2. Install hooks
    if (!options?.skipHooks) {
      try {
        // Create hooks directory
        if (!existsSync(hooksDir)) {
          mkdirSync(hooksDir, { recursive: true });
        }

        // Copy hook scripts (assuming they're built to dist/hooks/)
        const builtHooksDir = join(sourceDir, "dist", "hooks");
        if (existsSync(builtHooksDir)) {
          cpSync(builtHooksDir, hooksDir, { recursive: true });
        } else {
          // If not built, write placeholder scripts
          writeFileSync(
            join(hooksDir, "comment-checker.js"),
            `#!/usr/bin/env node
// oh-my-claude comment-checker hook
// Run 'npm run build' in oh-my-claude to generate full implementation
console.log(JSON.stringify({ decision: "approve" }));
`,
            { mode: 0o755 }
          );

          writeFileSync(
            join(hooksDir, "todo-continuation.js"),
            `#!/usr/bin/env node
// oh-my-claude todo-continuation hook
// Run 'npm run build' in oh-my-claude to generate full implementation
console.log(JSON.stringify({ decision: "approve" }));
`,
            { mode: 0o755 }
          );
        }

        // Install hooks into settings.json
        result.hooks = installHooks(hooksDir);
      } catch (error) {
        result.errors.push(`Failed to install hooks: ${error}`);
      }
    }

    // 3. Install MCP server
    if (!options?.skipMcp) {
      try {
        const mcpDir = join(installDir, "mcp");
        if (!existsSync(mcpDir)) {
          mkdirSync(mcpDir, { recursive: true });
        }

        // Copy MCP server (assuming it's built to dist/mcp/)
        const builtMcpDir = join(sourceDir, "dist", "mcp");
        const mcpServerPath = getMcpServerPath();

        if (existsSync(builtMcpDir)) {
          cpSync(builtMcpDir, mcpDir, { recursive: true });
        } else {
          // If not built, write placeholder
          writeFileSync(
            mcpServerPath,
            `#!/usr/bin/env node
// oh-my-claude MCP server placeholder
// Run 'npm run build:mcp' in oh-my-claude to generate full implementation
console.error("oh-my-claude MCP server not built. Run 'npm run build:mcp' first.");
process.exit(1);
`,
            { mode: 0o755 }
          );
        }

        // Install MCP server into settings.json
        result.mcp.installed = installMcpServer(mcpServerPath);
      } catch (error) {
        result.errors.push(`Failed to install MCP server: ${error}`);
      }
    }

    // 4. Create default config if not exists
    const configPath = getConfigPath();
    if (!existsSync(configPath) || options?.force) {
      try {
        writeFileSync(
          configPath,
          JSON.stringify(DEFAULT_CONFIG, null, 2),
          "utf-8"
        );
        result.config.created = true;
      } catch (error) {
        result.errors.push(`Failed to create config: ${error}`);
      }
    }

    result.success = result.errors.length === 0;
  } catch (error) {
    result.success = false;
    result.errors.push(`Installation failed: ${error}`);
  }

  return result;
}

export interface UninstallResult {
  success: boolean;
  agents: string[];
  hooks: string[];
  mcp: boolean;
  errors: string[];
}

/**
 * Uninstall oh-my-claude
 */
export async function uninstall(options?: {
  /** Keep configuration file */
  keepConfig?: boolean;
}): Promise<UninstallResult> {
  const result: UninstallResult = {
    success: true,
    agents: [],
    hooks: [],
    mcp: false,
    errors: [],
  };

  try {
    // 1. Remove agent files
    try {
      result.agents = removeAgentFiles();
    } catch (error) {
      result.errors.push(`Failed to remove agents: ${error}`);
    }

    // 2. Remove from settings.json
    try {
      const { removedHooks, removedMcp } = uninstallFromSettings();
      result.hooks = removedHooks;
      result.mcp = removedMcp;
    } catch (error) {
      result.errors.push(`Failed to update settings: ${error}`);
    }

    // 3. Remove installation directory
    const installDir = getInstallDir();
    if (existsSync(installDir)) {
      try {
        const { rmSync } = require("node:fs");
        rmSync(installDir, { recursive: true });
      } catch (error) {
        result.errors.push(`Failed to remove installation directory: ${error}`);
      }
    }

    // 4. Remove config (unless keepConfig)
    if (!options?.keepConfig) {
      const configPath = getConfigPath();
      if (existsSync(configPath)) {
        try {
          const { unlinkSync } = require("node:fs");
          unlinkSync(configPath);
        } catch (error) {
          result.errors.push(`Failed to remove config: ${error}`);
        }
      }
    }

    result.success = result.errors.length === 0;
  } catch (error) {
    result.success = false;
    result.errors.push(`Uninstallation failed: ${error}`);
  }

  return result;
}

/**
 * Check installation status
 */
export function checkInstallation(): {
  installed: boolean;
  components: {
    agents: boolean;
    hooks: boolean;
    mcp: boolean;
    config: boolean;
  };
} {
  const installDir = getInstallDir();
  const hooksDir = getHooksDir();
  const mcpServerPath = getMcpServerPath();
  const configPath = getConfigPath();

  return {
    installed:
      existsSync(installDir) &&
      existsSync(hooksDir) &&
      existsSync(mcpServerPath),
    components: {
      agents: existsSync(join(homedir(), ".claude", "agents", "sisyphus.md")),
      hooks: existsSync(join(hooksDir, "comment-checker.js")),
      mcp: existsSync(mcpServerPath),
      config: existsSync(configPath),
    },
  };
}
