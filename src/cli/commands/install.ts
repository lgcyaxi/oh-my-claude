/**
 * Install, Uninstall, and Status commands
 */

import type { Command } from "commander";
import { install, uninstall, checkInstallation } from "../../installer";

export function registerInstallCommands(program: Command) {
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
      if (result.commands.removed.length > 0) {
        console.log("  ↳ Removed deprecated:", result.commands.removed.map(c => `/${c}`).join(", "));
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

      // Report warnings
      if (result.warnings.length > 0) {
        console.log("\n⚠ Warnings:");
        for (const warning of result.warnings) {
          console.log(`  - ${warning}`);
        }
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
}
