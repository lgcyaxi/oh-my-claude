/**
 * install-cli command — Install external CLI tools (opencode, codex, oh-my-opencode)
 *
 * Extracted as a standalone command for modularity.
 */

import type { Command } from "commander";
import { execSync } from "node:child_process";
import { createFormatters } from "../utils/colors";

interface CliTool {
  name: string;
  value: string;
  description: string;
  binary: string;
  installCmd: string;
  fallbackCmd?: string;
  fallbackNote?: string;
}

const CLI_TOOLS: CliTool[] = [
  {
    name: "OpenCode",
    value: "opencode",
    description: "AI-powered coding assistant by Codeium",
    binary: "opencode",
    installCmd: "npm install -g opencode-ai",
  },
  {
    name: "Codex CLI",
    value: "codex",
    description: "OpenAI Codex command-line tool",
    binary: "codex",
    installCmd: "npm install -g @openai/codex",
    fallbackCmd: "pip install openai-codex",
    fallbackNote: "npm failed, trying pip",
  },
  {
    name: "oh-my-opencode",
    value: "oh-my-opencode",
    description: "Multi-provider plugin for OpenCode (like oh-my-claude for OpenCode)",
    binary: "oh-my-opencode",
    installCmd: "npm install -g oh-my-opencode",
  },
  {
    name: "WezTerm",
    value: "wezterm",
    description: "Terminal multiplexer for Multi-AI Bridge pane management",
    binary: "wezterm",
    installCmd: process.platform === "win32" ? "winget install wez.wezterm" : "brew install --cask wezterm",
  },
  {
    name: "tmux",
    value: "tmux",
    description: "Terminal multiplexer for Multi-AI Bridge (Unix only)",
    binary: "tmux",
    installCmd: "brew install tmux",
    fallbackCmd: "sudo apt install tmux",
    fallbackNote: "Trying apt...",
  },
];

function isInstalled(binary: string): boolean {
  try {
    execSync(process.platform === "win32" ? `where ${binary}` : `which ${binary}`, {
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

/** Prefer bun over npm for global installs when available */
function getPackageManager(): "bun" | "npm" {
  return isInstalled("bun") ? "bun" : "npm";
}

/** Replace npm with bun in an install command (e.g. "npm install -g foo" -> "bun install -g foo") */
function resolveInstallCmd(cmd: string, pm: "bun" | "npm"): string {
  if (pm === "bun") {
    return cmd.replace(/^npm install -g /, "bun install -g ");
  }
  return cmd;
}

export function registerInstallCliCommand(program: Command) {
  program
    .command("install-cli")
    .description("Install external CLI tools (opencode, codex, oh-my-opencode)")
    .option("--list", "List available CLI tools without installing")
    .action(async (options) => {
      const { c, ok, fail, dimText, warn } = createFormatters();
      const pm = getPackageManager();

      if (pm === "bun") {
        console.log(dimText(`Using bun as package manager\n`));
      }

      if (options.list) {
        console.log(`${c.bold}Available CLI tools:${c.reset}\n`);
        for (const tool of CLI_TOOLS) {
          const installed = isInstalled(tool.binary);
          const status = installed
            ? `${c.green}(installed)${c.reset}`
            : `${c.dim}(not installed)${c.reset}`;
          console.log(`  - ${c.cyan}${tool.name}${c.reset} ${status}: ${tool.description}`);
          console.log(`    ${c.dim}${resolveInstallCmd(tool.installCmd, pm)}${c.reset}`);
        }
        return;
      }

      const { checkbox, confirm } = await import("@inquirer/prompts");

      console.log(`${c.bold}Install CLI Tools${c.reset}\n`);

      const choices = CLI_TOOLS.map((tool) => {
        const installed = isInstalled(tool.binary);
        const label = installed
          ? `${tool.name} - ${tool.description} ${c.green}(installed)${c.reset}`
          : `${tool.name} - ${tool.description}`;
        return { name: label, value: tool.value };
      });

      const selected = await checkbox({
        message: "Select tools to install",
        choices,
      });

      if (selected.length === 0) {
        console.log("\nNo tools selected. Exiting.");
        return;
      }

      console.log();

      for (const toolValue of selected) {
        const tool = CLI_TOOLS.find((t) => t.value === toolValue);
        if (!tool) continue;

        const alreadyInstalled = isInstalled(tool.binary);

        if (alreadyInstalled) {
          const reinstall = await confirm({
            message: `${tool.name} is already installed. Reinstall?`,
            default: false,
          });

          if (!reinstall) {
            console.log(dimText(`Skipping ${tool.name}.`));
            continue;
          }
        }

        const installCmd = resolveInstallCmd(tool.installCmd, pm);
        console.log(`Installing ${tool.name}...`);
        try {
          execSync(installCmd, { stdio: "inherit", timeout: 120000 });
          console.log(ok(`${tool.name} installed`));
        } catch {
          if (tool.fallbackCmd) {
            console.log(dimText(tool.fallbackNote ?? "Trying fallback..."));
            try {
              execSync(tool.fallbackCmd, { stdio: "inherit", timeout: 120000 });
              console.log(ok(`${tool.name} installed via fallback`));
            } catch {
              console.log(fail(`Failed to install ${tool.name}`));
              console.log(dimText(`Try manually: ${installCmd}`));
              if (tool.fallbackCmd) {
                console.log(dimText(`Or: ${tool.fallbackCmd}`));
              }
            }
          } else {
            console.log(fail(`Failed to install ${tool.name}`));
            console.log(dimText(`Try manually: ${installCmd}`));
          }
          continue;
        }

        console.log();
      }

      console.log();
      const results = selected.map((v) => {
        const tool = CLI_TOOLS.find((t) => t.value === v);
        if (!tool) return "";
        return isInstalled(tool.binary) ? ok(tool.name) : fail(tool.name);
      }).filter(Boolean);

      if (results.length > 0) {
        console.log(`${c.bold}Results:${c.reset}`);
        for (const r of results) console.log(`  ${r}`);
      }

      console.log();
      console.log(warn("You may need to restart your terminal for PATH changes to take effect."));
    });
}
