#!/usr/bin/env node
/**
 * oh-my-claude CLI
 *
 * Usage:
 *   npx oh-my-claude install     # Install oh-my-claude
 *   npx oh-my-claude uninstall   # Uninstall oh-my-claude
 *   npx oh-my-claude status      # Check installation status
 *   npx oh-my-claude doctor      # Diagnose configuration issues
 */

import { program } from "commander";
import { install, uninstall, checkInstallation } from "./installer";
import { getProvidersStatus } from "./providers/router";
import { loadConfig } from "./config";

program
  .name("oh-my-claude")
  .description("Multi-agent orchestration plugin for Claude Code")
  .version("0.1.0");

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
  .action(() => {
    console.log("oh-my-claude Doctor\n");

    // Check installation
    const status = checkInstallation();
    console.log("Installation:");
    console.log(`  ${status.installed ? "✓" : "✗"} Core files installed`);
    console.log(`  ${status.components.agents ? "✓" : "✗"} Agent files generated`);
    console.log(`  ${status.components.hooks ? "✓" : "✗"} Hooks configured`);
    console.log(`  ${status.components.mcp ? "✓" : "✗"} MCP server configured`);
    console.log(`  ${status.components.config ? "✓" : "✗"} Configuration file exists`);

    // Check providers
    console.log("\nProviders:");
    try {
      const providers = getProvidersStatus();
      for (const [name, info] of Object.entries(providers)) {
        const icon = info.configured ? "✓" : "✗";
        const note = info.type === "claude-subscription" ? "(uses Claude subscription)" : "";
        console.log(`  ${icon} ${name} ${note}`);
      }
    } catch (error) {
      console.log("  ✗ Failed to check providers:", error);
    }

    // Check configuration
    console.log("\nConfiguration:");
    try {
      const config = loadConfig();
      console.log(`  ✓ Configuration loaded`);
      console.log(`  - ${Object.keys(config.agents).length} agents configured`);
      console.log(`  - ${Object.keys(config.categories).length} categories configured`);
      console.log(`  - Default concurrency: ${config.concurrency.default}`);
    } catch (error) {
      console.log("  ✗ Failed to load configuration:", error);
    }

    // Recommendations
    console.log("\nRecommendations:");

    const providers = getProvidersStatus();
    const unconfigured = Object.entries(providers)
      .filter(([_, info]) => !info.configured && info.type !== "claude-subscription")
      .map(([name]) => name);

    if (unconfigured.length > 0) {
      console.log(`  ⚠ Set API keys for: ${unconfigured.join(", ")}`);
    } else {
      console.log("  ✓ All providers configured");
    }

    if (!status.installed) {
      console.log("  ⚠ Run 'oh-my-claude install' to complete setup");
    }
  });

program.parse();
