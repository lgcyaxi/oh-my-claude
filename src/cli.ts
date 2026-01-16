#!/usr/bin/env node
/**
 * oh-my-claude CLI
 *
 * Usage:
 *   npx oh-my-claude install     # Install oh-my-claude
 *   npx oh-my-claude uninstall   # Uninstall oh-my-claude
 *   npx oh-my-claude status      # Check installation status
 *   npx oh-my-claude doctor      # Diagnose configuration issues
 *   npx oh-my-claude update      # Update oh-my-claude to latest version
 *   npx oh-my-claude setup-mcp   # Install official MCP servers (MiniMax, GLM)
 */

import { program } from "commander";
import { install, uninstall, checkInstallation } from "./installer";
import { getProvidersStatus } from "./providers/router";
import { loadConfig } from "./config";

program
  .name("oh-my-claude")
  .description("Multi-agent orchestration plugin for Claude Code")
  .version("1.1.2");

// Install command
program
  .command("install")
  .description("Install oh-my-claude into Claude Code")
  .option("--skip-agents", "Skip agent file generation")
  .option("--skip-hooks", "Skip hooks installation")
  .option("--skip-mcp", "Skip MCP server installation")
  .option("--force", "Force overwrite existing files")
  .action(async (options) => {
    console.log("Installing oh-my-claude...\n");

    const result = await install({
      skipAgents: options.skipAgents,
      skipHooks: options.skipHooks,
      skipMcp: options.skipMcp,
      force: options.force,
    });

    // Report agents
    if (result.agents.generated.length > 0) {
      console.log("✓ Generated agent files:");
      for (const file of result.agents.generated) {
        console.log(`  - ${file}`);
      }
    }
    if (result.agents.skipped.length > 0) {
      console.log("⊘ Skipped agents:", result.agents.skipped.join(", "));
    }

    // Report commands
    if (result.commands.installed.length > 0) {
      console.log("\n✓ Installed slash commands:");
      for (const cmd of result.commands.installed) {
        console.log(`  - /${cmd}`);
      }
    }
    if (result.commands.skipped.length > 0) {
      console.log("⊘ Skipped commands:", result.commands.skipped.join(", "));
    }

    // Report hooks
    if (result.hooks.installed.length > 0) {
      console.log("\n✓ Installed hooks:");
      for (const hook of result.hooks.installed) {
        console.log(`  - ${hook}`);
      }
    }
    if (result.hooks.skipped.length > 0) {
      console.log("⊘ Skipped hooks:", result.hooks.skipped.join(", "));
    }

    // Report MCP
    if (result.mcp.installed) {
      console.log("\n✓ MCP server configured");
    }

    // Report config
    if (result.config.created) {
      console.log("✓ Default configuration created");
    }

    // Report errors
    if (result.errors.length > 0) {
      console.log("\n⚠ Errors:");
      for (const error of result.errors) {
        console.log(`  - ${error}`);
      }
    }

    console.log("\n" + (result.success ? "✓ Installation complete!" : "⚠ Installation completed with errors"));

    if (result.success) {
      console.log("\nNext steps:");
      console.log("1. Set your API keys:");
      console.log("   export DEEPSEEK_API_KEY=your-key");
      console.log("   export ZHIPU_API_KEY=your-key");
      console.log("   export MINIMAX_API_KEY=your-key");
      console.log("\n2. Start Claude Code and use @sisyphus or other agents");
      console.log("\n3. Run 'oh-my-claude doctor' to verify setup");
    }

    process.exit(result.success ? 0 : 1);
  });

// Uninstall command
program
  .command("uninstall")
  .description("Uninstall oh-my-claude from Claude Code")
  .option("--keep-config", "Keep configuration file")
  .action(async (options) => {
    console.log("Uninstalling oh-my-claude...\n");

    const result = await uninstall({
      keepConfig: options.keepConfig,
    });

    if (result.agents.length > 0) {
      console.log("✓ Removed agent files:", result.agents.length);
    }

    if (result.commands.length > 0) {
      console.log("✓ Removed commands:", result.commands.map(c => `/${c}`).join(", "));
    }

    if (result.hooks.length > 0) {
      console.log("✓ Removed hooks:", result.hooks.join(", "));
    }

    if (result.mcp) {
      console.log("✓ Removed MCP server configuration");
    }

    if (result.errors.length > 0) {
      console.log("\n⚠ Errors:");
      for (const error of result.errors) {
        console.log(`  - ${error}`);
      }
    }

    console.log("\n" + (result.success ? "✓ Uninstallation complete!" : "⚠ Uninstallation completed with errors"));
    process.exit(result.success ? 0 : 1);
  });

// Status command
program
  .command("status")
  .description("Check oh-my-claude installation status")
  .action(() => {
    const status = checkInstallation();

    console.log("oh-my-claude Installation Status\n");
    console.log(`Installed: ${status.installed ? "Yes" : "No"}\n`);
    console.log("Components:");
    console.log(`  Agents:  ${status.components.agents ? "✓" : "✗"}`);
    console.log(`  Hooks:   ${status.components.hooks ? "✓" : "✗"}`);
    console.log(`  MCP:     ${status.components.mcp ? "✓" : "✗"}`);
    console.log(`  Config:  ${status.components.config ? "✓" : "✗"}`);

    process.exit(status.installed ? 0 : 1);
  });

// Doctor command
program
  .command("doctor")
  .description("Diagnose oh-my-claude configuration")
  .option("--detail", "Show detailed status of each component")
  .option("--no-color", "Disable colored output")
  .action((options) => {
    const { execSync } = require("node:child_process");
    const { existsSync } = require("node:fs");
    const { join } = require("node:path");
    const { homedir } = require("node:os");

    const detail = options.detail;
    const useColor = options.color !== false && process.stdout.isTTY;

    // Color helpers
    const c = {
      reset: useColor ? "\x1b[0m" : "",
      bold: useColor ? "\x1b[1m" : "",
      dim: useColor ? "\x1b[2m" : "",
      green: useColor ? "\x1b[32m" : "",
      red: useColor ? "\x1b[31m" : "",
      yellow: useColor ? "\x1b[33m" : "",
      cyan: useColor ? "\x1b[36m" : "",
      blue: useColor ? "\x1b[34m" : "",
      magenta: useColor ? "\x1b[35m" : "",
    };

    const ok = (text: string) => `${c.green}✓${c.reset} ${text}`;
    const fail = (text: string) => `${c.red}✗${c.reset} ${text}`;
    const warn = (text: string) => `${c.yellow}⚠${c.reset} ${text}`;
    const header = (text: string) => `${c.cyan}${c.bold}${text}${c.reset}`;
    const subheader = (text: string) => `${c.blue}${text}${c.reset}`;
    const dimText = (text: string) => `${c.dim}${text}${c.reset}`;

    console.log(`${c.bold}${c.magenta}oh-my-claude Doctor${c.reset}\n`);

    // Check installation
    const status = checkInstallation();
    console.log(header("Installation:"));
    console.log(`  ${status.installed ? ok("Core files installed") : fail("Core files installed")}`);
    console.log(`  ${status.components.agents ? ok("Agent files generated") : fail("Agent files generated")}`);
    console.log(`  ${status.components.hooks ? ok("Hooks configured") : fail("Hooks configured")}`);
    console.log(`  ${status.components.mcp ? ok("MCP server configured") : fail("MCP server configured")}`);
    console.log(`  ${status.components.statusLine ? ok("StatusLine configured") : warn("StatusLine not configured")}`);
    console.log(`  ${status.components.config ? ok("Configuration file exists") : fail("Configuration file exists")}`);


    // Detailed agent status
    if (detail) {
      console.log(`\n${header("Agents (detailed):")}`);
      const agentsDir = join(homedir(), ".claude", "agents");
      const expectedAgents = [
        "sisyphus",
        "claude-reviewer",
        "claude-scout",
        "prometheus",
        "oracle",
        "librarian",
        "explore",
        "frontend-ui-ux",
        "document-writer",
      ];
      for (const agent of expectedAgents) {
        const agentPath = join(agentsDir, `${agent}.md`);
        const exists = existsSync(agentPath);
        console.log(`  ${exists ? ok(`${agent}.md`) : fail(`${agent}.md`)}`);
      }

      // Detailed command status
      console.log(`\n${header("Commands (detailed):")}`);
      const commandsDir = join(homedir(), ".claude", "commands");
      const expectedCommands = [
        // Agent commands
        "omc-sisyphus",
        "omc-oracle",
        "omc-librarian",
        "omc-reviewer",
        "omc-scout",
        "omc-explore",
        "omc-plan",
        "omc-start-work",
        "omc-status",
        // Quick action commands
        "omcx-commit",
        "omcx-implement",
        "omcx-refactor",
        "omcx-docs",
        "omcx-issue",
      ];
      console.log(`  ${subheader("Agent commands (omc-):")}`);
      for (const cmd of expectedCommands.filter(c => c.startsWith("omc-"))) {
        const cmdPath = join(commandsDir, `${cmd}.md`);
        const exists = existsSync(cmdPath);
        console.log(`    ${exists ? ok(`/${cmd}`) : fail(`/${cmd}`)}`);
      }
      console.log(`  ${subheader("Quick action commands (omcx-):")}`);
      for (const cmd of expectedCommands.filter(c => c.startsWith("omcx-"))) {
        const cmdPath = join(commandsDir, `${cmd}.md`);
        const exists = existsSync(cmdPath);
        console.log(`    ${exists ? ok(`/${cmd}`) : fail(`/${cmd}`)}`);
      }

      // Detailed MCP status
      console.log(`\n${header("MCP Server (detailed):")}`);
      try {
        const mcpList = execSync("claude mcp list", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
        const omcLine = mcpList.split("\n").find((line: string) => line.includes("oh-my-claude-background"));
        if (omcLine) {
          const isConnected = omcLine.includes("✓ Connected");
          console.log(`  ${isConnected ? ok("oh-my-claude-background") : fail("oh-my-claude-background")}`);
          console.log(`    Status: ${isConnected ? `${c.green}Connected${c.reset}` : `${c.red}Not connected${c.reset}`}`);
          // Extract path from the line (format: "name: node /path/to/file - status")
          const pathMatch = omcLine.match(/node\s+(.+?)\s+-/);
          if (pathMatch) {
            const serverPath = pathMatch[1].trim();
            console.log(`    Path: ${dimText(serverPath)}`);
            const fileExists = existsSync(serverPath);
            console.log(`    File exists: ${fileExists ? `${c.green}Yes${c.reset}` : `${c.red}No${c.reset}`}`);
          }
        } else {
          console.log(`  ${fail("oh-my-claude-background not registered")}`);
          console.log(`    ${dimText("Run 'oh-my-claude install' to register MCP server")}`);
        }
      } catch (error) {
        console.log(`  ${fail("Failed to check MCP status")}`);
        console.log(`    ${dimText("Make sure 'claude' CLI is available")}`);
      }

      // Hooks detail
      console.log(`\n${header("Hooks (detailed):")}`);
      const hooksDir = join(homedir(), ".claude", "oh-my-claude", "hooks");
      const expectedHooks = ["comment-checker.js", "todo-continuation.js", "task-notification.js"];
      for (const hook of expectedHooks) {
        const hookPath = join(hooksDir, hook);
        const exists = existsSync(hookPath);
        console.log(`  ${exists ? ok(hook) : fail(hook)}`);
      }

      // StatusLine detail
      console.log(`\n${header("StatusLine (detailed):")}`);
      const statusLineDir = join(homedir(), ".claude", "oh-my-claude", "dist", "statusline");
      const statusLineScript = join(statusLineDir, "statusline.js");
      const statusFileExists = existsSync(statusLineScript);
      console.log(`  ${statusFileExists ? ok("statusline.js installed") : fail("statusline.js not installed")}`);

      try {
        const settingsPath = join(homedir(), ".claude", "settings.json");
        if (existsSync(settingsPath)) {
          const settings = JSON.parse(require("node:fs").readFileSync(settingsPath, "utf-8"));
          if (settings.statusLine) {
            const cmd = settings.statusLine.command || "";
            const isOurs = cmd.includes("oh-my-claude");
            const isWrapper = cmd.includes("statusline-wrapper");
            console.log(`  ${ok("StatusLine configured in settings.json")}`);
            if (isWrapper) {
              console.log(`    Mode: ${c.yellow}Merged (wrapper)${c.reset}`);
            } else if (isOurs) {
              console.log(`    Mode: ${c.green}Direct${c.reset}`);
            } else {
              console.log(`    Mode: ${c.cyan}External${c.reset}`);
            }
          } else {
            console.log(`  ${warn("StatusLine not configured in settings.json")}`);
          }
        }
      } catch {
        console.log(`  ${fail("Failed to read settings.json")}`);
      }
    }

    // Check providers
    console.log(`\n${header("Providers:")}`);
    try {
      const providers = getProvidersStatus();
      for (const [name, info] of Object.entries(providers)) {
        const note = info.type === "claude-subscription" ? dimText("(uses Claude subscription)") : "";
        console.log(`  ${info.configured ? ok(name) : fail(name)} ${note}`);
        if (detail && info.type !== "claude-subscription") {
          const envVar = `${name.toUpperCase()}_API_KEY`;
          const isSet = process.env[envVar];
          console.log(`    Env: ${c.cyan}${envVar}${c.reset} ${isSet ? `${c.green}(set)${c.reset}` : `${c.red}(not set)${c.reset}`}`);
        }
      }
    } catch (error) {
      console.log(`  ${fail("Failed to check providers:")} ${error}`);
    }

    // Check configuration
    console.log(`\n${header("Configuration:")}`);
    try {
      const config = loadConfig();
      console.log(`  ${ok("Configuration loaded")}`);
      console.log(`  ${dimText("-")} ${Object.keys(config.agents).length} agents configured`);
      console.log(`  ${dimText("-")} ${Object.keys(config.categories).length} categories configured`);
      console.log(`  ${dimText("-")} Default concurrency: ${config.concurrency.default}`);

      if (detail) {
        console.log(`\n  ${subheader("Agents configured:")}`);
        for (const [name, agentConfig] of Object.entries(config.agents)) {
          console.log(`    ${dimText("-")} ${c.bold}${name}${c.reset}: ${c.cyan}${(agentConfig as any).provider}${c.reset}/${c.blue}${(agentConfig as any).model}${c.reset}`);
        }
      }
    } catch (error) {
      console.log(`  ${fail("Failed to load configuration:")} ${error}`);
    }

    // Recommendations
    console.log(`\n${header("Recommendations:")}`);

    const providers = getProvidersStatus();
    const unconfigured = Object.entries(providers)
      .filter(([_, info]) => !info.configured && info.type !== "claude-subscription")
      .map(([name]) => name);

    if (unconfigured.length > 0) {
      console.log(`  ${warn(`Set API keys for: ${c.yellow}${unconfigured.join(", ")}${c.reset}`)}`);
      if (detail) {
        for (const provider of unconfigured) {
          console.log(`    ${c.dim}export ${provider.toUpperCase()}_API_KEY=your-key${c.reset}`);
        }
      }
    } else {
      console.log(`  ${ok("All providers configured")}`);
    }

    if (!status.installed) {
      console.log(`  ${warn("Run 'oh-my-claude install' to complete setup")}`);
    }

    if (!detail) {
      console.log(`\n${dimText("Tip: Run 'oh-my-claude doctor --detail' for detailed component status")}`);
    }
  });

// Update command
program
  .command("update")
  .description("Update oh-my-claude to the latest version")
  .option("--check", "Only check for updates without installing")
  .option("--force", "Force update even if already on latest version")
  .action(async (options) => {
    const { execSync } = require("node:child_process");
    const { readFileSync, existsSync } = require("node:fs");
    const { join } = require("node:path");
    const { homedir } = require("node:os");

    // Color helpers
    const useColor = process.stdout.isTTY;
    const c = {
      reset: useColor ? "\x1b[0m" : "",
      bold: useColor ? "\x1b[1m" : "",
      dim: useColor ? "\x1b[2m" : "",
      green: useColor ? "\x1b[32m" : "",
      red: useColor ? "\x1b[31m" : "",
      yellow: useColor ? "\x1b[33m" : "",
      cyan: useColor ? "\x1b[36m" : "",
      magenta: useColor ? "\x1b[35m" : "",
    };

    const ok = (text: string) => `${c.green}✓${c.reset} ${text}`;
    const fail = (text: string) => `${c.red}✗${c.reset} ${text}`;
    const warn = (text: string) => `${c.yellow}⚠${c.reset} ${text}`;
    const header = (text: string) => `${c.cyan}${c.bold}${text}${c.reset}`;
    const dimText = (text: string) => `${c.dim}${text}${c.reset}`;

    const PACKAGE_NAME = "@lgcyaxi/oh-my-claude";

    console.log(`${c.bold}${c.magenta}oh-my-claude Update${c.reset}\n`);

    // Get current version
    let currentVersion = "unknown";
    try {
      // Try to read from package.json in the installed location
      const installDir = join(homedir(), ".claude", "oh-my-claude");
      const localPkgPath = join(installDir, "package.json");

      if (existsSync(localPkgPath)) {
        const pkg = JSON.parse(readFileSync(localPkgPath, "utf-8"));
        currentVersion = pkg.version;
      } else {
        // Fall back to the version from the running CLI
        currentVersion = program.version() || "unknown";
      }
    } catch (error) {
      // Use the CLI version as fallback
      currentVersion = program.version() || "unknown";
    }

    console.log(`Current version: ${c.cyan}${currentVersion}${c.reset}`);

    // Fetch latest version from npm
    let latestVersion = "unknown";
    try {
      console.log(`${dimText("Checking npm registry for latest version...")}`);
      // Use stdio: 'pipe' to suppress stderr instead of shell redirection (Windows compatible)
      const npmInfo = execSync(`npm view ${PACKAGE_NAME} version`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      latestVersion = npmInfo;
      console.log(`Latest version:  ${c.cyan}${latestVersion}${c.reset}\n`);
    } catch (error) {
      console.log(`${fail("Failed to fetch latest version from npm")}`);
      console.log(`${dimText("Check your internet connection or try again later")}\n`);
      process.exit(1);
    }

    // Compare versions
    const isUpToDate = currentVersion === latestVersion;
    const needsUpdate = !isUpToDate || options.force;

    if (isUpToDate && !options.force) {
      console.log(ok("You are already on the latest version!"));
      process.exit(0);
    }

    if (options.check) {
      if (needsUpdate) {
        console.log(warn(`Update available: ${currentVersion} → ${latestVersion}`));
        console.log(`\nRun ${c.cyan}npx ${PACKAGE_NAME} update${c.reset} to update.`);
      }
      process.exit(0);
    }

    // Perform update
    console.log(header("Updating oh-my-claude...\n"));

    try {
      // Step 1: Clear npx cache for the package (optional, may fail on some systems)
      console.log(`${dimText("Clearing npx cache...")}`);
      try {
        // Use stdio: 'pipe' for Windows compatibility instead of shell redirection
        execSync(`npx --yes clear-npx-cache`, {
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 10000
        });
      } catch {
        // Ignore errors - cache clear is optional and may not be available
      }

      // Step 2: Install latest version via npx
      console.log(`${dimText("Downloading latest version...")}`);

      // Use npx with --yes to ensure latest version is fetched
      // The @latest tag forces npm to check for the newest version
      const updateCmd = `npx --yes ${PACKAGE_NAME}@latest install --force`;
      console.log(`${dimText(`Running: ${updateCmd}`)}\n`);

      execSync(updateCmd, { stdio: "inherit" });

      console.log(`\n${ok("Update complete!")}`);
      console.log(`Updated from ${c.yellow}${currentVersion}${c.reset} to ${c.green}${latestVersion}${c.reset}`);

      // Show changelog hint
      console.log(`\n${dimText("View changelog at: https://github.com/lgcyaxi/oh-my-claude/blob/main/CHANGELOG.md")}`);

    } catch (error) {
      console.log(`\n${fail("Update failed")}`);
      console.log(`${dimText("Try running manually:")}`);
      console.log(`  ${c.cyan}npx ${PACKAGE_NAME}@latest install --force${c.reset}`);
      process.exit(1);
    }
  });

// StatusLine command
program
  .command("statusline")
  .description("Manage statusline integration")
  .option("--enable", "Enable statusline")
  .option("--disable", "Disable statusline")
  .option("--status", "Show current statusline configuration")
  .action((options) => {
    const { readFileSync, existsSync } = require("node:fs");
    const { join } = require("node:path");
    const { homedir } = require("node:os");

    // Color helpers
    const useColor = process.stdout.isTTY;
    const c = {
      reset: useColor ? "\x1b[0m" : "",
      bold: useColor ? "\x1b[1m" : "",
      dim: useColor ? "\x1b[2m" : "",
      green: useColor ? "\x1b[32m" : "",
      red: useColor ? "\x1b[31m" : "",
      yellow: useColor ? "\x1b[33m" : "",
      cyan: useColor ? "\x1b[36m" : "",
    };

    const ok = (text: string) => `${c.green}+${c.reset} ${text}`;
    const fail = (text: string) => `${c.red}x${c.reset} ${text}`;
    const warn = (text: string) => `${c.yellow}!${c.reset} ${text}`;

    const settingsPath = join(homedir(), ".claude", "settings.json");

    if (options.status || (!options.enable && !options.disable)) {
      // Show status
      console.log(`${c.bold}StatusLine Status${c.reset}\n`);

      if (!existsSync(settingsPath)) {
        console.log(fail("settings.json not found"));
        process.exit(1);
      }

      try {
        const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));

        if (!settings.statusLine) {
          console.log(fail("StatusLine not configured"));
          console.log(`\nRun ${c.cyan}oh-my-claude statusline --enable${c.reset} to enable.`);
        } else {
          const cmd = settings.statusLine.command || "";
          const isOurs = cmd.includes("oh-my-claude");
          const isWrapper = cmd.includes("statusline-wrapper");

          console.log(ok("StatusLine configured"));
          console.log(`  Command: ${c.dim}${cmd}${c.reset}`);

          if (isWrapper) {
            console.log(`  Mode: ${c.yellow}Merged (wrapper)${c.reset}`);
          } else if (isOurs) {
            console.log(`  Mode: ${c.green}Direct${c.reset}`);
          } else {
            console.log(`  Mode: ${c.cyan}External${c.reset}`);
          }
        }
      } catch (error) {
        console.log(fail(`Failed to read settings: ${error}`));
        process.exit(1);
      }
    } else if (options.enable) {
      // Enable statusline
      const { installStatusLine } = require("./installer/settings-merger");
      const { getStatusLineScriptPath } = require("./installer");

      try {
        const result = installStatusLine(getStatusLineScriptPath());
        if (result.installed) {
          console.log(ok("StatusLine enabled"));
          if (result.wrapperCreated) {
            console.log(warn("Wrapper created to merge with existing statusLine"));
          }
        }
      } catch (error) {
        console.log(fail(`Failed to enable statusline: ${error}`));
        process.exit(1);
      }
    } else if (options.disable) {
      // Disable statusline
      const { uninstallStatusLine } = require("./installer/settings-merger");

      try {
        const result = uninstallStatusLine();
        if (result) {
          console.log(ok("StatusLine disabled"));
        } else {
          console.log(warn("StatusLine was not configured"));
        }
      } catch (error) {
        console.log(fail(`Failed to disable statusline: ${error}`));
        process.exit(1);
      }
    }
  });

// Setup MCP command
program
  .command("setup-mcp")
  .description("Install official MCP servers (MiniMax, GLM/ZhiPu)")
  .option("--minimax", "Install MiniMax MCP only")
  .option("--glm", "Install GLM/ZhiPu MCPs only")
  .option("--thinking", "Install Sequential Thinking MCP only")
  .option("--list", "List available MCP servers")
  .action(async (options) => {
    const { execSync, spawnSync } = require("node:child_process");

    // Color helpers
    const useColor = process.stdout.isTTY;
    const c = {
      reset: useColor ? "\x1b[0m" : "",
      bold: useColor ? "\x1b[1m" : "",
      dim: useColor ? "\x1b[2m" : "",
      green: useColor ? "\x1b[32m" : "",
      red: useColor ? "\x1b[31m" : "",
      yellow: useColor ? "\x1b[33m" : "",
      cyan: useColor ? "\x1b[36m" : "",
    };

    const ok = (text: string) => `${c.green}✓${c.reset} ${text}`;
    const fail = (text: string) => `${c.red}✗${c.reset} ${text}`;
    const warn = (text: string) => `${c.yellow}⚠${c.reset} ${text}`;
    const header = (text: string) => `${c.cyan}${c.bold}${text}${c.reset}`;
    const dimText = (text: string) => `${c.dim}${text}${c.reset}`;

    // Available MCP servers
    const mcpServers = {
      "sequential-thinking": {
        name: "sequential-thinking",
        description: "Dynamic problem-solving through structured thought sequences",
        envKey: null, // No API key required
        type: "stdio",
        command: "claude mcp add --scope user sequential-thinking -- npx -y @modelcontextprotocol/server-sequential-thinking",
      },
      minimax: {
        name: "MiniMax",
        description: "MiniMax coding plan MCP server",
        envKey: "MINIMAX_API_KEY",
        type: "stdio",
        command: "claude mcp add --scope user MiniMax -- uvx minimax-coding-plan-mcp -y",
      },
      "web-reader": {
        name: "web-reader",
        description: "GLM web content reader",
        envKey: "ZHIPU_API_KEY",
        type: "http",
        url: "https://open.bigmodel.cn/api/mcp/web_reader/mcp",
      },
      "web-search-prime": {
        name: "web-search-prime",
        description: "GLM web search",
        envKey: "ZHIPU_API_KEY",
        type: "http",
        url: "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp",
      },
      zread: {
        name: "zread",
        description: "GLM GitHub repository reader",
        envKey: "ZHIPU_API_KEY",
        type: "http",
        url: "https://open.bigmodel.cn/api/mcp/zread/mcp",
      },
      "zai-mcp-server": {
        name: "zai-mcp-server",
        description: "GLM AI image/video analysis",
        envKey: "ZHIPU_API_KEY",
        type: "http",
        url: "https://open.bigmodel.cn/api/mcp/zai_mcp_server/mcp",
      },
    };

    // List mode
    if (options.list) {
      console.log(header("Available MCP Servers:\n"));

      console.log(`  ${c.bold}Anthropic Official:${c.reset}`);
      console.log(`    ${dimText("-")} sequential-thinking: ${mcpServers["sequential-thinking"].description}`);
      console.log(`      ${c.green}No API key required${c.reset}\n`);

      console.log(`  ${c.bold}MiniMax:${c.reset}`);
      console.log(`    ${dimText("-")} MiniMax: ${mcpServers.minimax.description}`);
      console.log(`      Requires: ${c.cyan}MINIMAX_API_KEY${c.reset}\n`);

      console.log(`  ${c.bold}GLM/ZhiPu:${c.reset}`);
      for (const [key, server] of Object.entries(mcpServers)) {
        if (server.envKey === "ZHIPU_API_KEY") {
          console.log(`    ${dimText("-")} ${server.name}: ${server.description}`);
        }
      }
      console.log(`      Requires: ${c.cyan}ZHIPU_API_KEY${c.reset}`);
      return;
    }

    // Determine what to install (if none specified, install all)
    const hasSpecificOption = options.minimax || options.glm || options.thinking;
    const installThinking = options.thinking || !hasSpecificOption;
    const installMinimax = options.minimax || !hasSpecificOption;
    const installGlm = options.glm || !hasSpecificOption;

    console.log(header("Setting up official MCP servers...\n"));

    let hasErrors = false;

    // Install Sequential Thinking (no API key required)
    if (installThinking) {
      console.log(`${c.bold}Anthropic Official:${c.reset}`);
      try {
        const mcpList = execSync("claude mcp list", { encoding: "utf-8" });
        if (mcpList.includes("sequential-thinking")) {
          console.log(`  ${ok("sequential-thinking already installed")}`);
        } else {
          execSync(mcpServers["sequential-thinking"].command, { stdio: "pipe" });
          console.log(`  ${ok("sequential-thinking installed")}`);
        }
      } catch (error) {
        console.log(`  ${fail("Failed to install sequential-thinking")}`);
        hasErrors = true;
      }
    }

    // Install MiniMax
    if (installMinimax) {
      console.log(`\n${c.bold}MiniMax:${c.reset}`);
      const minimaxKey = process.env.MINIMAX_API_KEY;
      if (!minimaxKey) {
        console.log(`  ${warn("MINIMAX_API_KEY not set - skipping MiniMax")}`);
        console.log(`    ${dimText("Set it with: export MINIMAX_API_KEY=your-key")}`);
      } else {
        try {
          // Check if already installed
          const mcpList = execSync("claude mcp list", { encoding: "utf-8" });
          if (mcpList.includes("MiniMax")) {
            console.log(`  ${ok("MiniMax already installed")}`);
          } else {
            execSync(mcpServers.minimax.command, { stdio: "inherit" });
            console.log(`  ${ok("MiniMax installed")}`);
          }
        } catch (error) {
          console.log(`  ${fail("Failed to install MiniMax")}`);
          hasErrors = true;
        }
      }
    }

    // Install GLM MCPs
    if (installGlm) {
      console.log(`\n${c.bold}GLM/ZhiPu:${c.reset}`);
      const zhipuKey = process.env.ZHIPU_API_KEY;
      if (!zhipuKey) {
        console.log(`  ${warn("ZHIPU_API_KEY not set - skipping GLM MCPs")}`);
        console.log(`    ${dimText("Set it with: export ZHIPU_API_KEY=your-key")}`);
      } else {
        const glmServers = Object.entries(mcpServers).filter(([_, s]) => s.envKey === "ZHIPU_API_KEY");

        for (const [key, server] of glmServers) {
          try {
            // Check if already installed
            const mcpList = execSync("claude mcp list", { encoding: "utf-8" });
            if (mcpList.includes(server.name)) {
              console.log(`  ${ok(`${server.name} already installed`)}`);
            } else {
              // Install HTTP MCP with Authorization header
              const cmd = `claude mcp add --scope user --transport http -H "Authorization: Bearer ${zhipuKey}" ${server.name} ${(server as any).url}`;
              execSync(cmd, { stdio: "pipe" });
              console.log(`  ${ok(`${server.name} installed`)}`);
            }
          } catch (error) {
            console.log(`  ${fail(`Failed to install ${server.name}`)}`);
            hasErrors = true;
          }
        }
      }
    }

    console.log();
    if (hasErrors) {
      console.log(warn("Setup completed with some errors"));
      process.exit(1);
    } else {
      console.log(ok("MCP servers setup complete!"));
      console.log(`\n${dimText("Restart Claude Code to activate the new MCP servers.")}`);
    }
  });

program.parse();
