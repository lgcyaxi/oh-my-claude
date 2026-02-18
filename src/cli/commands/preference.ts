import type { Command } from "commander";
import { createFormatters } from "../utils/colors";

export function registerPreferenceCommand(program: Command) {
  const { c, ok, fail } = createFormatters();

  const prefCmd = program
    .command("pref")
    .description("Manage oh-my-claude preferences")
    .action(() => {
      const { PreferenceStore } = require("../../preferences/store");
      const store = new PreferenceStore();
      const stats = store.stats();

      console.log(`${c.bold}Preference System${c.reset}\n`);
      console.log(`  Total:       ${c.green}${stats.total}${c.reset} (${c.cyan}${stats.byScope.project} project${c.reset}, ${c.yellow}${stats.byScope.global} global${c.reset})`);
      console.log(`  Auto-inject: ${c.green}${stats.autoInjectCount}${c.reset}`);
      console.log(`  Global:      ${c.dim}${stats.globalPath}${c.reset}`);
      console.log(`  Project:     ${stats.projectPath ? c.dim + stats.projectPath + c.reset : c.yellow + "(not in git repo)" + c.reset}`);
      console.log(`\nUsage:`);
      console.log(`  oh-my-claude pref add <title>            ${c.dim}# Add a preference${c.reset}`);
      console.log(`  oh-my-claude pref list                   ${c.dim}# List preferences${c.reset}`);
      console.log(`  oh-my-claude pref show <id>              ${c.dim}# Show preference detail${c.reset}`);
      console.log(`  oh-my-claude pref remove <id>            ${c.dim}# Remove a preference${c.reset}`);
      console.log(`  oh-my-claude pref enable <id>            ${c.dim}# Enable auto-inject${c.reset}`);
      console.log(`  oh-my-claude pref disable <id>           ${c.dim}# Disable auto-inject${c.reset}`);
      console.log(`  oh-my-claude pref status                 ${c.dim}# Show stats${c.reset}`);
      console.log(`  oh-my-claude pref test <prompt>          ${c.dim}# Test trigger matching${c.reset}`);
    });

  prefCmd
    .command("add <title>")
    .description("Add a new preference")
    .option("--content <text>", "Rule content (defaults to title if omitted)")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--scope <scope>", "Storage scope (global, project)", "global")
    .option("--keywords <kw>", "Comma-separated trigger keywords")
    .option("--categories <cat>", "Comma-separated trigger categories")
    .option("--always", "Always inject regardless of context")
    .option("--no-auto-inject", "Disable auto-injection")
    .action(
      (
        title: string,
        options: {
          content?: string;
          tags?: string;
          scope: string;
          keywords?: string;
          categories?: string;
          always?: boolean;
          autoInject: boolean;
        },
      ) => {
        const { PreferenceStore } = require("../../preferences/store");
        const store = new PreferenceStore();

        const tags = options.tags ? options.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [];
        const keywords = options.keywords ? options.keywords.split(",").map((k: string) => k.trim()).filter(Boolean) : undefined;
        const categories = options.categories ? options.categories.split(",").map((ct: string) => ct.trim()).filter(Boolean) : undefined;

        const result = store.create({
          title,
          content: options.content ?? title,
          scope: options.scope as "global" | "project",
          autoInject: options.autoInject,
          tags,
          trigger: {
            keywords,
            categories,
            always: options.always ?? false,
          },
        });

        if (result.success && result.data) {
          console.log(ok(`Preference created`));
          console.log(`  ID:    ${c.cyan}${result.data.id}${c.reset}`);
          console.log(`  Title: ${result.data.title}`);
          console.log(`  Scope: ${result.data.scope}`);
          console.log(`  Auto:  ${result.data.autoInject ? c.green + "yes" + c.reset : c.yellow + "no" + c.reset}`);
          if (tags.length > 0) {
            console.log(`  Tags:  ${tags.join(", ")}`);
          }
        } else {
          console.log(fail(result.error ?? "Unknown error"));
          process.exit(1);
        }
      },
    );

  prefCmd
    .command("list")
    .description("List preferences")
    .option("--scope <scope>", "Filter by scope (global, project)")
    .option("--tags <tags>", "Comma-separated tag filter")
    .action((options: { scope?: string; tags?: string }) => {
      const { PreferenceStore } = require("../../preferences/store");
      const store = new PreferenceStore();

      const tags = options.tags ? options.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : undefined;
      const prefs = store.list({
        scope: options.scope as "global" | "project" | undefined,
        tags,
      });

      const scopeLabel = options.scope ?? "all";
      console.log(`${c.bold}${c.magenta}Preferences${c.reset} ${c.dim}(scope: ${scopeLabel})${c.reset}\n`);

      if (prefs.length === 0) {
        console.log(`  ${c.dim}No preferences found.${c.reset}`);
        console.log(`  ${c.dim}Use: oh-my-claude pref add "My rule" --tags tag1,tag2${c.reset}`);
        return;
      }

      const idW = 44;
      const titleW = 32;
      const scopeW = 7;
      const autoW = 4;

      console.log(
        `  ${pad("ID", idW)} | ${pad("Title", titleW)} | ${pad("Scope", scopeW)} | ${pad("Auto", autoW)} | Tags`,
      );
      console.log(`  ${"-".repeat(idW)}-|-${"-".repeat(titleW)}-|-${"-".repeat(scopeW)}-|-${"-".repeat(autoW)}-|-${"─".repeat(16)}`);

      for (const p of prefs) {
        const autoStr = p.autoInject ? "yes" : "no";
        const tagsStr = p.tags.length > 0 ? p.tags.join(", ") : c.dim + "-" + c.reset;
        console.log(
          `  ${c.dim}${pad(p.id, idW)}${c.reset} | ${pad(p.title, titleW)} | ${pad(p.scope, scopeW)} | ${pad(autoStr, autoW)} | ${tagsStr}`,
        );
      }

      console.log(`\n  ${c.dim}Total: ${prefs.length} preference${prefs.length === 1 ? "" : "s"}${c.reset}`);
    });

  prefCmd
    .command("show <id>")
    .description("Show preference details")
    .action((id: string) => {
      const { PreferenceStore } = require("../../preferences/store");
      const store = new PreferenceStore();

      const result = store.get(id);
      if (!result.success || !result.data) {
        console.log(fail(result.error ?? `Preference "${id}" not found`));
        process.exit(1);
      }

      const p = result.data;
      console.log(`${c.bold}${p.title}${c.reset}`);
      console.log(`ID:         ${c.dim}${p.id}${c.reset}`);
      console.log(`Scope:      ${p.scope}`);
      console.log(`Auto:       ${p.autoInject ? c.green + "yes" + c.reset : c.yellow + "no" + c.reset}`);
      console.log(`Tags:       ${p.tags.length > 0 ? p.tags.join(", ") : c.dim + "(none)" + c.reset}`);
      console.log(`Created:    ${c.dim}${p.createdAt}${c.reset}`);
      console.log(`Updated:    ${c.dim}${p.updatedAt}${c.reset}`);

      const t = p.trigger;
      if (t.always) {
        console.log(`Trigger:    ${c.green}always${c.reset}`);
      } else {
        if (t.keywords?.length) {
          console.log(`Keywords:   ${t.keywords.join(", ")}`);
        }
        if (t.categories?.length) {
          console.log(`Categories: ${t.categories.join(", ")}`);
        }
        if (!t.keywords?.length && !t.categories?.length) {
          console.log(`Trigger:    ${c.dim}(none — manual only)${c.reset}`);
        }
      }

      console.log(`${"─".repeat(60)}`);
      console.log(p.content);
    });

  prefCmd
    .command("remove <id>")
    .description("Remove a preference")
    .option("--force", "Skip confirmation")
    .action((id: string, options: { force?: boolean }) => {
      const { PreferenceStore } = require("../../preferences/store");
      const store = new PreferenceStore();

      const existing = store.get(id);
      if (!existing.success) {
        console.log(fail(existing.error ?? `Preference "${id}" not found`));
        process.exit(1);
      }

      if (!options.force) {
        console.log(`Removing: ${c.bold}${existing.data!.title}${c.reset} ${c.dim}(${id})${c.reset}`);
        console.log(`${c.dim}Use --force to skip this message${c.reset}`);
      }

      const result = store.delete(id);
      if (result.success) {
        console.log(ok(`Preference "${id}" removed.`));
      } else {
        console.log(fail(result.error ?? "Unknown error"));
        process.exit(1);
      }
    });

  prefCmd
    .command("enable <id>")
    .description("Enable auto-injection for a preference")
    .action((id: string) => {
      const { PreferenceStore } = require("../../preferences/store");
      const store = new PreferenceStore();

      const result = store.update(id, { autoInject: true });
      if (result.success && result.data) {
        console.log(ok(`Preference "${result.data.title}" enabled for auto-injection.`));
      } else {
        console.log(fail(result.error ?? `Preference "${id}" not found`));
        process.exit(1);
      }
    });

  prefCmd
    .command("disable <id>")
    .description("Disable auto-injection for a preference")
    .action((id: string) => {
      const { PreferenceStore } = require("../../preferences/store");
      const store = new PreferenceStore();

      const result = store.update(id, { autoInject: false });
      if (result.success && result.data) {
        console.log(ok(`Preference "${result.data.title}" disabled for auto-injection.`));
      } else {
        console.log(fail(result.error ?? `Preference "${id}" not found`));
        process.exit(1);
      }
    });

  prefCmd
    .command("status")
    .description("Show preference store statistics")
    .action(() => {
      const { PreferenceStore } = require("../../preferences/store");
      const store = new PreferenceStore();
      const stats = store.stats();

      console.log(`${c.bold}${c.magenta}Preference Status${c.reset}\n`);
      console.log(`  Total:         ${c.green}${stats.total}${c.reset}`);
      console.log(`  By scope:`);
      console.log(`    Global:      ${c.yellow}${stats.byScope.global}${c.reset} ${c.dim}(${stats.globalPath})${c.reset}`);
      console.log(`    Project:     ${c.cyan}${stats.byScope.project}${c.reset} ${stats.projectPath ? c.dim + "(" + stats.projectPath + ")" + c.reset : c.yellow + "(not in git repo)" + c.reset}`);
      console.log(`  Auto-inject:   ${c.green}${stats.autoInjectCount}${c.reset}`);
      console.log(`  SQLite index:  ${stats.sqliteAvailable ? c.green + "available" + c.reset : c.dim + "not available" + c.reset}`);
    });

  prefCmd
    .command("test <prompt>")
    .description("Test which preferences match a given prompt")
    .action((prompt: string) => {
      const { PreferenceStore } = require("../../preferences/store");
      const store = new PreferenceStore();

      const matches = store.match({ prompt });

      console.log(`${c.bold}Matching preferences for:${c.reset} "${prompt}"\n`);

      if (matches.length === 0) {
        console.log(`  ${c.dim}No preferences matched.${c.reset}`);
        return;
      }

      for (const m of matches) {
        const p = m.preference;
        const scoreStr = `${c.dim}(score: ${m.score.toFixed(2)})${c.reset}`;
        const matchInfo =
          m.matchedBy === "always"
            ? `${c.green}always${c.reset}`
            : m.matchedTerms?.length
              ? `${c.cyan}${m.matchedBy}${c.reset}: ${m.matchedTerms.join(", ")}`
              : `${c.cyan}${m.matchedBy}${c.reset}`;

        console.log(`  - ${c.bold}${p.title}${c.reset} ${scoreStr}`);
        console.log(`    matched: ${matchInfo}`);
        if (p.tags.length > 0) {
          console.log(`    tags: ${p.tags.join(", ")}`);
        }
      }

      console.log(`\n  ${c.dim}${matches.length} match${matches.length === 1 ? "" : "es"} found${c.reset}`);
    });
}

function pad(str: string, len: number): string {
  if (str.length >= len) return str.slice(0, len);
  return str + " ".repeat(len - str.length);
}
