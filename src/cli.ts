#!/usr/bin/env node
/**
 * oh-my-claude CLI
 *
 * Usage:
 *   npx oh-my-claude install      # Install oh-my-claude
 *   npx oh-my-claude uninstall    # Uninstall oh-my-claude
 *   npx oh-my-claude status       # Check installation status
 *   npx oh-my-claude doctor       # Diagnose configuration issues
 *   npx oh-my-claude update       # Update oh-my-claude to latest version
 *   npx oh-my-claude setup-mcp    # Install official MCP servers (MiniMax, GLM)
 *   npx oh-my-claude setup-tools  # Install companion tools (CCometixLine)
 */

import { program } from "commander";
import { install, uninstall, checkInstallation } from "./installer";
import { getProvidersStatus } from "./providers/router";
import { loadConfig } from "./config";

program
  .name("oh-my-claude")
  .description("Multi-agent orchestration plugin for Claude Code")
  .version("1.2.0");

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
    if (result.hooks.updated.length > 0) {
      console.log("\n✓ Updated hooks:");
      for (const hook of result.hooks.updated) {
        console.log(`  - ${hook}`);
      }
    }
    if (result.hooks.skipped.length > 0) {
      console.log("⊘ Skipped hooks:", result.hooks.skipped.join(", "));
    }

    // Report MCP
    if (result.mcp.installed) {
      if (result.mcp.updated) {
        console.log("\n✓ MCP server updated");
      } else {
        console.log("\n✓ MCP server configured");
      }
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
    const { existsSync, readFileSync } = require("node:fs");
    const { join } = require("node:path");
    const { homedir } = require("node:os");
    const { isBetaInstallation, getBetaChannelInfo, checkForNewerBeta } = require("./installer/beta-channel");

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

    // Version and Channel info
    console.log(`\n${header("Version:")}`);
    let currentVersion = "unknown";
    try {
      const installDir = join(homedir(), ".claude", "oh-my-claude");
      const localPkgPath = join(installDir, "package.json");
      if (existsSync(localPkgPath)) {
        const pkg = JSON.parse(readFileSync(localPkgPath, "utf-8"));
        currentVersion = pkg.version;
      }
    } catch {
      // Ignore
    }

    const betaInfo = getBetaChannelInfo();
    const isOnBeta = isBetaInstallation();

    if (isOnBeta && betaInfo) {
      console.log(`  ${ok(`Current: ${currentVersion}`)} ${c.yellow}(beta)${c.reset}`);
      console.log(`  ${dimText(`Channel: beta (${betaInfo.branch} @ ${betaInfo.ref.substring(0, 7)})`)}`);
      console.log(`  ${dimText(`Installed: ${new Date(betaInfo.installedAt).toLocaleDateString()}`)}`);
    } else {
      console.log(`  ${ok(`Current: ${currentVersion}`)} ${c.green}(stable)${c.reset}`);
      console.log(`  ${dimText("Channel: npm (@lgcyaxi/oh-my-claude)")}`);
    }

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
        "analyst",
        "librarian",
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
  .option("--beta", "Install from GitHub dev branch (beta channel)")
  .option("--ref <ref>", "Specific git ref to install (requires --beta)")
  .action(async (options) => {
    const { execSync } = require("node:child_process");
    const { readFileSync, existsSync } = require("node:fs");
    const { join } = require("node:path");
    const { homedir } = require("node:os");
    const {
      isBetaInstallation,
      getBetaChannelInfo,
      setBetaChannelInfo,
      clearBetaChannel,
      installFromGitHub,
    } = require("./installer/beta-channel");

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
    const GITHUB_REPO = "lgcyaxi/oh-my-claude";

    // Check if --ref is used without --beta
    if (options.ref && !options.beta) {
      console.log(`${fail("--ref requires --beta flag")}`);
      console.log(`${dimText("Usage: oh-my-claude update --beta --ref=<commit>")}`);
      process.exit(1);
    }

    console.log(`${c.bold}${c.magenta}oh-my-claude Update${c.reset}\n`);

    // Get current version and beta status
    let currentVersion = "unknown";
    const betaInfo = getBetaChannelInfo();
    const isCurrentlyBeta = isBetaInstallation();

    try {
      const installDir = join(homedir(), ".claude", "oh-my-claude");
      const localPkgPath = join(installDir, "package.json");

      if (existsSync(localPkgPath)) {
        const pkg = JSON.parse(readFileSync(localPkgPath, "utf-8"));
        currentVersion = pkg.version;
      } else {
        currentVersion = program.version() || "unknown";
      }
    } catch (error) {
      currentVersion = program.version() || "unknown";
    }

    // Display current version with channel info
    if (isCurrentlyBeta && betaInfo) {
      console.log(`Current version: ${c.cyan}${currentVersion}${c.reset} ${c.yellow}(beta)${c.reset}`);
      console.log(`Channel: beta (${betaInfo.branch} @ ${betaInfo.ref.substring(0, 7)})`);
    } else {
      console.log(`Current version: ${c.cyan}${currentVersion}${c.reset} ${c.green}(stable)${c.reset}`);
    }

    // === BETA UPDATE PATH ===
    if (options.beta) {
      const ref = options.ref || "dev";
      console.log(`\n${header("Installing from beta channel...")}`);
      console.log(`${dimText(`Target: GitHub ${GITHUB_REPO}#${ref}`)}\n`);

      if (options.check) {
        console.log(warn(`Would install beta from: ${ref}`));
        console.log(`\nRun ${c.cyan}oh-my-claude update --beta${c.reset} to install.`);
        process.exit(0);
      }

      try {
        // Install from GitHub tarball
        const tarballUrl = `https://github.com/${GITHUB_REPO}/tarball/${ref}`;
        console.log(`${dimText("Downloading from GitHub...")}`);
        console.log(`${dimText(`URL: ${tarballUrl}`)}\n`);

        // Use npm to install globally from tarball
        const installCmd = `npm install --global "${tarballUrl}"`;
        execSync(installCmd, { stdio: "inherit", timeout: 120000 });

        // Run install --force to set up all components
        console.log(`\n${dimText("Setting up components...")}`);
        execSync(`npx --yes ${PACKAGE_NAME} install --force`, { stdio: "inherit" });

        // Resolve the actual commit SHA
        let resolvedRef = ref;
        try {
          const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/commits/${ref}`;
          const response = execSync(`curl -s "${apiUrl}"`, { encoding: "utf-8", timeout: 10000 });
          const data = JSON.parse(response);
          if (data.sha) {
            resolvedRef = data.sha.substring(0, 7);
          }
        } catch {
          // Use original ref if resolution fails
        }

        // Write beta channel marker
        setBetaChannelInfo({
          ref: resolvedRef,
          branch: ref === "dev" ? "dev" : ref,
          installedAt: new Date().toISOString(),
        });

        console.log(`\n${ok("Beta installation complete!")}`);
        if (isCurrentlyBeta && betaInfo) {
          console.log(`Updated from beta ${c.yellow}${betaInfo.ref.substring(0, 7)}${c.reset} to ${c.green}${resolvedRef}${c.reset}`);
        } else {
          console.log(`Switched from ${c.yellow}stable${c.reset} to ${c.green}beta (${resolvedRef})${c.reset}`);
        }
        console.log(`\n${dimText("To switch back to stable: oh-my-claude update")}`);

      } catch (error) {
        console.log(`\n${fail("Beta installation failed")}`);
        const errMsg = error instanceof Error ? error.message : String(error);
        if (errMsg.includes("404") || errMsg.includes("Not Found")) {
          console.log(`${dimText(`Ref '${ref}' not found on GitHub.`)}`);
        } else if (errMsg.includes("ENOTFOUND") || errMsg.includes("getaddrinfo")) {
          console.log(`${dimText("Cannot reach GitHub. Check your internet connection.")}`);
        } else {
          console.log(`${dimText(errMsg)}`);
        }
        console.log(`\n${dimText("Try running manually:")}`);
        console.log(`  ${c.cyan}npm install -g https://github.com/${GITHUB_REPO}/tarball/${ref}${c.reset}`);
        process.exit(1);
      }
      return;
    }

    // === SWITCH FROM BETA TO STABLE ===
    if (isCurrentlyBeta && betaInfo) {
      console.log(`\n${warn("Switching from beta to stable channel...")}`);

      if (options.check) {
        console.log(`\nRun ${c.cyan}oh-my-claude update${c.reset} to switch to stable.`);
        console.log(`${dimText("Or use --beta to stay on beta channel.")}`);
        process.exit(0);
      }
    }

    // === STABLE UPDATE PATH ===
    let latestVersion = "unknown";
    try {
      console.log(`${dimText("Checking npm registry for latest version...")}`);
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

    // Compare versions (for stable updates)
    const isUpToDate = currentVersion === latestVersion && !isCurrentlyBeta;
    const needsUpdate = !isUpToDate || options.force || isCurrentlyBeta;

    if (isUpToDate && !options.force) {
      console.log(ok("You are already on the latest stable version!"));
      process.exit(0);
    }

    if (options.check) {
      if (needsUpdate) {
        if (isCurrentlyBeta) {
          console.log(warn(`Currently on beta. Stable version available: ${latestVersion}`));
        } else {
          console.log(warn(`Update available: ${currentVersion} → ${latestVersion}`));
        }
        console.log(`\nRun ${c.cyan}npx ${PACKAGE_NAME} update${c.reset} to update.`);
      }
      process.exit(0);
    }

    // Perform stable update
    console.log(header("Updating oh-my-claude...\n"));

    try {
      console.log(`${dimText("Clearing npx cache...")}`);
      try {
        execSync(`npx --yes clear-npx-cache`, {
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 10000
        });
      } catch {
        // Ignore errors
      }

      console.log(`${dimText("Downloading latest version...")}`);
      const updateCmd = `npx --yes ${PACKAGE_NAME}@latest install --force`;
      console.log(`${dimText(`Running: ${updateCmd}`)}\n`);

      execSync(updateCmd, { stdio: "inherit" });

      // Clear beta channel marker if switching from beta
      if (isCurrentlyBeta) {
        clearBetaChannel();
      }

      console.log(`\n${ok("Update complete!")}`);
      if (isCurrentlyBeta && betaInfo) {
        console.log(`Switched from ${c.yellow}beta (${betaInfo.ref.substring(0, 7)})${c.reset} to ${c.green}stable v${latestVersion}${c.reset}`);
      } else {
        console.log(`Updated from ${c.yellow}${currentVersion}${c.reset} to ${c.green}${latestVersion}${c.reset}`);
      }
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

// Config command
program
  .command("config")
  .description("Manage oh-my-claude configuration")
  .option("--get <key>", "Get a config value")
  .option("--set <key>=<value>", "Set a config value")
  .option("--unset <key>", "Remove a config value")
  .option("--list", "List all config values")
  .action((options) => {
    const { readFileSync, writeFileSync, existsSync, mkdirSync } = require("node:fs");
    const { join, dirname } = require("node:path");
    const { homedir } = require("node:os");

    const configPath = join(homedir(), ".claude", "oh-my-claude.json");
    const c = {
      reset: "\x1b[0m",
      bold: "\x1b[1m",
      green: "\x1b[32m",
      yellow: "\x1b[33m",
      cyan: "\x1b[36m",
    };
    const ok = (text: string) => `${c.green}✓${c.reset} ${text}`;
    const info = (text: string) => `${c.cyan}${text}${c.reset}`;

    // Load existing config or create new
    let config: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      try {
        config = JSON.parse(readFileSync(configPath, "utf-8"));
      } catch (error) {
        console.log(`Config file exists but is invalid. Starting with empty config.`);
      }
    }

    // Handle --list
    if (options.list) {
      console.log(`${c.bold}Current configuration:${c.reset}\n`);
      if (Object.keys(config).length === 0) {
        console.log("  (no custom config set)");
      } else {
        for (const [key, value] of Object.entries(config)) {
          console.log(`  ${key}: ${JSON.stringify(value)}`);
        }
      }
      console.log(`\n${info("Available keys:")}`);
      console.log("  debugTaskTracker - Enable debug logging for task-tracker hook");
      console.log("  debugHooks - Enable debug logging for all hooks");
      return;
    }

    // Handle --get
    if (options.get) {
      const key = options.get;
      if (key in config) {
        console.log(JSON.stringify(config[key], null, 2));
      } else {
        console.log(`Key '${key}' not found in config.`);
        console.log(`Run 'oh-my-claude config --list' to see all keys.`);
        process.exit(1);
      }
      return;
    }

    // Handle --set
    if (options.set) {
      const [key, ...valueParts] = options.set.split("=");
      const valueStr = valueParts.join("=");
      let value: unknown = valueStr;

      // Parse boolean and number values
      if (valueStr === "true") value = true;
      else if (valueStr === "false") value = false;
      else if (!isNaN(Number(valueStr))) value = Number(valueStr);

      config[key] = value;

      // Ensure config directory exists
      const configDir = dirname(configPath);
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }

      // Write config
      writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log(ok(`Set ${key} = ${JSON.stringify(value)}`));
      console.log(`\n${info("Restart Claude Code for changes to take effect.")}`);
      return;
    }

    // Handle --unset
    if (options.unset) {
      const key = options.unset;
      if (!(key in config)) {
        console.log(`Key '${key}' not found in config.`);
        process.exit(1);
      }
      delete config[key];
      writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log(ok(`Unset ${key}`));
      return;
    }

    // No options - show usage
    console.log(`${c.bold}Manage oh-my-claude configuration${c.reset}\n`);
    console.log("Usage:");
    console.log("  oh-my-claude config --list");
    console.log("  oh-my-claude config --get <key>");
    console.log("  oh-my-claude config --set <key>=<value>");
    console.log("  oh-my-claude config --unset <key>");
    console.log(`\nRun 'oh-my-claude config --list' to see available keys.`);
  });

// Setup tools command
program
  .command("setup-tools")
  .description("Install companion tools for Claude Code")
  .option("--list", "List available tools without installing")
  .action(async (options) => {
    const { execSync } = await import("node:child_process");
    const { writeFileSync, readFileSync, chmodSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { homedir } = await import("node:os");

    const useColor = process.stdout.isTTY;
    const c = {
      reset: useColor ? "\x1b[0m" : "",
      bold: useColor ? "\x1b[1m" : "",
      green: useColor ? "\x1b[32m" : "",
      red: useColor ? "\x1b[31m" : "",
      yellow: useColor ? "\x1b[33m" : "",
      cyan: useColor ? "\x1b[36m" : "",
      dim: useColor ? "\x1b[2m" : "",
    };
    const ok = (text: string) => `${c.green}✓${c.reset} ${text}`;
    const fail = (text: string) => `${c.red}✗${c.reset} ${text}`;
    const warn = (text: string) => `${c.yellow}⚠${c.reset} ${text}`;
    const dimText = (text: string) => `${c.dim}${text}${c.reset}`;

    // Available tools
    const tools = [
      {
        name: "CCometixLine",
        value: "ccline",
        description: "Enhanced statusline for Claude Code",
      },
    ];

    // List mode
    if (options.list) {
      console.log(`${c.bold}Available tools:${c.reset}\n`);
      for (const tool of tools) {
        console.log(`  - ${c.cyan}${tool.name}${c.reset}: ${tool.description}`);
      }
      return;
    }

    // Interactive mode
    const { checkbox, confirm } = await import("@inquirer/prompts");

    console.log(`${c.bold}Setup Companion Tools${c.reset}\n`);
    console.log("Select tools to install:\n");

    const selected = await checkbox({
      message: "Tools",
      choices: tools.map((tool) => ({
        name: `${tool.name} - ${tool.description}`,
        value: tool.value,
      })),
    });

    if (selected.length === 0) {
      console.log("\nNo tools selected. Exiting.");
      return;
    }

    console.log();

    // Process selected tools
    for (const toolValue of selected) {
      if (toolValue === "ccline") {
        // Check if already installed
        let alreadyInstalled = false;
        try {
          execSync("which ccline", { stdio: "pipe" });
          alreadyInstalled = true;
        } catch {
          // Not installed
        }

        if (alreadyInstalled) {
          const reinstall = await confirm({
            message: "CCometixLine already installed. Reinstall?",
            default: false,
          });

          if (!reinstall) {
            console.log(dimText("Keeping existing CCometixLine configuration."));
            continue;
          }
        }

        // Step 1: Install via npm
        console.log("Installing CCometixLine globally...");
        try {
          execSync("npm install -g @cometix/ccline", { stdio: "inherit" });
          console.log(ok("CCometixLine installed"));
        } catch (error) {
          console.log(fail("Failed to install CCometixLine"));
          console.log(dimText("Try manually: npm install -g @cometix/ccline"));
          continue;
        }

        // Step 2: Initialize ccline config
        console.log("Initializing ccline config...");
        try {
          execSync("ccline --init", { stdio: "inherit" });
          console.log(ok("ccline initialized"));
        } catch (error) {
          console.log(fail("Failed to initialize ccline"));
          console.log(dimText("Try manually: ccline --init"));
          continue;
        }

        // Step 3: Create wrapper that combines ccline and oh-my-claude statusline
        console.log("Creating statusline wrapper...");
        try {
          const wrapperPath = join(homedir(), ".claude", "oh-my-claude", "statusline-wrapper.sh");
          const omcStatusline = "node ~/.claude/oh-my-claude/dist/statusline/statusline.js";
          const wrapperContent = `#!/bin/bash
# oh-my-claude + CCometixLine StatusLine Wrapper
# Auto-generated - combines ccline and oh-my-claude statuslines

input=$(cat)

# Call ccline (CCometixLine)
ccline_output=$(echo "$input" | ccline 2>/dev/null || echo "")

# Call oh-my-claude statusline
omc_output=$(echo "$input" | ${omcStatusline} 2>/dev/null || echo "omc")

# Combine outputs - ccline first, omc second
if [ -n "$ccline_output" ] && [ -n "$omc_output" ]; then
  printf "%s\\n%s\\n" "$ccline_output" "$omc_output"
elif [ -n "$ccline_output" ]; then
  printf "%s\\n" "$ccline_output"
elif [ -n "$omc_output" ]; then
  printf "%s\\n" "$omc_output"
else
  echo ""
fi
`;
          writeFileSync(wrapperPath, wrapperContent);
          chmodSync(wrapperPath, 0o755);

          // Update settings.json to use the wrapper
          const settingsPath = join(homedir(), ".claude", "settings.json");
          const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
          settings.statusLine = {
            type: "command",
            command: wrapperPath,
            padding: settings.statusLine?.padding ?? 0,
          };
          writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

          console.log(ok("Statusline wrapper created"));
        } catch (error) {
          console.log(fail("Failed to create statusline wrapper"));
          console.log(dimText("Error: " + error));
          continue;
        }

        console.log();
        console.log(ok("CCometixLine installed successfully!"));
      }
    }

    console.log();
    console.log(warn("Please restart Claude Code to activate changes."));
  });

// Cleanup command
program
  .command("cleanup")
  .description("Clean up stale session data and temporary files")
  .option("--dry-run", "Show what would be cleaned without deleting")
  .option("--force", "Clean all sessions (including recent ones)")
  .action((options) => {
    const { existsSync, readdirSync, statSync, rmSync, readFileSync } = require("node:fs");
    const { join } = require("node:path");
    const { homedir } = require("node:os");

    const dryRun = options.dryRun;
    const force = options.force;

    // Color helpers
    const c = {
      green: "\x1b[32m",
      red: "\x1b[31m",
      yellow: "\x1b[33m",
      dim: "\x1b[2m",
      reset: "\x1b[0m",
    };
    const ok = (text: string) => `${c.green}✓${c.reset} ${text}`;
    const fail = (text: string) => `${c.red}✗${c.reset} ${text}`;
    const warn = (text: string) => `${c.yellow}⚠${c.reset} ${text}`;
    const dimText = (text: string) => `${c.dim}${text}${c.reset}`;

    console.log("oh-my-claude Cleanup\n");

    if (dryRun) {
      console.log(warn("Dry run mode - no files will be deleted\n"));
    }
    if (force) {
      console.log(warn("Force mode - all sessions will be cleaned\n"));
    }

    const omcDir = join(homedir(), ".claude", "oh-my-claude");
    const sessionsDir = join(omcDir, "sessions");

    // Check if a process is running
    function isProcessRunning(pid: number): boolean {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    }

    let totalCleaned = 0;

    // Clean up session directories
    if (existsSync(sessionsDir)) {
      console.log("Session directories:");
      const entries = readdirSync(sessionsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const sessionDir = join(sessionsDir, entry.name);
          const dirName = entry.name;
          let shouldClean = false;
          let reason = "";

          // Check if this is a PID-based session
          if (dirName.startsWith("pid-")) {
            const pidStr = dirName.substring(4);
            const pid = parseInt(pidStr, 10);

            if (!isNaN(pid) && pid > 0) {
              if (!isProcessRunning(pid)) {
                shouldClean = true;
                reason = `PID ${pid} not running`;
              } else if (force) {
                shouldClean = true;
                reason = `forced (PID ${pid} running)`;
              } else {
                console.log(`  ${dimText(dirName)} - active (PID running)`);
              }
            } else {
              shouldClean = true;
              reason = "invalid PID format";
            }
          } else {
            // Old format session - always clean with force, otherwise check age
            const stat = statSync(sessionDir);
            const ageMs = Date.now() - stat.mtimeMs;
            const ageHours = Math.floor(ageMs / (60 * 60 * 1000));

            if (force) {
              shouldClean = true;
              reason = `old format (${ageHours}h old)`;
            } else if (ageHours > 1) {
              shouldClean = true;
              reason = `stale (${ageHours}h old)`;
            } else {
              console.log(`  ${dimText(dirName)} - recent (<1h old)`);
            }
          }

          if (shouldClean) {
            if (dryRun) {
              console.log(`  ${warn(dirName)} - would delete (${reason})`);
              totalCleaned++;
            } else {
              try {
                rmSync(sessionDir, { recursive: true, force: true });
                console.log(`  ${ok(dirName)} - deleted (${reason})`);
                totalCleaned++;
              } catch (error) {
                console.log(`  ${fail(dirName)} - failed to delete`);
              }
            }
          }
        }
      }

      if (entries.length === 0) {
        console.log("  (no sessions found)");
      }
    } else {
      console.log("Session directories: (none)");
    }

    // Clean up PPID file if stale
    const ppidFile = join(omcDir, "current-ppid.txt");
    if (existsSync(ppidFile)) {
      console.log("\nPPID tracking file:");
      try {
        const content = readFileSync(ppidFile, "utf-8").trim();
        const parts = content.split(":");
        const pid = parseInt(parts[0] ?? "", 10);
        const timestamp = parseInt(parts[1] ?? "", 10);
        const ageMs = Date.now() - timestamp;
        const ageMinutes = Math.floor(ageMs / (60 * 1000));

        if (!isNaN(pid) && pid > 0 && isProcessRunning(pid) && !force) {
          console.log(`  ${dimText("current-ppid.txt")} - active (PID ${pid} running)`);
        } else {
          if (dryRun) {
            console.log(`  ${warn("current-ppid.txt")} - would delete (PID ${pid} not running, ${ageMinutes}m old)`);
            totalCleaned++;
          } else {
            rmSync(ppidFile, { force: true });
            console.log(`  ${ok("current-ppid.txt")} - deleted (PID ${pid} not running)`);
            totalCleaned++;
          }
        }
      } catch {
        if (dryRun) {
          console.log(`  ${warn("current-ppid.txt")} - would delete (unreadable)`);
          totalCleaned++;
        } else {
          rmSync(ppidFile, { force: true });
          console.log(`  ${ok("current-ppid.txt")} - deleted (unreadable)`);
          totalCleaned++;
        }
      }
    }

    // Clean up debug logs
    const debugLog = join(omcDir, "task-tracker-debug.log");
    if (existsSync(debugLog)) {
      console.log("\nDebug logs:");
      const stat = statSync(debugLog);
      const sizeKb = Math.round(stat.size / 1024);

      if (dryRun) {
        console.log(`  ${warn("task-tracker-debug.log")} - would delete (${sizeKb}KB)`);
        totalCleaned++;
      } else {
        rmSync(debugLog, { force: true });
        console.log(`  ${ok("task-tracker-debug.log")} - deleted (${sizeKb}KB)`);
        totalCleaned++;
      }
    }

    console.log();
    if (dryRun) {
      console.log(`Dry run complete. Would clean ${totalCleaned} item(s).`);
    } else {
      console.log(`Cleanup complete. Removed ${totalCleaned} item(s).`);
    }
  });

program.parse();
