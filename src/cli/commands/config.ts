/**
 * CLI "config" command — Manage oh-my-claude configuration
 *
 * Supports --get, --set, --unset, and --list operations.
 */

import type { Command } from "commander";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createFormatters } from "../utils/colors";

export function registerConfigCommand(program: Command) {
  program
    .command("config")
    .description("Manage oh-my-claude configuration")
    .option("--get <key>", "Get a config value")
    .option("--set <key>=<value>", "Set a config value")
    .option("--unset <key>", "Remove a config value")
    .option("--list", "List all config values")
    .action((options) => {
      const { c, ok } = createFormatters();

      const configPath = join(homedir(), ".claude", "oh-my-claude.json");
      const info = (text: string) => `${c.cyan}${text}${c.reset}`;

      // Load existing config or create new
      let config: Record<string, unknown> = {};
      if (existsSync(configPath)) {
        try {
          config = JSON.parse(readFileSync(configPath, "utf-8"));
        } catch (error) {
          console.log(
            `Config file exists but is invalid. Starting with empty config.`
          );
        }
      }

      // Handle --list
      if (options.list) {
        console.log(`${c.bold}Current configuration:${c.reset}\n`);
        if (Object.keys(config).length === 0) {
          console.log("  (no custom config set)");
        } else {
          for (const [key, value] of Object.entries(config)) {
            const formatted = JSON.stringify(value, null, 2);
            if (formatted.includes('\n')) {
              const indented = formatted.replace(/\n/g, '\n    ');
              console.log(`  ${key}: ${indented}`);
            } else {
              console.log(`  ${key}: ${formatted}`);
            }
          }
        }
        console.log(`\n${info("Available keys:")}`);
        console.log(
          "  debugTaskTracker - Enable debug logging for task-tracker hook"
        );
        console.log(
          "  debugHooks - Enable debug logging for all hooks"
        );
        return;
      }

      // Handle --get
      if (options.get) {
        const key = options.get;
        if (key in config) {
          console.log(JSON.stringify(config[key], null, 2));
        } else {
          console.log(`Key '${key}' not found in config.`);
          console.log(
            `Run 'oh-my-claude config --list' to see all keys.`
          );
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
        console.log(
          `\n${info("Restart Claude Code for changes to take effect.")}`
        );
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
      console.log(
        `${c.bold}Manage oh-my-claude configuration${c.reset}\n`
      );
      console.log("Usage:");
      console.log("  oh-my-claude config --list");
      console.log("  oh-my-claude config --get <key>");
      console.log("  oh-my-claude config --set <key>=<value>");
      console.log("  oh-my-claude config --unset <key>");
      console.log(
        `\nRun 'oh-my-claude config --list' to see available keys.`
      );
    });
}
