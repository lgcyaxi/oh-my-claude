/**
 * CLI installer for oh-my-claude
 *
 * Installs:
 * - Agent .md files to ~/.claude/agents/
 * - Slash commands to ~/.claude/commands/
 * - Hook scripts to ~/.claude/oh-my-claude/hooks/
 * - Scripts to ~/.claude/oh-my-claude/scripts/ (for auth login scripts)
 * - MCP server configuration to ~/.claude/settings.json
 * - Default configuration to ~/.claude/oh-my-claude.json
 */

import { existsSync, mkdirSync, writeFileSync, copyFileSync, cpSync, readdirSync, statSync, unlinkSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

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
import { ensureConfigExists as ensureStatusLineConfigExists } from "../statusline/config";
import { deployBuiltInStyles } from "../styles";
import { ensureMemoryDirs } from "../memory";

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
  commands: { installed: string[]; skipped: string[]; removed: string[] };
  hooks: { installed: string[]; updated: string[]; skipped: string[] };
  mcp: { installed: boolean; updated: boolean };
  statusLine: {
    installed: boolean;
    wrapperCreated: boolean;
    updated: boolean;
    configCreated: boolean;
    validation?: {
      valid: boolean;
      errors: string[];
      warnings: string[];
    };
  };
  styles: { deployed: string[]; skipped: string[] };
  config: { created: boolean };
  errors: string[];
  warnings: string[];
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
    commands: { installed: [], skipped: [], removed: [] },
    hooks: { installed: [], updated: [], skipped: [] },
    mcp: { installed: false, updated: false },
    statusLine: { installed: false, wrapperCreated: false, updated: false, configCreated: false },
    styles: { deployed: [], skipped: [] },
    config: { created: false },
    errors: [],
    warnings: [],
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
    // Always update our command files - they're managed by oh-my-claude
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
            const wasExisting = existsSync(destPath);
            // Always copy our command files (they're ours, we should update them)
            copyFileSync(srcPath, destPath);
            if (wasExisting) {
              result.commands.installed.push(`${file.replace(".md", "")} (updated)`);
            } else {
              result.commands.installed.push(file.replace(".md", ""));
            }
          }

          // Clean up deprecated/renamed command files
          const deprecatedCommands = [
            "omc-compact.md",   // renamed → omc-mem-compact.md
            "omc-clear.md",     // renamed → omc-mem-clear.md
            "omc-summary.md",   // renamed → omc-mem-summary.md
            "ulw.md",           // renamed → omc-ulw.md
            "omc-team.md",      // removed — use native Agent Teams
          ];
          for (const deprecated of deprecatedCommands) {
            const oldPath = join(commandsDir, deprecated);
            if (existsSync(oldPath)) {
              try {
                unlinkSync(oldPath);
                result.commands.removed.push(deprecated.replace(".md", ""));
              } catch {
                // Best-effort cleanup
              }
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

    // 3b. Install scripts (for auth login scripts, etc.)
    try {
      const scriptsDir = join(installDir, "scripts");
      if (!existsSync(scriptsDir)) {
        mkdirSync(scriptsDir, { recursive: true });
      }

      // Copy scripts from source (directly from scripts/ since these are source files)
      const sourceScriptsDir = join(sourceDir, "scripts");
      if (existsSync(sourceScriptsDir)) {
        cpSync(sourceScriptsDir, scriptsDir, { recursive: true });
      }
    } catch (error) {
      result.errors.push(`Failed to install scripts: ${error}`);
    }

    // 3c. Install node_modules (for playwright and other runtime deps)
    try {
      const sourceNodeModules = join(sourceDir, "node_modules", "playwright");
      const targetNodeModules = join(installDir, "node_modules", "playwright");

      if (existsSync(sourceNodeModules)) {
        if (!existsSync(join(installDir, "node_modules"))) {
          mkdirSync(join(installDir, "node_modules"), { recursive: true });
        }
        cpSync(sourceNodeModules, targetNodeModules, { recursive: true });
      }
    } catch (error) {
      result.errors.push(`Failed to install node_modules: ${error}`);
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

        // Track if this is a file update (binary changed on disk)
        let binaryUpdated = false;

        if (existsSync(builtMcpDir)) {
          // Check if the binary is being updated (different size or new)
          const builtServerPath = join(builtMcpDir, "server.js");
          if (existsSync(builtServerPath) && existsSync(mcpServerPath)) {
            const builtSize = statSync(builtServerPath).size;
            const installedSize = statSync(mcpServerPath).size;
            binaryUpdated = builtSize !== installedSize;
          } else if (existsSync(builtServerPath)) {
            binaryUpdated = true; // First install
          }

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
        // Track if it was an update (binary changed or force reinstall)
        result.mcp.updated = binaryUpdated || (mcpResult && options?.force ? true : false);

        // Warn user if binary was updated but MCP server is likely still running old code
        if (binaryUpdated && !options?.force) {
          result.warnings.push("MCP server binary updated. Restart Claude Code to load new features.");
        }
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

        // Create default statusline segment config (full preset for maximum visibility)
        // This now returns a boolean indicating success
        result.statusLine.configCreated = ensureStatusLineConfigExists("full");
        if (!result.statusLine.configCreated) {
          result.warnings.push("Failed to create statusline config file. Statusline may not work correctly.");
        }

        // Validate statusline setup
        const { validateStatusLineSetup } = require("./statusline-merger");
        const validation = validateStatusLineSetup();
        result.statusLine.validation = {
          valid: validation.valid,
          errors: validation.errors,
          warnings: validation.warnings,
        };

        // Add validation errors/warnings to main result
        if (!validation.valid) {
          for (const err of validation.errors) {
            result.warnings.push(`[statusline] ${err}`);
          }
        }
        for (const warn of validation.warnings) {
          result.warnings.push(`[statusline] ${warn}`);
        }

        if (debug && !validation.valid) {
          console.log(`[DEBUG] Statusline validation failed:`);
          console.log(`[DEBUG]   Script exists: ${validation.details.scriptExists}`);
          console.log(`[DEBUG]   Node path valid: ${validation.details.nodePathValid}`);
          console.log(`[DEBUG]   Settings configured: ${validation.details.settingsConfigured}`);
          console.log(`[DEBUG]   Command works: ${validation.details.commandWorks}`);
        }
      } catch (error) {
        result.errors.push(`Failed to install statusline: ${error}`);
      }
    }

    // 4a2. Install CLI dist (keeps ~/.claude/oh-my-claude/dist/cli.js current)
    try {
      const cliDistDir = join(installDir, "dist");
      if (!existsSync(cliDistDir)) {
        mkdirSync(cliDistDir, { recursive: true });
      }

      const builtCliPath = join(sourceDir, "dist", "cli.js");
      const installedCliPath = join(cliDistDir, "cli.js");
      if (existsSync(builtCliPath)) {
        copyFileSync(builtCliPath, installedCliPath);
      }

      // Also copy index.js (library entry point)
      const builtIndexPath = join(sourceDir, "dist", "index.js");
      const installedIndexPath = join(cliDistDir, "index.js");
      if (existsSync(builtIndexPath)) {
        copyFileSync(builtIndexPath, installedIndexPath);
      }

      // Copy WASM assets
      const distDir = join(sourceDir, "dist");
      if (existsSync(distDir)) {
        for (const file of readdirSync(distDir)) {
          if (file.endsWith(".wasm")) {
            copyFileSync(join(distDir, file), join(cliDistDir, file));
          }
        }
      }
    } catch (error) {
      // Non-critical — CLI is served from npm global symlink primarily
      if (debug) console.log(`[DEBUG] Failed to install CLI dist: ${error}`);
    }

    // 4b. Install proxy server
    try {
      const proxyDir = join(installDir, "dist", "proxy");
      if (!existsSync(proxyDir)) {
        mkdirSync(proxyDir, { recursive: true });
      }

      const builtProxyDir = join(sourceDir, "dist", "proxy");
      if (existsSync(builtProxyDir)) {
        cpSync(builtProxyDir, proxyDir, { recursive: true });
      }
    } catch (error) {
      // Non-critical — proxy is opt-in
      if (debug) console.log(`[DEBUG] Failed to install proxy: ${error}`);
    }

    // 4c. Install menubar app (Tauri app source for dev mode or building)
    try {
      const menubarDir = join(installDir, "apps", "menubar");

      // Clean stale source files (preserve node_modules and target to avoid re-download/rebuild)
      if (existsSync(menubarDir)) {
        for (const entry of readdirSync(menubarDir)) {
          if (entry === "node_modules" || entry === "target") continue;
          rmSync(join(menubarDir, entry), { recursive: true, force: true });
        }
      } else {
        mkdirSync(menubarDir, { recursive: true });
      }

      const srcMenubarDir = join(sourceDir, "apps", "menubar");
      if (existsSync(srcMenubarDir)) {
        // Copy everything except node_modules and target (build artifacts)
        cpSync(srcMenubarDir, menubarDir, {
          recursive: true,
          filter: (src) => {
            const basename = src.split(/[/\\]/).pop();
            return basename !== "node_modules" && basename !== "target";
          }
        });

        // Install dependencies if package.json exists
        const menubarPkgJson = join(menubarDir, "package.json");
        if (existsSync(menubarPkgJson)) {
          try {
            execSync("bun install", {
              cwd: menubarDir,
              stdio: debug ? "inherit" : "pipe",
            });
          } catch (installError) {
            // Non-critical — user can install manually
            if (debug) console.log(`[DEBUG] Failed to install menubar deps: ${installError}`);
          }
        }
      }
    } catch (error) {
      // Non-critical — menubar is opt-in
      if (debug) console.log(`[DEBUG] Failed to install menubar app: ${error}`);
    }

    // 4c. Clean up removed team templates (deprecated in v2.1)
    try {
      const teamsDir = join(installDir, "teams");
      if (existsSync(teamsDir)) {
        rmSync(teamsDir, { recursive: true, force: true });
      }
    } catch (error) {
      // Best-effort cleanup
      if (debug) console.log(`[DEBUG] Failed to clean up team templates: ${error}`);
    }

    // 5. Deploy output style presets
    try {
      result.styles = deployBuiltInStyles(sourceDir);
    } catch (error) {
      result.errors.push(`Failed to deploy output styles: ${error}`);
    }

    // 5b. Create memory directories
    try {
      ensureMemoryDirs();
    } catch (error) {
      result.errors.push(`Failed to create memory directories: ${error}`);
    }

    // 6. Copy package.json for version detection
    try {
      const srcPkgPath = join(sourceDir, "package.json");
      const destPkgPath = join(installDir, "package.json");
      if (existsSync(srcPkgPath)) {
        copyFileSync(srcPkgPath, destPkgPath);
      }
    } catch (error) {
      // Non-critical error, just log
      if (debug) console.log(`[DEBUG] Failed to copy package.json: ${error}`);
    }

    // 6b. Check if installing from git dev branch and create beta marker
    try {
      const gitDir = join(sourceDir, ".git");
      if (existsSync(gitDir)) {
        // Get current branch
        const branch = execSync("git rev-parse --abbrev-ref HEAD", {
          cwd: sourceDir,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        }).trim();

        // If on dev branch, create beta channel marker
        if (branch === "dev") {
          const ref = execSync("git rev-parse --short HEAD", {
            cwd: sourceDir,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          }).trim();

          const { setBetaChannelInfo } = require("./beta-channel");
          setBetaChannelInfo({
            ref,
            branch: "dev",
            installedAt: new Date().toISOString(),
          });
          if (debug) console.log(`[DEBUG] Created beta channel marker: dev @ ${ref}`);
        } else {
          // Not on dev branch, clear any existing beta marker
          const { clearBetaChannel } = require("./beta-channel");
          clearBetaChannel();
        }
      }
    } catch (error) {
      // Not in a git repo or git not available, ignore
      if (debug) console.log(`[DEBUG] Git check failed: ${error}`);
    }

    // 7. Create default config if not exists
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
          "omc-switch",
          "omc-mem-compact",
          "omc-mem-clear",
          "omc-mem-summary",
          "omc-ulw",
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
