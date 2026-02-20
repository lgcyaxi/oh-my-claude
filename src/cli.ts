/**
 * oh-my-claude CLI
 *
 * Thin orchestrator that imports and registers all command modules.
 *
 * Usage:
 *   npx oh-my-claude install      # Install oh-my-claude
 *   npx oh-my-claude uninstall    # Uninstall oh-my-claude
 *   npx oh-my-claude status       # Check installation status
 *   npx oh-my-claude doctor       # Diagnose configuration issues
 *   npx oh-my-claude update       # Update oh-my-claude to latest version
 *   npx oh-my-claude setup-mcp    # Install official MCP servers (MiniMax, GLM)
 *   npx oh-my-claude setup-tools  # Install companion tools (CCometixLine)
 *   npx oh-my-claude cc           # Launch Claude Code with proxy/provider
 */

import { program } from "commander";
import { registerInstallCommands } from "./cli/commands/install";
import { registerDoctorCommand } from "./cli/commands/doctor";
import { registerUpdateCommand } from "./cli/commands/update";
import { registerStatuslineCommand } from "./cli/commands/statusline";
import { registerStyleCommand } from "./cli/commands/style";
import { registerMemoryCommand } from "./cli/commands/memory";
import { registerSetupMcpCommand } from "./cli/commands/setup-mcp";
import { registerConfigCommand } from "./cli/commands/config";
import { registerSetupToolsCommand } from "./cli/commands/setup-tools";
import { registerProxyCommand } from "./cli/commands/proxy";
import { registerCcCommand } from "./cli/commands/cc";
import { registerCleanupCommand } from "./cli/commands/cleanup";
import { registerAuthCommand } from "./cli/commands/auth";
import { registerMenubarCommand } from "./cli/commands/menubar";
import { registerInstallCliCommand } from "./cli/commands/install-cli";
import { registerCheckUpdatesCommand } from "./cli/commands/check-updates";
import { registerPreferenceCommand } from "./cli/commands/preference";
import { registerBridgeCommand } from "./cli/commands/bridge";
import { registerTmuxConfigCommand } from "./cli/commands/tmux-config";
import { registerWezTermConfigCommand } from "./cli/commands/wezterm-config";

program
  .name("oh-my-claude")
  .description("Multi-agent orchestration plugin for Claude Code")
  .version("2.1.1-beta.1");

// Register all commands
registerInstallCommands(program);    // install, uninstall, status
registerDoctorCommand(program);      // doctor
registerUpdateCommand(program);      // update
registerStatuslineCommand(program);  // statusline + preset, toggle
registerStyleCommand(program);       // style + list, set, show, reset, create
registerMemoryCommand(program);      // memory + status, search, list, show, delete, compact
registerSetupMcpCommand(program);    // setup-mcp
registerConfigCommand(program);      // config
registerSetupToolsCommand(program);  // setup-tools
registerProxyCommand(program);       // proxy + status, sessions, switch, revert
registerCcCommand(program);          // cc
registerCleanupCommand(program);     // cleanup
registerAuthCommand(program);        // auth + login, logout, list, add-account
registerMenubarCommand(program);     // menubar
registerInstallCliCommand(program);  // install-cli
registerCheckUpdatesCommand(program);  // check-updates
registerPreferenceCommand(program);    // pref + add, list, show, remove, enable, disable, status, test
registerBridgeCommand(program);
registerTmuxConfigCommand(program);  // tmux-config
registerWezTermConfigCommand(program);  // wezterm-config

program.parse();
