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
  .version("1.4.1");

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

    // Report styles
    if (result.styles.deployed.length > 0) {
      console.log("\n✓ Deployed output styles:");
      for (const style of result.styles.deployed) {
        console.log(`  - ${style}`);
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

      // StatusLine detail with validation
      console.log(`\n${header("StatusLine (detailed):")}`);

      try {
        const { validateStatusLineSetup } = require("./installer/statusline-merger");
        const validation = validateStatusLineSetup();

        // Script existence
        console.log(`  ${validation.details.scriptExists ? ok("statusline.js installed") : fail("statusline.js not installed")}`);

        // Node path (relevant on Windows)
        if (process.platform === "win32") {
          console.log(`  ${validation.details.nodePathValid ? ok("Node.js path valid") : fail("Node.js path invalid")}`);
        }

        // Settings.json configuration
        console.log(`  ${validation.details.settingsConfigured ? ok("StatusLine configured in settings.json") : warn("StatusLine not configured in settings.json")}`);

        // Settings mode detection
        const settingsPath = join(homedir(), ".claude", "settings.json");
        if (existsSync(settingsPath)) {
          const settings = JSON.parse(require("node:fs").readFileSync(settingsPath, "utf-8"));
          if (settings.statusLine) {
            const cmd = settings.statusLine.command || "";
            const isWrapper = cmd.includes("statusline-wrapper");
            const isOurs = cmd.includes("oh-my-claude");
            if (isWrapper) {
              console.log(`    Mode: ${c.yellow}Merged (wrapper)${c.reset}`);
            } else if (isOurs) {
              console.log(`    Mode: ${c.green}Direct${c.reset}`);
            } else {
              console.log(`    Mode: ${c.cyan}External${c.reset}`);
            }
          }
        }

        // Command execution test
        console.log(`  ${validation.details.commandWorks ? ok("StatusLine command works") : fail("StatusLine command failed")}`);

        // Config file check
        const configDir = join(homedir(), ".config", "oh-my-claude");
        const configPath = join(configDir, "statusline.json");
        const configExists = existsSync(configPath);
        console.log(`  ${configExists ? ok("StatusLine config exists") : warn("StatusLine config not found")}`);
        if (configExists) {
          console.log(`    Path: ${dimText(configPath)}`);
        } else {
          console.log(`    ${dimText(`Expected: ${configPath}`)}`);
        }

        // Show any warnings
        if (validation.warnings.length > 0) {
          console.log(`\n  ${subheader("Warnings:")}`);
          for (const w of validation.warnings) {
            console.log(`    ${warn(w)}`);
          }
        }

        // Show any errors
        if (validation.errors.length > 0) {
          console.log(`\n  ${subheader("Errors:")}`);
          for (const e of validation.errors) {
            console.log(`    ${fail(e)}`);
          }
        }

        // Overall status
        console.log(`\n  Overall: ${validation.valid ? `${c.green}✓ Healthy${c.reset}` : `${c.red}✗ Issues detected${c.reset}`}`);
      } catch (error) {
        console.log(`  ${fail("Failed to validate StatusLine:")} ${error}`);
      }
    }

    // Check companion tools
    if (detail) {
      console.log(`\n${header("Companion Tools:")}`);

      // Check UI UX Pro Max
      const skillDir = join(homedir(), ".claude", "skills", "ui-ux-pro-max");
      const skillExists = existsSync(skillDir);
      console.log(`  ${skillExists ? ok("UI UX Pro Max skill") : dimText("○ UI UX Pro Max (not installed)")}`);
      if (skillExists) {
        const skillMd = join(skillDir, "SKILL.md");
        console.log(`    Path: ${dimText(skillDir)}`);
        console.log(`    SKILL.md: ${existsSync(skillMd) ? `${c.green}found${c.reset}` : `${c.red}missing${c.reset}`}`);
      }

      // Check CCometixLine
      let cclineInstalled = false;
      try {
        require("node:child_process").execSync("which ccline", { stdio: "pipe" });
        cclineInstalled = true;
      } catch { /* not installed */ }
      console.log(`  ${cclineInstalled ? ok("CCometixLine") : dimText("○ CCometixLine (not installed)")}`);

      // Check output styles
      const stylesDir = join(homedir(), ".claude", "output-styles");
      const stylesExist = existsSync(stylesDir);
      if (stylesExist) {
        const styleCount = require("node:fs").readdirSync(stylesDir).filter((f: string) => f.endsWith(".md")).length;
        console.log(`  ${ok(`Output styles: ${styleCount} style(s)`)}`);
      } else {
        console.log(`  ${dimText("○ Output styles (not deployed)")}`);
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

      if (detail) {
        // Separate Task tool agents (Claude subscription) from MCP agents (external APIs)
        const taskToolAgents: [string, any][] = [];
        const mcpAgents: [string, any][] = [];

        for (const [name, agentConfig] of Object.entries(config.agents)) {
          const provider = (agentConfig as any).provider;
          const providerConfig = config.providers[provider];
          if (providerConfig?.type === "claude-subscription") {
            taskToolAgents.push([name, agentConfig]);
          } else {
            mcpAgents.push([name, agentConfig]);
          }
        }

        if (taskToolAgents.length > 0) {
          console.log(`\n  ${subheader("Task tool agents:")} ${c.dim}(model managed by Claude Code)${c.reset}`);
          for (const [name] of taskToolAgents) {
            console.log(`    ${dimText("-")} ${c.bold}${name}${c.reset}`);
          }
        }

        if (mcpAgents.length > 0) {
          console.log(`\n  ${subheader("MCP background agents:")}`);
          for (const [name, agentConfig] of mcpAgents) {
            console.log(`    ${dimText("-")} ${c.bold}${name}${c.reset}: ${c.cyan}${(agentConfig as any).provider}${c.reset}/${c.blue}${(agentConfig as any).model}${c.reset}`);
          }
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

// StatusLine command with subcommands
const statuslineCmd = program
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

    const ok = (text: string) => `${c.green}✓${c.reset} ${text}`;
    const fail = (text: string) => `${c.red}✗${c.reset} ${text}`;
    const warn = (text: string) => `${c.yellow}!${c.reset} ${text}`;

    const settingsPath = join(homedir(), ".claude", "settings.json");
    const configPath = join(homedir(), ".config", "oh-my-claude", "statusline.json");

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

        // Show config details
        if (existsSync(configPath)) {
          const config = JSON.parse(readFileSync(configPath, "utf-8"));
          console.log(`\n${c.bold}Configuration${c.reset}`);
          console.log(`  Preset: ${c.cyan}${config.preset || "standard"}${c.reset}`);
          console.log(`  Enabled segments:`);
          const segments = config.segments || {};
          for (const [id, seg] of Object.entries(segments)) {
            const s = seg as { enabled: boolean; position: number };
            if (s.enabled) {
              console.log(`    ${c.green}●${c.reset} ${id}`);
            }
          }
          console.log(`  Disabled segments:`);
          for (const [id, seg] of Object.entries(segments)) {
            const s = seg as { enabled: boolean; position: number };
            if (!s.enabled) {
              console.log(`    ${c.dim}○${c.reset} ${id}`);
            }
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

// Statusline preset subcommand
statuslineCmd
  .command("preset <name>")
  .description("Set statusline preset (minimal, standard, full)")
  .action((name: string) => {
    const validPresets = ["minimal", "standard", "full"];
    if (!validPresets.includes(name)) {
      console.log(`Invalid preset: ${name}`);
      console.log(`Valid presets: ${validPresets.join(", ")}`);
      process.exit(1);
    }

    const { setPreset } = require("./statusline/config");

    try {
      const config = setPreset(name as "minimal" | "standard" | "full");
      console.log(`✓ Preset changed to: ${name}`);
      console.log(`\nEnabled segments:`);

      const segments = config.segments || {};
      for (const [id, seg] of Object.entries(segments)) {
        const s = seg as { enabled: boolean };
        if (s.enabled) {
          console.log(`  ● ${id}`);
        }
      }
    } catch (error) {
      console.log(`✗ Failed to set preset: ${error}`);
      process.exit(1);
    }
  });

// Statusline toggle subcommand
statuslineCmd
  .command("toggle <segment> [state]")
  .description("Toggle a segment on/off (model, git, directory, context, session, output-style, mcp, memory, proxy)")
  .action((segment: string, state?: string) => {
    const validSegments = ["model", "git", "directory", "context", "session", "output-style", "mcp", "memory", "proxy"];
    if (!validSegments.includes(segment)) {
      console.log(`Invalid segment: ${segment}`);
      console.log(`Valid segments: ${validSegments.join(", ")}`);
      process.exit(1);
    }

    const { toggleSegment, loadConfig } = require("./statusline/config");

    try {
      // Determine new state
      let enabled: boolean;
      if (state === "on" || state === "true" || state === "1") {
        enabled = true;
      } else if (state === "off" || state === "false" || state === "0") {
        enabled = false;
      } else if (state === undefined) {
        // Toggle current state
        const currentConfig = loadConfig();
        enabled = !currentConfig.segments[segment]?.enabled;
      } else {
        console.log(`Invalid state: ${state}`);
        console.log(`Valid states: on, off (or omit to toggle)`);
        process.exit(1);
      }

      const config = toggleSegment(segment, enabled);
      const newState = config.segments[segment]?.enabled ? "enabled" : "disabled";
      console.log(`✓ Segment "${segment}" ${newState}`);
    } catch (error) {
      console.log(`✗ Failed to toggle segment: ${error}`);
      process.exit(1);
    }
  });

// Style command with subcommands
const styleCmd = program
  .command("style")
  .description("Manage output styles for Claude Code")
  .action(() => {
    // No subcommand - show usage
    const { getActiveStyle, listStyles } = require("./styles");

    const useColor = process.stdout.isTTY;
    const c = {
      reset: useColor ? "\x1b[0m" : "",
      bold: useColor ? "\x1b[1m" : "",
      dim: useColor ? "\x1b[2m" : "",
      green: useColor ? "\x1b[32m" : "",
      cyan: useColor ? "\x1b[36m" : "",
      yellow: useColor ? "\x1b[33m" : "",
    };

    const active = getActiveStyle();
    console.log(`${c.bold}Output Style Manager${c.reset}\n`);
    console.log(`Active style: ${active ? `${c.green}${active}${c.reset}` : `${c.dim}(default)${c.reset}`}`);
    console.log(`\nUsage:`);
    console.log(`  oh-my-claude style list              ${c.dim}# List available styles${c.reset}`);
    console.log(`  oh-my-claude style set <name>        ${c.dim}# Switch output style${c.reset}`);
    console.log(`  oh-my-claude style show [name]       ${c.dim}# Show style content${c.reset}`);
    console.log(`  oh-my-claude style reset             ${c.dim}# Reset to Claude default${c.reset}`);
    console.log(`  oh-my-claude style create <name>     ${c.dim}# Create a custom style${c.reset}`);
  });

// Style list subcommand
styleCmd
  .command("list")
  .description("List all available output styles")
  .action(() => {
    const { listStyles, getActiveStyle } = require("./styles");

    const useColor = process.stdout.isTTY;
    const c = {
      reset: useColor ? "\x1b[0m" : "",
      bold: useColor ? "\x1b[1m" : "",
      dim: useColor ? "\x1b[2m" : "",
      green: useColor ? "\x1b[32m" : "",
      cyan: useColor ? "\x1b[36m" : "",
      yellow: useColor ? "\x1b[33m" : "",
      magenta: useColor ? "\x1b[35m" : "",
    };

    const styles = listStyles();
    const active = getActiveStyle();

    console.log(`${c.bold}${c.magenta}Available Output Styles${c.reset}\n`);

    if (styles.length === 0) {
      console.log(`  ${c.dim}No styles found. Run 'oh-my-claude install' to deploy built-in styles.${c.reset}`);
      return;
    }

    for (const style of styles) {
      const isActive = style.name === active;
      const marker = isActive ? `${c.green}● ` : "  ";
      const tag = style.source === "built-in" ? `${c.cyan}[built-in]${c.reset}` : `${c.yellow}[custom]${c.reset}`;
      const activeLabel = isActive ? ` ${c.green}(active)${c.reset}` : "";

      console.log(`${marker}${c.bold}${style.name}${c.reset}${activeLabel} ${tag}`);
      if (style.description) {
        console.log(`    ${c.dim}${style.description}${c.reset}`);
      }
    }

    console.log(`\n${c.dim}Use 'oh-my-claude style set <name>' to switch styles.${c.reset}`);
  });

// Style set subcommand
styleCmd
  .command("set <name>")
  .description("Set the active output style")
  .action((name: string) => {
    const { setActiveStyle } = require("./styles");

    const useColor = process.stdout.isTTY;
    const c = {
      reset: useColor ? "\x1b[0m" : "",
      green: useColor ? "\x1b[32m" : "",
      red: useColor ? "\x1b[31m" : "",
      dim: useColor ? "\x1b[2m" : "",
    };

    const result = setActiveStyle(name);
    if (result.success) {
      console.log(`${c.green}✓${c.reset} Output style set to: ${name}`);
      console.log(`\n${c.dim}Restart Claude Code for the change to take effect.${c.reset}`);
    } else {
      console.log(`${c.red}✗${c.reset} ${result.error}`);
      process.exit(1);
    }
  });

// Style show subcommand
styleCmd
  .command("show [name]")
  .description("Show the content of an output style")
  .action((name?: string) => {
    const { getStyle, getActiveStyle } = require("./styles");

    const useColor = process.stdout.isTTY;
    const c = {
      reset: useColor ? "\x1b[0m" : "",
      bold: useColor ? "\x1b[1m" : "",
      dim: useColor ? "\x1b[2m" : "",
      red: useColor ? "\x1b[31m" : "",
      cyan: useColor ? "\x1b[36m" : "",
    };

    // Default to active style
    const styleName = name || getActiveStyle();
    if (!styleName) {
      console.log(`${c.red}✗${c.reset} No style specified and no active style set.`);
      console.log(`${c.dim}Usage: oh-my-claude style show <name>${c.reset}`);
      process.exit(1);
    }

    const style = getStyle(styleName);
    if (!style) {
      console.log(`${c.red}✗${c.reset} Style "${styleName}" not found.`);
      process.exit(1);
    }

    console.log(`${c.bold}${style.name}${c.reset} ${c.dim}[${style.source}]${c.reset}`);
    console.log(`${c.cyan}${style.description}${c.reset}`);
    console.log(`${c.dim}Path: ${style.path}${c.reset}`);
    console.log(`${"─".repeat(60)}`);
    console.log(style.body);
  });

// Style reset subcommand
styleCmd
  .command("reset")
  .description("Reset to Claude Code's default output style")
  .action(() => {
    const { resetStyle } = require("./styles");

    const useColor = process.stdout.isTTY;
    const c = {
      reset: useColor ? "\x1b[0m" : "",
      green: useColor ? "\x1b[32m" : "",
      red: useColor ? "\x1b[31m" : "",
      dim: useColor ? "\x1b[2m" : "",
    };

    const result = resetStyle();
    if (result.success) {
      console.log(`${c.green}✓${c.reset} Output style reset to Claude Code default.`);
      console.log(`\n${c.dim}Restart Claude Code for the change to take effect.${c.reset}`);
    } else {
      console.log(`${c.red}✗${c.reset} ${result.error}`);
      process.exit(1);
    }
  });

// Style create subcommand
styleCmd
  .command("create <name>")
  .description("Create a new custom output style from template")
  .action((name: string) => {
    const { createStyle } = require("./styles");

    const useColor = process.stdout.isTTY;
    const c = {
      reset: useColor ? "\x1b[0m" : "",
      green: useColor ? "\x1b[32m" : "",
      red: useColor ? "\x1b[31m" : "",
      dim: useColor ? "\x1b[2m" : "",
      cyan: useColor ? "\x1b[36m" : "",
    };

    const result = createStyle(name);
    if (result.success) {
      console.log(`${c.green}✓${c.reset} Custom style "${name}" created.`);
      console.log(`  Path: ${c.cyan}${result.path}${c.reset}`);
      console.log(`\n${c.dim}Edit the file to customize your style, then run:${c.reset}`);
      console.log(`  oh-my-claude style set ${name}`);
    } else {
      console.log(`${c.red}✗${c.reset} ${result.error}`);
      process.exit(1);
    }
  });

// Memory command with subcommands
const memoryCmd = program
  .command("memory")
  .description("Manage oh-my-claude memory system")
  .action(() => {
    const { getMemoryStats } = require("./memory");

    const useColor = process.stdout.isTTY;
    const c = {
      reset: useColor ? "\x1b[0m" : "",
      bold: useColor ? "\x1b[1m" : "",
      dim: useColor ? "\x1b[2m" : "",
      green: useColor ? "\x1b[32m" : "",
      cyan: useColor ? "\x1b[36m" : "",
    };

    const stats = getMemoryStats();
    console.log(`${c.bold}Memory System${c.reset}\n`);
    console.log(`  Total memories: ${c.green}${stats.total}${c.reset}`);
    console.log(`  Notes: ${stats.byType.note}  |  Sessions: ${stats.byType.session}`);
    console.log(`  Storage: ${(stats.totalSizeBytes / 1024).toFixed(1)} KB`);
    console.log(`  Path: ${c.dim}${stats.storagePath}${c.reset}`);
    console.log(`\nUsage:`);
    console.log(`  oh-my-claude memory status             ${c.dim}# Show memory stats${c.reset}`);
    console.log(`  oh-my-claude memory search <query>     ${c.dim}# Search memories${c.reset}`);
    console.log(`  oh-my-claude memory list [--type note]  ${c.dim}# List memories${c.reset}`);
    console.log(`  oh-my-claude memory show <id>          ${c.dim}# Show memory content${c.reset}`);
    console.log(`  oh-my-claude memory delete <id>        ${c.dim}# Delete a memory${c.reset}`);
  });

// Memory status subcommand
memoryCmd
  .command("status")
  .description("Show memory store statistics")
  .action(() => {
    const { getMemoryStats } = require("./memory");

    const useColor = process.stdout.isTTY;
    const c = {
      reset: useColor ? "\x1b[0m" : "",
      bold: useColor ? "\x1b[1m" : "",
      dim: useColor ? "\x1b[2m" : "",
      green: useColor ? "\x1b[32m" : "",
      cyan: useColor ? "\x1b[36m" : "",
      magenta: useColor ? "\x1b[35m" : "",
    };

    const stats = getMemoryStats();

    console.log(`${c.bold}${c.magenta}Memory Status${c.reset}\n`);
    console.log(`  Total memories:  ${c.green}${stats.total}${c.reset}`);
    console.log(`  Notes:           ${stats.byType.note}`);
    console.log(`  Sessions:        ${stats.byType.session}`);
    console.log(`  Total size:      ${(stats.totalSizeBytes / 1024).toFixed(1)} KB`);
    console.log(`  Storage path:    ${c.dim}${stats.storagePath}${c.reset}`);
  });

// Memory search subcommand
memoryCmd
  .command("search <query>")
  .description("Search memories by text query")
  .option("--type <type>", "Filter by type (note, session)")
  .option("--limit <n>", "Max results (default: 10)", "10")
  .action((query: string, options: { type?: string; limit: string }) => {
    const { searchMemories } = require("./memory");

    const useColor = process.stdout.isTTY;
    const c = {
      reset: useColor ? "\x1b[0m" : "",
      bold: useColor ? "\x1b[1m" : "",
      dim: useColor ? "\x1b[2m" : "",
      green: useColor ? "\x1b[32m" : "",
      cyan: useColor ? "\x1b[36m" : "",
      yellow: useColor ? "\x1b[33m" : "",
      magenta: useColor ? "\x1b[35m" : "",
    };

    const results = searchMemories({
      query,
      type: options.type as any,
      limit: parseInt(options.limit, 10) || 10,
      sort: "relevance",
    });

    console.log(`${c.bold}${c.magenta}Memory Search${c.reset}: "${query}"\n`);

    if (results.length === 0) {
      console.log(`  ${c.dim}No memories found matching "${query}".${c.reset}`);
      return;
    }

    console.log(`  ${c.green}${results.length}${c.reset} result(s):\n`);

    for (const r of results) {
      const typeTag = r.entry.type === "note" ? `${c.cyan}[note]${c.reset}` : `${c.yellow}[session]${c.reset}`;
      const score = `${c.dim}(score: ${r.score})${c.reset}`;
      console.log(`  ${c.bold}${r.entry.title}${c.reset} ${typeTag} ${score}`);
      console.log(`    ID: ${c.dim}${r.entry.id}${c.reset}`);
      if (r.entry.tags.length > 0) {
        console.log(`    Tags: ${r.entry.tags.join(", ")}`);
      }
      // Show preview
      const preview = r.entry.content.split("\n").slice(0, 2).join(" ").slice(0, 120);
      console.log(`    ${c.dim}${preview}${preview.length >= 120 ? "..." : ""}${c.reset}`);
      console.log();
    }
  });

// Memory list subcommand
memoryCmd
  .command("list")
  .description("List stored memories")
  .option("--type <type>", "Filter by type (note, session)")
  .option("--limit <n>", "Max results (default: 20)", "20")
  .action((options: { type?: string; limit: string }) => {
    const { listMemories } = require("./memory");

    const useColor = process.stdout.isTTY;
    const c = {
      reset: useColor ? "\x1b[0m" : "",
      bold: useColor ? "\x1b[1m" : "",
      dim: useColor ? "\x1b[2m" : "",
      green: useColor ? "\x1b[32m" : "",
      cyan: useColor ? "\x1b[36m" : "",
      yellow: useColor ? "\x1b[33m" : "",
      magenta: useColor ? "\x1b[35m" : "",
    };

    const entries = listMemories({
      type: options.type as any,
      limit: parseInt(options.limit, 10) || 20,
    });

    console.log(`${c.bold}${c.magenta}Stored Memories${c.reset}\n`);

    if (entries.length === 0) {
      console.log(`  ${c.dim}No memories found.${c.reset}`);
      console.log(`  ${c.dim}Use MCP tool "remember" or create .md files in ~/.claude/oh-my-claude/memory/${c.reset}`);
      return;
    }

    for (const entry of entries) {
      const typeTag = entry.type === "note" ? `${c.cyan}[note]${c.reset}` : `${c.yellow}[session]${c.reset}`;
      const date = entry.createdAt.slice(0, 10);
      console.log(`  ${c.bold}${entry.title}${c.reset} ${typeTag}  ${c.dim}${date}${c.reset}`);
      console.log(`    ID: ${c.dim}${entry.id}${c.reset}`);
      if (entry.tags.length > 0) {
        console.log(`    Tags: ${entry.tags.join(", ")}`);
      }
    }

    console.log(`\n  ${c.dim}Total: ${entries.length} memor${entries.length === 1 ? "y" : "ies"}${c.reset}`);
  });

// Memory show subcommand
memoryCmd
  .command("show <id>")
  .description("Show full content of a memory")
  .action((id: string) => {
    const { getMemory } = require("./memory");

    const useColor = process.stdout.isTTY;
    const c = {
      reset: useColor ? "\x1b[0m" : "",
      bold: useColor ? "\x1b[1m" : "",
      dim: useColor ? "\x1b[2m" : "",
      green: useColor ? "\x1b[32m" : "",
      cyan: useColor ? "\x1b[36m" : "",
      red: useColor ? "\x1b[31m" : "",
    };

    const result = getMemory(id);
    if (!result.success || !result.data) {
      console.log(`${c.red}✗${c.reset} ${result.error || `Memory "${id}" not found`}`);
      process.exit(1);
    }

    const entry = result.data;
    console.log(`${c.bold}${entry.title}${c.reset} ${c.dim}[${entry.type}]${c.reset}`);
    console.log(`ID: ${c.dim}${entry.id}${c.reset}`);
    console.log(`Created: ${c.dim}${entry.createdAt}${c.reset}`);
    console.log(`Updated: ${c.dim}${entry.updatedAt}${c.reset}`);
    if (entry.tags.length > 0) {
      console.log(`Tags: ${entry.tags.join(", ")}`);
    }
    console.log(`${"─".repeat(60)}`);
    console.log(entry.content);
  });

// Memory delete subcommand
memoryCmd
  .command("delete <id>")
  .description("Delete a memory by ID")
  .action((id: string) => {
    const { deleteMemory } = require("./memory");

    const useColor = process.stdout.isTTY;
    const c = {
      reset: useColor ? "\x1b[0m" : "",
      green: useColor ? "\x1b[32m" : "",
      red: useColor ? "\x1b[31m" : "",
    };

    const result = deleteMemory(id);
    if (result.success) {
      console.log(`${c.green}✓${c.reset} Memory "${id}" deleted.`);
    } else {
      console.log(`${c.red}✗${c.reset} ${result.error}`);
      process.exit(1);
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
      {
        name: "UI UX Pro Max",
        value: "uipro",
        description: "AI design intelligence skill - 67 styles, 96 palettes, 57 font pairings",
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
          const wrapperPath = join(homedir(), ".claude", "oh-my-claude", "statusline-wrapper.js");
          const omcStatusline = join(homedir(), ".claude", "oh-my-claude", "dist", "statusline", "statusline.js");
          const wrapperContent = `#!/usr/bin/env node
/**
 * oh-my-claude + CCometixLine StatusLine Wrapper
 * Auto-generated - combines ccline and oh-my-claude statuslines
 */

const { execSync } = require("node:child_process");
const { join } = require("node:path");
const { homedir } = require("node:os");

const omcStatusline = ${JSON.stringify(omcStatusline)};

try {
  // Read input from stdin
  let input = "";
  process.stdin.setEncoding("utf-8");
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  // Call ccline (CCometixLine)
  let cclineOutput = "";
  try {
    cclineOutput = execSync("ccline", {
      input,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    }).trim();
  } catch {
    // Ignore errors
  }

  // Call oh-my-claude statusline
  let omcOutput = "";
  try {
    omcOutput = execSync(\`node "\${omcStatusline}"\`, {
      input,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    }).trim();
  } catch {
    omcOutput = "omc";
  }

  // Combine outputs - ccline first, omc second
  if (cclineOutput && omcOutput) {
    console.log(cclineOutput);
    console.log(omcOutput);
  } else if (cclineOutput) {
    console.log(cclineOutput);
  } else if (omcOutput) {
    console.log(omcOutput);
  }
} catch (error) {
  // Silently fail
  console.error(error);
}
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

      if (toolValue === "uipro") {
        const { existsSync } = await import("node:fs");

        // Check prerequisites
        let hasPython = false;
        try {
          execSync("python3 --version", { stdio: "pipe" });
          hasPython = true;
        } catch {
          try {
            execSync("python --version", { stdio: "pipe" });
            hasPython = true;
          } catch {
            // No Python
          }
        }

        if (!hasPython) {
          console.log(fail("Python 3 is required for UI UX Pro Max"));
          console.log(dimText("Install Python 3 from https://python.org/ and try again."));
          continue;
        }

        // Check if already installed
        let alreadyInstalled = false;
        try {
          execSync("npx uipro-cli --help", { stdio: "pipe", timeout: 15000 });
          alreadyInstalled = true;
        } catch {
          // Not installed
        }

        // Also check if skill files exist
        const skillDir = join(homedir(), ".claude", "skills", "ui-ux-pro-max");
        const skillExists = existsSync(skillDir);

        if (alreadyInstalled || skillExists) {
          const reinstall = await confirm({
            message: "UI UX Pro Max already installed. Reinstall?",
            default: false,
          });

          if (!reinstall) {
            console.log(dimText("Keeping existing UI UX Pro Max installation."));
            continue;
          }
        }

        // Step 1: Install uipro-cli globally
        console.log("Installing UI UX Pro Max CLI...");
        try {
          execSync("npm install -g uipro-cli", { stdio: "inherit", timeout: 60000 });
          console.log(ok("uipro-cli installed"));
        } catch (error) {
          console.log(fail("Failed to install uipro-cli"));
          console.log(dimText("Try manually: npm install -g uipro-cli"));
          continue;
        }

        // Step 2: Initialize for Claude Code
        console.log("Initializing UI UX Pro Max for Claude Code...");
        try {
          execSync("npx uipro-cli init --ai claude", { stdio: "inherit", timeout: 60000 });
          console.log(ok("UI UX Pro Max initialized for Claude Code"));
        } catch (error) {
          console.log(fail("Failed to initialize UI UX Pro Max"));
          console.log(dimText("Try manually: npx uipro-cli init --ai claude"));
          continue;
        }

        console.log();
        console.log(ok("UI UX Pro Max installed successfully!"));
        console.log(dimText("Skills installed to ~/.claude/skills/ui-ux-pro-max/"));
        console.log(dimText("Use it by asking Claude about UI/UX design, styles, or color palettes."));
      }
    }

    console.log();
    console.log(warn("Please restart Claude Code to activate changes."));
  });

// Proxy command with subcommands
const proxyCmd = program
  .command("proxy")
  .description("Manage the live model switching proxy")
  .action(() => {
    const { readSwitchState } = require("./proxy/state");
    const { readAuthConfig } = require("./proxy/auth");

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

    const state = readSwitchState();
    const auth = readAuthConfig();

    console.log(`${c.bold}Proxy Status${c.reset}\n`);
    console.log(`  Auth configured: ${auth ? `${c.green}Yes${c.reset}` : `${c.red}No${c.reset}`}`);
    console.log(`  Switch state:    ${state.switched ? `${c.yellow}Switched → ${state.provider}/${state.model}${c.reset}` : `${c.green}Passthrough (native Claude)${c.reset}`}`);

    if (state.switched) {
      console.log(`  Remaining:       ${state.requestsRemaining === 0 ? "unlimited" : state.requestsRemaining}`);
      if (state.timeoutAt) {
        const remaining = Math.max(0, state.timeoutAt - Date.now());
        const seconds = Math.floor(remaining / 1000);
        console.log(`  Timeout in:      ${seconds}s`);
      }
    }

    console.log(`\nUsage:`);
    console.log(`  oh-my-claude proxy start              ${c.dim}# Start proxy server${c.reset}`);
    console.log(`  oh-my-claude proxy stop               ${c.dim}# Stop proxy server${c.reset}`);
    console.log(`  oh-my-claude proxy status             ${c.dim}# Show proxy state${c.reset}`);
    console.log(`  oh-my-claude proxy enable             ${c.dim}# Enable proxy, configure auth${c.reset}`);
    console.log(`  oh-my-claude proxy disable            ${c.dim}# Disable proxy${c.reset}`);
  });

// Proxy start subcommand
proxyCmd
  .command("start")
  .description("Start the proxy server as a background daemon")
  .option("--port <port>", "Proxy port (default: 18910)")
  .option("--control-port <port>", "Control API port (default: 18911)")
  .option("--foreground", "Run in foreground (for debugging)")
  .action(async (options) => {
    const { execSync, spawn } = require("node:child_process");
    const { existsSync, writeFileSync } = require("node:fs");
    const { join } = require("node:path");
    const { homedir } = require("node:os");
    const http = require("node:http");

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
    const dimText = (text: string) => `${c.dim}${text}${c.reset}`;

    // Cross-platform health check via Node http module
    const checkHealth = (controlPort: string): Promise<any> => {
      return new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${controlPort}/health`, { timeout: 2000 }, (res: any) => {
          let data = "";
          res.on("data", (chunk: string) => { data += chunk; });
          res.on("end", () => {
            try { resolve(JSON.parse(data)); } catch { reject(new Error("Invalid JSON")); }
          });
        });
        req.on("error", reject);
        req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
      });
    };

    // Find proxy server script
    const installDir = join(homedir(), ".claude", "oh-my-claude");
    const proxyScript = join(installDir, "dist", "proxy", "server.js");
    const pidFile = join(installDir, "proxy.pid");

    if (!existsSync(proxyScript)) {
      console.log(fail("Proxy server script not found."));
      console.log(dimText("Run 'oh-my-claude install' first to deploy proxy server."));
      process.exit(1);
    }

    const port = options.port ?? "18910";
    const controlPort = options.controlPort ?? "18911";

    // Check if already running
    try {
      const parsed = await checkHealth(controlPort);
      if (parsed.status === "ok") {
        console.log(ok(`Proxy already running (uptime: ${parsed.uptimeHuman})`));
        return;
      }
    } catch {
      // Not running — continue to start
    }

    if (options.foreground) {
      // Run in foreground
      console.log(`Starting proxy in foreground...`);
      console.log(dimText(`Port: ${port}, Control: ${controlPort}\n`));
      try {
        execSync(`bun run "${proxyScript}" --port ${port} --control-port ${controlPort}`, {
          stdio: "inherit",
        });
      } catch {
        // Process exited
      }
    } else {
      // Run as background daemon
      const isWindows = process.platform === "win32";
      const child = spawn("bun", ["run", proxyScript, "--port", port, "--control-port", controlPort], {
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
        env: { ...process.env },
        ...(isWindows ? { shell: true, windowsHide: true } : {}),
      });
      child.unref();

      // Save PID for cross-platform stop
      if (child.pid) {
        try { writeFileSync(pidFile, String(child.pid), "utf-8"); } catch {}
      }

      // Wait briefly and check if it started
      await new Promise((resolve) => setTimeout(resolve, 1500));
      try {
        const parsed = await checkHealth(controlPort);
        if (parsed.status === "ok") {
          console.log(ok("Proxy server started"));
          console.log(`  Proxy:   ${c.cyan}http://localhost:${port}${c.reset}`);
          console.log(`  Control: ${c.cyan}http://localhost:${controlPort}${c.reset}`);
          console.log(`  PID:     ${child.pid}`);
          console.log(`\n${dimText("Set in your shell:")}`);
          if (isWindows) {
            console.log(`  ${c.cyan}set ANTHROPIC_BASE_URL=http://localhost:${port}${c.reset}`);
          } else {
            console.log(`  ${c.cyan}export ANTHROPIC_BASE_URL=http://localhost:${port}${c.reset}`);
          }
        } else {
          console.log(fail("Proxy started but health check failed"));
        }
      } catch {
        // May just need more time
        console.log(ok(`Proxy server starting (PID: ${child.pid})`));
        console.log(`  Proxy:   ${c.cyan}http://localhost:${port}${c.reset}`);
        console.log(`  Control: ${c.cyan}http://localhost:${controlPort}${c.reset}`);
        console.log(`\n${dimText("Set in your shell:")}`);
        if (isWindows) {
          console.log(`  ${c.cyan}set ANTHROPIC_BASE_URL=http://localhost:${port}${c.reset}`);
        } else {
          console.log(`  ${c.cyan}export ANTHROPIC_BASE_URL=http://localhost:${port}${c.reset}`);
        }
      }
    }
  });

// Proxy stop subcommand
proxyCmd
  .command("stop")
  .description("Stop the proxy server")
  .action(() => {
    const { execSync } = require("node:child_process");
    const { existsSync, readFileSync, unlinkSync } = require("node:fs");
    const { join } = require("node:path");
    const { homedir } = require("node:os");

    const useColor = process.stdout.isTTY;
    const c = {
      reset: useColor ? "\x1b[0m" : "",
      green: useColor ? "\x1b[32m" : "",
      red: useColor ? "\x1b[31m" : "",
      dim: useColor ? "\x1b[2m" : "",
    };
    const ok = (text: string) => `${c.green}✓${c.reset} ${text}`;
    const fail = (text: string) => `${c.red}✗${c.reset} ${text}`;

    const installDir = join(homedir(), ".claude", "oh-my-claude");
    const pidFile = join(installDir, "proxy.pid");
    const isWindows = process.platform === "win32";
    let killed = false;

    // 1. Try PID file first (cross-platform)
    if (existsSync(pidFile)) {
      try {
        const pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
        if (pid) {
          try {
            process.kill(pid, "SIGTERM");
            killed = true;
          } catch {
            // Process may have already exited
          }
        }
      } catch {}
      try { unlinkSync(pidFile); } catch {}
    }

    // 2. Fallback: platform-specific process discovery
    if (!killed) {
      try {
        if (isWindows) {
          // On Windows, use wmic/tasklist to find bun processes running proxy/server.js
          const output = execSync(
            'wmic process where "CommandLine like \'%proxy/server.js%\' and Name like \'%bun%\'" get ProcessId /format:list',
            { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
          ).trim();
          const pids = output.match(/ProcessId=(\d+)/g);
          if (pids && pids.length > 0) {
            for (const match of pids) {
              const pid = parseInt(match.replace("ProcessId=", ""), 10);
              try {
                process.kill(pid, "SIGTERM");
                killed = true;
              } catch {}
            }
          }
        } else {
          const pids = execSync("pgrep -f 'proxy/server.js'", {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          }).trim();
          if (pids) {
            for (const pid of pids.split("\n")) {
              try {
                process.kill(parseInt(pid, 10), "SIGTERM");
                killed = true;
              } catch {}
            }
          }
        }
      } catch {
        // No process found via platform-specific method
      }
    }

    if (killed) {
      console.log(ok("Proxy server stopped"));
    } else {
      console.log(fail("No proxy server process found"));
    }

    // Also reset switch state
    try {
      const { resetSwitchState } = require("./proxy/state");
      resetSwitchState();
    } catch {
      // State module may not be available
    }
  });

// Proxy status subcommand
proxyCmd
  .command("status")
  .description("Show proxy server and switch state")
  .action(async () => {
    const { readSwitchState } = require("./proxy/state");
    const { readAuthConfig } = require("./proxy/auth");
    const http = require("node:http");

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

    console.log(`${c.bold}Proxy Status${c.reset}\n`);

    // Cross-platform health check via Node http module
    const checkHealth = (): Promise<any> => {
      return new Promise((resolve, reject) => {
        const req = http.get("http://localhost:18911/health", { timeout: 2000 }, (res: any) => {
          let data = "";
          res.on("data", (chunk: string) => { data += chunk; });
          res.on("end", () => {
            try { resolve(JSON.parse(data)); } catch { reject(new Error("Invalid JSON")); }
          });
        });
        req.on("error", reject);
        req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
      });
    };

    // Check if server is running
    let serverRunning = false;
    try {
      const parsed = await checkHealth();
      if (parsed.status === "ok") {
        serverRunning = true;
        console.log(ok(`Server running (uptime: ${parsed.uptimeHuman}, requests: ${parsed.requestCount})`));
      }
    } catch {
      console.log(fail("Server not running"));
    }

    // Auth status
    const auth = readAuthConfig();
    console.log(`  Auth: ${auth ? ok("Configured") : fail("Not configured")}`);

    // Switch state
    const state = readSwitchState();
    if (state.switched) {
      console.log(`  Mode: ${c.yellow}Switched → ${state.provider}/${state.model}${c.reset}`);
      console.log(`    Remaining: ${state.requestsRemaining === 0 ? "unlimited" : state.requestsRemaining}`);
      if (state.timeoutAt) {
        const remaining = Math.max(0, state.timeoutAt - Date.now());
        console.log(`    Timeout in: ${Math.floor(remaining / 1000)}s`);
      }
    } else {
      console.log(`  Mode: ${c.green}Passthrough (native Claude)${c.reset}`);
    }

    // Environment check
    const baseUrl = process.env.ANTHROPIC_BASE_URL;
    if (baseUrl?.includes("localhost:18910")) {
      console.log(`  Env: ${ok("ANTHROPIC_BASE_URL set correctly")}`);
    } else if (baseUrl) {
      console.log(`  Env: ${c.yellow}ANTHROPIC_BASE_URL=${baseUrl}${c.reset} (not pointing to proxy)`);
    } else {
      console.log(`  Env: ${c.dim}ANTHROPIC_BASE_URL not set${c.reset}`);
    }
  });

// Proxy enable subcommand
proxyCmd
  .command("enable")
  .description("Enable proxy and configure auth tokens")
  .action(() => {
    const { initializeAuth, getAuthConfigPath } = require("./proxy/auth");

    const useColor = process.stdout.isTTY;
    const c = {
      reset: useColor ? "\x1b[0m" : "",
      bold: useColor ? "\x1b[1m" : "",
      dim: useColor ? "\x1b[2m" : "",
      green: useColor ? "\x1b[32m" : "",
      red: useColor ? "\x1b[31m" : "",
      cyan: useColor ? "\x1b[36m" : "",
    };
    const ok = (text: string) => `${c.green}✓${c.reset} ${text}`;
    const fail = (text: string) => `${c.red}✗${c.reset} ${text}`;
    const dimText = (text: string) => `${c.dim}${text}${c.reset}`;

    try {
      const authConfig = initializeAuth();

      const modeLabel = authConfig.authMode === "oauth"
        ? `${c.cyan}OAuth${c.reset} (forwarding auth headers from Claude Code)`
        : `${c.cyan}API Key${c.reset} (captured ANTHROPIC_API_KEY)`;

      console.log(ok("Proxy auth configured"));
      console.log(`  Auth mode: ${modeLabel}`);
      console.log(`  Auth file: ${dimText(getAuthConfigPath())}`);

      console.log(`\n${c.bold}Next steps:${c.reset}`);
      console.log(`  1. Start the proxy:   ${c.cyan}oh-my-claude proxy start${c.reset}`);
      console.log(`  2. Set env variable:  ${c.cyan}export ANTHROPIC_BASE_URL=http://localhost:18910${c.reset}`);
      console.log(`  3. Start Claude Code — it will connect through the proxy`);
      console.log(`  4. Use MCP tool ${c.cyan}switch_model${c.reset} to switch providers in-conversation`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(fail(msg));
      process.exit(1);
    }
  });

// Proxy disable subcommand
proxyCmd
  .command("disable")
  .description("Disable proxy and revert environment")
  .action(() => {
    const { resetSwitchState } = require("./proxy/state");

    const useColor = process.stdout.isTTY;
    const c = {
      reset: useColor ? "\x1b[0m" : "",
      green: useColor ? "\x1b[32m" : "",
      dim: useColor ? "\x1b[2m" : "",
      cyan: useColor ? "\x1b[36m" : "",
    };
    const ok = (text: string) => `${c.green}✓${c.reset} ${text}`;
    const dimText = (text: string) => `${c.dim}${text}${c.reset}`;

    // Reset switch state
    resetSwitchState();

    // Stop the server
    try {
      const { execSync } = require("node:child_process");
      const pids = execSync("pgrep -f 'proxy/server.js'", {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();

      if (pids) {
        for (const pid of pids.split("\n")) {
          try { process.kill(parseInt(pid, 10), "SIGTERM"); } catch { /* */ }
        }
      }
    } catch {
      // No proxy running
    }

    console.log(ok("Proxy disabled"));
    console.log(`\n${dimText("Remove the environment variable:")}`);
    console.log(`  ${c.cyan}unset ANTHROPIC_BASE_URL${c.reset}`);
  });

// Proxy switch subcommand — manual model switching
proxyCmd
  .command("switch <provider> <model>")
  .description("Switch next N requests to a provider/model (e.g., proxy switch deepseek deepseek-reasoner)")
  .option("--requests <n>", "Number of requests to switch (default: 1, 0 = unlimited)", "1")
  .option("--timeout <ms>", "Timeout in ms before auto-revert (default: 600000)", "600000")
  .action((provider: string, model: string, options: { requests: string; timeout: string }) => {
    const { loadConfig, isProviderConfigured } = require("./config");
    const { writeSwitchState } = require("./proxy/state");
    const { DEFAULT_PROXY_CONFIG } = require("./proxy/types");

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
    const dimText = (text: string) => `${c.dim}${text}${c.reset}`;

    // Validate provider
    const config = loadConfig();
    const providerConfig = config.providers[provider];

    if (!providerConfig) {
      console.log(fail(`Unknown provider: "${provider}"`));
      console.log(`Available: ${Object.keys(config.providers).join(", ")}`);
      process.exit(1);
    }

    if (providerConfig.type === "claude-subscription") {
      console.log(fail(`Cannot switch to "${provider}" — it uses Claude subscription.`));
      console.log(dimText("Choose an external provider: deepseek, zhipu, minimax, openrouter"));
      process.exit(1);
    }

    if (!isProviderConfigured(config, provider)) {
      const envVar = providerConfig.api_key_env ?? `${provider.toUpperCase()}_API_KEY`;
      console.log(warn(`Provider "${provider}" API key not set (${envVar}). Requests will fallback to native Claude.`));
    }

    const requests = parseInt(options.requests, 10) || 1;
    const timeoutMs = parseInt(options.timeout, 10) || DEFAULT_PROXY_CONFIG.defaultTimeoutMs;
    const now = Date.now();

    writeSwitchState({
      switched: true,
      provider,
      model,
      requestsRemaining: requests,
      switchedAt: now,
      timeoutAt: now + timeoutMs,
    });

    // Also notify control API if running
    try {
      const { execSync } = require("node:child_process");
      execSync(
        `curl -s -X POST http://localhost:${DEFAULT_PROXY_CONFIG.controlPort}/switch ` +
        `-H "Content-Type: application/json" ` +
        `-d '${JSON.stringify({ provider, model, requests, timeout_ms: timeoutMs })}'`,
        { stdio: "pipe", timeout: 2000 }
      );
    } catch {
      // Control API may not be running — state file is primary
    }

    console.log(ok(`Switched to ${c.cyan}${provider}/${model}${c.reset}`));
    console.log(`  Requests: ${requests === 0 ? "unlimited" : requests}`);
    console.log(`  Timeout:  ${timeoutMs / 1000}s`);
    console.log(`\n${dimText("Next request(s) through the proxy will use this provider.")}`);
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
