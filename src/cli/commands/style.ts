import type { Command } from "commander";
import { createFormatters } from "../utils/colors";

export function registerStyleCommand(program: Command) {
  const { c, ok, fail } = createFormatters();

  const styleCmd = program
    .command("style")
    .description("Manage output styles for Claude Code")
    .action(() => {
      // No subcommand - show usage
      const { getActiveStyle, listStyles } = require("../../styles");

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
      const { listStyles, getActiveStyle } = require("../../styles");

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
      const { setActiveStyle } = require("../../styles");

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
      const { getStyle, getActiveStyle } = require("../../styles");

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
      const { resetStyle } = require("../../styles");

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
      const { createStyle } = require("../../styles");

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
}
