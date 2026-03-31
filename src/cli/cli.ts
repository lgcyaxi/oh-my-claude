/**
 * oh-my-claude CLI
 *
 * Thin orchestrator that imports and registers all command modules.
 *
 * Usage:
 *   npx oh-my-claude install      # Install oh-my-claude
 *   npx oh-my-claude uninstall    # Uninstall oh-my-claude
 *   npx oh-my-claude doctor       # Diagnose configuration issues
 *   npx oh-my-claude update       # Update oh-my-claude to latest version
 *   npx oh-my-claude cc           # Launch Claude Code with proxy/provider
 *   npx oh-my-claude tools        # Install companion tools and MCP servers
 *   npx oh-my-claude manage       # Manager: pref, memory, config, statusline, cleanup, tc
 */

import { program } from "commander";
// core lifecycle
import { registerInstallCommands } from "./commands/core/install";
import { registerDoctorCommand } from "./commands/core/doctor";
import { registerUpdateCommand } from "./commands/core/update";
// session
import { registerProxyCommand } from "./commands/session/proxy";
import { registerCcCommand, listSessionsAction } from "./commands/session/cc";
import { registerAuthCommand } from "./commands/session/auth";
// tools + manage
import { registerToolsCommand } from "./commands/tools/tools";
import { registerManageCommand } from "./commands/manage/manage";
// system
import { registerMenubarCommand } from "./commands/system/menubar";
// update check
import { printUpdateBannerIfCached, scheduleUpdateCheck } from "./utils/update-check";

// Load version from package.json — single source of truth
const VERSION = (() => {
  try {
    const { join, dirname } = require("node:path");
    const { readFileSync } = require("node:fs");
    // Try installed location first (~/.claude/oh-my-claude/package.json)
    const candidates = [
      join(dirname(dirname(__dirname)), "package.json"), // dist/cli/cli.js → package.json
      join(dirname(__dirname), "package.json"), // dist/cli.js → package.json
    ];
    for (const p of candidates) {
      try {
        const pkg = JSON.parse(readFileSync(p, "utf-8"));
        if (pkg.version) return pkg.version as string;
      } catch { /* try next */ }
    }
  } catch { /* fallback */ }
  return "2.2.3"; // fallback if package.json unreadable
})();

// When invoked as `omc` with no args: show version + hint (brief, not full help).
// When invoked as `oh-my-claude` with no args: Commander default (show help).
const invokedAs = process.argv[1] ? require("node:path").basename(process.argv[1], ".js") : "";
const isOmcAlias = invokedAs === "omc";

const prog = program
  .name("oh-my-claude")
  .description("Multi-agent orchestration plugin for Claude Code")
  .version(VERSION);

if (isOmcAlias) {
  prog.action(() => {
    console.log(`oh-my-claude v${VERSION}`);
    console.log("Run 'omc --help' for available commands.");
  });
}

// Register commands — order here determines `--help` listing order
// Group 1: Core lifecycle
registerInstallCommands(program);    // install, uninstall
registerDoctorCommand(program);      // doctor
registerUpdateCommand(program);      // update

// Group 2: Session / runtime
registerCcCommand(program);          // cc
program                              // omc ps — top-level alias for cc list
  .command("ps", { hidden: true })
  .description("List active CC sessions (alias for cc list)")
  .action(listSessionsAction);
registerProxyCommand(program);       // proxy + status, sessions, switch, revert
registerAuthCommand(program);        // auth
registerMenubarCommand(program);     // menubar

// Group 3: Tools + manage
registerToolsCommand(program);       // tools + install, mcp, check
registerManageCommand(program);      // manage (m) + pref, memory, config, statusline, style, ollama, cleanup, tc

// Auto-update check — runs BEFORE parse so async commands don't prevent it
const subcommand = process.argv[2] ?? '';
const suppressUpdate = ['update', 'install', 'uninstall'].includes(subcommand) || process.env.NO_UPDATE_CHECK === '1';
if (!suppressUpdate) {
  printUpdateBannerIfCached();
  scheduleUpdateCheck(VERSION);
}

program.parse();
