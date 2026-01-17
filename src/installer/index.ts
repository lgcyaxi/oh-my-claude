/**
 * CLI installer for oh-my-claude
 *
 * Installs:
 * - Agent .md files to ~/.claude/agents/
 * - Slash commands to ~/.claude/commands/
 * - Hook scripts to ~/.claude/oh-my-claude/hooks/
 * - MCP server configuration to ~/.claude/settings.json
 * - Default configuration to ~/.claude/oh-my-claude.json
 */

import { existsSync, mkdirSync, writeFileSync, copyFileSync, cpSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

/**
 * Get the package root directory
 * Works correctly whether running from source or bundled npm package
 */
function getPackageRoot(): string {
  // Use import.meta.url to get the current file's URL
  // This works correctly in both ESM and bundled code
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);

  // Debug: show where we're looking
  const debug = process.env.DEBUG_INSTALL === "1";
  if (debug) {
    console.log(`[DEBUG] import.meta.url: ${import.meta.url}`);
    console.log(`[DEBUG] currentFile: ${currentFile}`);
    console.log(`[DEBUG] currentDir: ${currentDir}`);
  }

  // When running from dist/cli.js, go up one level to package root
  // When running from src/installer/index.ts, go up two levels
  // Check which one contains package.json
  let root = dirname(currentDir); // Try one level up (dist -> root)
  if (debug) console.log(`[DEBUG] Trying root (1 up): ${root}, has package.json: ${existsSync(join(root, "package.json"))}`);

  if (!existsSync(join(root, "package.json"))) {
    root = dirname(root); // Try two levels up (src/installer -> src -> root)
    if (debug) console.log(`[DEBUG] Trying root (2 up): ${root}, has package.json: ${existsSync(join(root, "package.json"))}`);
  }
  if (!existsSync(join(root, "package.json"))) {
    root = dirname(root); // Try three levels up (for deeply nested)
    if (debug) console.log(`[DEBUG] Trying root (3 up): ${root}, has package.json: ${existsSync(join(root, "package.json"))}`);
  }

  if (debug) console.log(`[DEBUG] Final root: ${root}`);
  return root;
}

import { generateAllAgentFiles, removeAgentFiles } from "../generators/agent-generator";
import { installHooks, installMcpServer, installStatusLine, uninstallFromSettings, uninstallStatusLine } from "./settings-merger";
import { DEFAULT_CONFIG } from "../config/schema";

/**
 * Get commands directory
 */
export function getCommandsDir(): string {
  return join(homedir(), ".claude", "commands");
}

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

/**
 * Get statusline script path
 */
export function getStatusLineScriptPath(): string {
  return join(getInstallDir(), "dist", "statusline", "statusline.js");
}

export interface InstallResult {
  success: boolean;
  agents: { generated: string[]; skipped: string[] };
  commands: { installed: string[]; skipped: string[] };
  hooks: { installed: string[]; updated: string[]; skipped: string[] };
  mcp: { installed: boolean; updated: boolean };
  statusLine: { installed: boolean; wrapperCreated: boolean; updated: boolean };
  config: { created: boolean };
  errors: string[];
}

/**
 * Install oh-my-claude
 */
export async function install(options?: {
  /** Skip agent file generation */
  skipAgents?: boolean;
  /** Skip commands installation */
  skipCommands?: boolean;
  /** Skip hooks installation */
  skipHooks?: boolean;
  /** Skip MCP server installation */
  skipMcp?: boolean;
  /** Skip statusline installation */
  skipStatusLine?: boolean;
  /** Force overwrite existing files */
  force?: boolean;
  /** Source directory (for built files) */
  sourceDir?: string;
}): Promise<InstallResult> {
  const result: InstallResult = {
    success: true,
    agents: { generated: [], skipped: [] },
    commands: { installed: [], skipped: [] },
    hooks: { installed: [], updated: [], skipped: [] },
    mcp: { installed: false, updated: false },
    statusLine: { installed: false, wrapperCreated: false, updated: false },
    config: { created: false },
    errors: [],
  };

  const installDir = getInstallDir();
  const hooksDir = getHooksDir();
  const sourceDir = options?.sourceDir ?? getPackageRoot(); // Use package root detection

  // Debug output
  const debug = process.env.DEBUG_INSTALL === "1";
  if (debug) {
    console.log(`[DEBUG] installDir: ${installDir}`);
    console.log(`[DEBUG] sourceDir: ${sourceDir}`);
    console.log(`[DEBUG] src/commands exists: ${existsSync(join(sourceDir, "src", "commands"))}`);
    console.log(`[DEBUG] dist/hooks exists: ${existsSync(join(sourceDir, "dist", "hooks"))}`);
    console.log(`[DEBUG] dist/mcp exists: ${existsSync(join(sourceDir, "dist", "mcp"))}`);
    console.log(`[DEBUG] dist/statusline exists: ${existsSync(join(sourceDir, "dist", "statusline"))}`);
  }

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

    // 2. Install slash commands
    if (!options?.skipCommands) {
      try {
        const commandsDir = getCommandsDir();
        if (!existsSync(commandsDir)) {
          mkdirSync(commandsDir, { recursive: true });
        }

        // Copy command files from src/commands/
        const srcCommandsDir = join(sourceDir, "src", "commands");
        if (existsSync(srcCommandsDir)) {
          const commandFiles = readdirSync(srcCommandsDir).filter(f => f.endsWith(".md"));
          for (const file of commandFiles) {
            const srcPath = join(srcCommandsDir, file);
            const destPath = join(commandsDir, file);
            if (!existsSync(destPath) || options?.force) {
              copyFileSync(srcPath, destPath);
              result.commands.installed.push(file.replace(".md", ""));
            } else {
              result.commands.skipped.push(file.replace(".md", ""));
            }
          }
        } else {
          result.errors.push(`Commands source directory not found: ${srcCommandsDir}`);
        }
      } catch (error) {
        result.errors.push(`Failed to install commands: ${error}`);
      }
    }

    // 3. Install hooks
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
        result.hooks = installHooks(hooksDir, options?.force);
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
        const mcpResult = installMcpServer(mcpServerPath, options?.force);
        result.mcp.installed = mcpResult ?? false;
        // Track if it was an update (already existed but force was used)
        result.mcp.updated = mcpResult && options?.force ? true : false;
      } catch (error) {
        result.errors.push(`Failed to install MCP server: ${error}`);
      }
    }

    // 4. Install statusline
    if (!options?.skipStatusLine) {
      try {
        const statusLineDir = join(installDir, "dist", "statusline");
        if (!existsSync(statusLineDir)) {
          mkdirSync(statusLineDir, { recursive: true });
        }

        // Copy statusline script (assuming it's built to dist/statusline/)
        const builtStatusLineDir = join(sourceDir, "dist", "statusline");
        if (existsSync(builtStatusLineDir)) {
          cpSync(builtStatusLineDir, statusLineDir, { recursive: true });
        }

        // Install statusline into settings.json
        const statusLineResult = installStatusLine(getStatusLineScriptPath(), options?.force);
        result.statusLine.installed = statusLineResult.installed;
        result.statusLine.wrapperCreated = statusLineResult.wrapperCreated;
        result.statusLine.updated = statusLineResult.updated;
      } catch (error) {
        result.errors.push(`Failed to install statusline: ${error}`);
      }
    }

    // 5. Create default config if not exists
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
  commands: string[];
  hooks: string[];
  mcp: boolean;
  statusLine: boolean;
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
    commands: [],
    hooks: [],
    mcp: false,
    statusLine: false,
    errors: [],
  };

  try {
    // 1. Remove agent files
    try {
      result.agents = removeAgentFiles();
    } catch (error) {
      result.errors.push(`Failed to remove agents: ${error}`);
    }

    // 2. Remove command files
    try {
      const commandsDir = getCommandsDir();
      if (existsSync(commandsDir)) {
        const ourCommands = [
          // Agent commands (omc-)
          "omc-sisyphus",
          "omc-oracle",
          "omc-librarian",
          "omc-reviewer",
          "omc-scout",
          "omc-explore",
          "omc-plan",
          "omc-start-work",
          "omc-status",
          // Quick action commands (omcx-)
          "omcx-commit",
          "omcx-implement",
          "omcx-refactor",
          "omcx-docs",
          "omcx-issue",
        ];
        const { unlinkSync } = require("node:fs");
        for (const cmd of ourCommands) {
          const cmdPath = join(commandsDir, `${cmd}.md`);
          if (existsSync(cmdPath)) {
            unlinkSync(cmdPath);
            result.commands.push(cmd);
          }
        }
      }
    } catch (error) {
      result.errors.push(`Failed to remove commands: ${error}`);
    }

    // 3. Remove from settings.json
    try {
      const { removedHooks, removedMcp } = uninstallFromSettings();
      result.hooks = removedHooks;
      result.mcp = removedMcp;
    } catch (error) {
      result.errors.push(`Failed to update settings: ${error}`);
    }

    // 4. Remove statusline
    try {
      result.statusLine = uninstallStatusLine();
    } catch (error) {
      result.errors.push(`Failed to remove statusline: ${error}`);
    }

    // 5. Remove installation directory
    const installDir = getInstallDir();
    if (existsSync(installDir)) {
      try {
        const { rmSync } = require("node:fs");
        rmSync(installDir, { recursive: true });
      } catch (error) {
        result.errors.push(`Failed to remove installation directory: ${error}`);
      }
    }

    // 6. Remove config (unless keepConfig)
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
    statusLine: boolean;
    config: boolean;
  };
} {
  const installDir = getInstallDir();
  const hooksDir = getHooksDir();
  const mcpServerPath = getMcpServerPath();
  const statusLineScriptPath = getStatusLineScriptPath();
  const configPath = getConfigPath();

  // Check if statusline is configured in settings
  const { isStatusLineConfigured } = require("./statusline-merger");

  return {
    installed:
      existsSync(installDir) &&
      existsSync(hooksDir) &&
      existsSync(mcpServerPath),
    components: {
      agents: existsSync(join(homedir(), ".claude", "agents", "sisyphus.md")),
      hooks: existsSync(join(hooksDir, "comment-checker.js")),
      mcp: existsSync(mcpServerPath),
      statusLine: existsSync(statusLineScriptPath) && isStatusLineConfigured(),
      config: existsSync(configPath),
    },
  };
}
