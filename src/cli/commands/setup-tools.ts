/**
 * setup-tools command — Install companion tools for Claude Code
 *
 * Extracted from cli.ts for modularity.
 */

import type { Command } from "commander";
import { existsSync, writeFileSync, readFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { createFormatters } from "../utils/colors";
import { INSTALL_DIR } from "../utils/paths";

export function registerSetupToolsCommand(program: Command) {
  program
    .command("setup-tools")
    .description("Install companion tools for Claude Code")
    .option("--list", "List available tools without installing")
    .action(async (options) => {
      const { c, ok, fail, warn, dimText } = createFormatters();

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
            execSync(process.platform === "win32" ? "where ccline" : "which ccline", { stdio: "pipe" });
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
            const wrapperPath = join(INSTALL_DIR, "statusline-wrapper.js");
            const omcStatusline = join(INSTALL_DIR, "dist", "statusline", "statusline.js");
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

          // Step 2: Initialize for Claude Code (run from $HOME so skill installs to ~/.claude/skills/)
          console.log("Initializing UI UX Pro Max for Claude Code...");
          try {
            execSync("npx uipro-cli init --ai claude", { stdio: "inherit", timeout: 60000, cwd: homedir() });
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
}
