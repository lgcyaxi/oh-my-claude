import type { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createFormatters } from "../utils/colors";
import { INSTALL_DIR } from "../utils/paths";

export function registerStatuslineCommand(program: Command) {
  const { c, ok, fail, warn } = createFormatters();

  const statuslineCmd = program
    .command("statusline")
    .description("Manage statusline integration")
    .option("--enable", "Enable statusline")
    .option("--disable", "Disable statusline")
    .option("--status", "Show current statusline configuration")
    .action((options) => {
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
        const { installStatusLine } = require("../../installer/settings-merger");
        const { getStatusLineScriptPath } = require("../../installer");

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
        const { uninstallStatusLine } = require("../../installer/settings-merger");

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

      const { setPreset } = require("../../statusline/config");

      try {
        const config = setPreset(name as "minimal" | "standard" | "full");
        console.log(`${c.green}✓${c.reset} Preset changed to: ${name}`);
        console.log(`\nEnabled segments:`);

        const segments = config.segments || {};
        for (const [id, seg] of Object.entries(segments)) {
          const s = seg as { enabled: boolean };
          if (s.enabled) {
            console.log(`  ● ${id}`);
          }
        }
      } catch (error) {
        console.log(`${c.red}✗${c.reset} Failed to set preset: ${error}`);
        process.exit(1);
      }
    });

  // Statusline toggle subcommand
  statuslineCmd
    .command("toggle <segment> [state]")
    .description("Toggle a segment on/off (model, git, directory, context, session, output-style, mcp, memory, proxy, bridge)")
    .action((segment: string, state?: string) => {
      const validSegments = ["model", "git", "directory", "context", "session", "output-style", "mcp", "memory", "proxy", "bridge"];
      if (!validSegments.includes(segment)) {
        console.log(`Invalid segment: ${segment}`);
        console.log(`Valid segments: ${validSegments.join(", ")}`);
        process.exit(1);
      }

      const { toggleSegment, loadConfig } = require("../../statusline/config");

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
        console.log(`${c.green}✓${c.reset} Segment "${segment}" ${newState}`);
      } catch (error) {
        console.log(`${c.red}✗${c.reset} Failed to toggle segment: ${error}`);
        process.exit(1);
      }
    });
}
