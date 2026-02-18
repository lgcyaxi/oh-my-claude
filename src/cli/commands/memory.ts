import type { Command } from "commander";
import { createFormatters } from "../utils/colors";
import { INSTALL_DIR } from "../utils/paths";

export function registerMemoryCommand(program: Command) {
  const { c, ok, fail, warn } = createFormatters();

  const memoryCmd = program
    .command("memory")
    .description("Manage oh-my-claude memory system")
    .action(() => {
      const { getMemoryStats, getProjectMemoryDir, getDefaultWriteScope } = require("../../memory");

      const stats = getMemoryStats();
      const projectDir = getProjectMemoryDir();
      const defaultScope = getDefaultWriteScope();

      console.log(`${c.bold}Memory System${c.reset}\n`);
      console.log(`  Total memories: ${c.green}${stats.total}${c.reset} (${c.cyan}${stats.byScope.project} project${c.reset}, ${c.yellow}${stats.byScope.global} global${c.reset})`);
      console.log(`  Notes: ${stats.byType.note}  |  Sessions: ${stats.byType.session}`);
      console.log(`  Storage: ${(stats.totalSizeBytes / 1024).toFixed(1)} KB`);
      console.log(`  Project: ${projectDir ? c.dim + projectDir + c.reset : c.yellow + "(not in git repo)" + c.reset}`);
      console.log(`  Global:  ${c.dim}${stats.storagePath}${c.reset}`);
      console.log(`  Default: ${c.green}${defaultScope}${c.reset}`);
      console.log(`\nUsage:`);
      console.log(`  oh-my-claude memory status               ${c.dim}# Show memory stats${c.reset}`);
      console.log(`  oh-my-claude memory search <query>       ${c.dim}# Search memories${c.reset}`);
      console.log(`  oh-my-claude memory list [--scope all]   ${c.dim}# List memories${c.reset}`);
      console.log(`  oh-my-claude memory show <id>            ${c.dim}# Show memory content${c.reset}`);
      console.log(`  oh-my-claude memory delete <id>          ${c.dim}# Delete a memory${c.reset}`);
      console.log(`  oh-my-claude memory compact              ${c.dim}# Compact memories (interactive)${c.reset}`);
    });

  // Memory status subcommand
  memoryCmd
    .command("status")
    .description("Show memory store statistics")
    .action(() => {
      const { getMemoryStats, getProjectMemoryDir, getDefaultWriteScope } = require("../../memory");

      const stats = getMemoryStats();
      const projectDir = getProjectMemoryDir();
      const defaultScope = getDefaultWriteScope();

      console.log(`${c.bold}${c.magenta}Memory Status${c.reset}\n`);
      console.log(`  Total memories:  ${c.green}${stats.total}${c.reset}`);
      console.log(`  By type:`);
      console.log(`    Notes:         ${stats.byType.note}`);
      console.log(`    Sessions:      ${stats.byType.session}`);
      console.log(`  By scope:`);
      console.log(`    Project:       ${c.cyan}${stats.byScope.project}${c.reset} ${projectDir ? c.dim + `(${projectDir})` + c.reset : c.yellow + "(not available)" + c.reset}`);
      console.log(`    Global:        ${c.yellow}${stats.byScope.global}${c.reset} ${c.dim}(${stats.storagePath})${c.reset}`);
      console.log(`  Total size:      ${(stats.totalSizeBytes / 1024).toFixed(1)} KB`);
      console.log(`  Default write:   ${c.green}${defaultScope}${c.reset}`);
    });

  // Memory search subcommand
  memoryCmd
    .command("search <query>")
    .description("Search memories by text query")
    .option("--type <type>", "Filter by type (note, session)")
    .option("--scope <scope>", "Filter by scope (project, global, all)", "all")
    .option("--limit <n>", "Max results (default: 10)", "10")
    .action((query: string, options: { type?: string; scope: string; limit: string }) => {
      const { searchMemories } = require("../../memory");

      const results = searchMemories({
        query,
        type: options.type as any,
        scope: options.scope as any,
        limit: parseInt(options.limit, 10) || 10,
        sort: "relevance",
      });

      console.log(`${c.bold}${c.magenta}Memory Search${c.reset}: "${query}" ${c.dim}(scope: ${options.scope})${c.reset}\n`);

      if (results.length === 0) {
        console.log(`  ${c.dim}No memories found matching "${query}".${c.reset}`);
        return;
      }

      console.log(`  ${c.green}${results.length}${c.reset} result(s):\n`);

      for (const r of results) {
        const typeTag = r.entry.type === "note" ? `${c.cyan}[note]${c.reset}` : `${c.yellow}[session]${c.reset}`;
        const scopeTag = (r.entry as any)._scope === "project" ? `${c.green}[P]${c.reset}` : `${c.yellow}[G]${c.reset}`;
        const score = `${c.dim}(score: ${r.score})${c.reset}`;
        console.log(`  ${scopeTag} ${c.bold}${r.entry.title}${c.reset} ${typeTag} ${score}`);
        console.log(`    ID: ${c.dim}${r.entry.id}${c.reset}`);
        if (r.entry.tags.length > 0) {
          console.log(`    Tags: ${r.entry.tags.join(", ")}`);
        }
        // Show preview
        const preview = r.entry.content.split("\n").slice(0, 2).join(" ").slice(0, 120);
        console.log(`    ${c.dim}${preview}${preview.length >= 120 ? "..." : ""}${c.reset}`);
        console.log();
      }
    });

  // Memory list subcommand
  memoryCmd
    .command("list")
    .description("List stored memories")
    .option("--type <type>", "Filter by type (note, session)")
    .option("--scope <scope>", "Filter by scope (project, global, all)", "all")
    .option("--limit <n>", "Max results (default: 20)", "20")
    .action((options: { type?: string; scope: string; limit: string }) => {
      const { listMemories } = require("../../memory");

      const entries = listMemories({
        type: options.type as any,
        scope: options.scope as any,
        limit: parseInt(options.limit, 10) || 20,
      });

      console.log(`${c.bold}${c.magenta}Stored Memories${c.reset} ${c.dim}(scope: ${options.scope})${c.reset}\n`);

      if (entries.length === 0) {
        console.log(`  ${c.dim}No memories found.${c.reset}`);
        console.log(`  ${c.dim}Use MCP tool "remember" or create .md files in ~/.claude/oh-my-claude/memory/${c.reset}`);
        return;
      }

      for (const entry of entries) {
        const typeTag = entry.type === "note" ? `${c.cyan}[note]${c.reset}` : `${c.yellow}[session]${c.reset}`;
        const scopeTag = (entry as any)._scope === "project" ? `${c.green}[P]${c.reset}` : `${c.yellow}[G]${c.reset}`;
        const date = entry.createdAt.slice(0, 10);
        console.log(`  ${scopeTag} ${c.bold}${entry.title}${c.reset} ${typeTag}  ${c.dim}${date}${c.reset}`);
        console.log(`    ID: ${c.dim}${entry.id}${c.reset}`);
        if (entry.tags.length > 0) {
          console.log(`    Tags: ${entry.tags.join(", ")}`);
        }
      }

      console.log(`\n  ${c.dim}Total: ${entries.length} memor${entries.length === 1 ? "y" : "ies"}${c.reset}`);
    });

  // Memory show subcommand
  memoryCmd
    .command("show <id>")
    .description("Show full content of a memory")
    .action((id: string) => {
      const { getMemory } = require("../../memory");

      const result = getMemory(id);
      if (!result.success || !result.data) {
        console.log(`${c.red}✗${c.reset} ${result.error || `Memory "${id}" not found`}`);
        process.exit(1);
      }

      const entry = result.data;
      console.log(`${c.bold}${entry.title}${c.reset} ${c.dim}[${entry.type}]${c.reset}`);
      console.log(`ID: ${c.dim}${entry.id}${c.reset}`);
      console.log(`Created: ${c.dim}${entry.createdAt}${c.reset}`);
      console.log(`Updated: ${c.dim}${entry.updatedAt}${c.reset}`);
      if (entry.tags.length > 0) {
        console.log(`Tags: ${entry.tags.join(", ")}`);
      }
      console.log(`${"─".repeat(60)}`);
      console.log(entry.content);
    });

  // Memory delete subcommand
  memoryCmd
    .command("delete <id>")
    .description("Delete a memory by ID")
    .option("--scope <scope>", "Where to search (project, global, all)", "all")
    .action((id: string, options: { scope: string }) => {
      const { deleteMemory } = require("../../memory");

      const result = deleteMemory(id, options.scope as any);
      if (result.success) {
        console.log(`${c.green}✓${c.reset} Memory "${id}" deleted.`);
      } else {
        console.log(`${c.red}✗${c.reset} ${result.error}`);
        process.exit(1);
      }
    });

  // Memory compact subcommand
  memoryCmd
    .command("compact")
    .description("Compact memories using AI-assisted grouping (interactive)")
    .option("--scope <scope>", "Scope to analyze (project, global, all)", "all")
    .action((options: { scope: string }) => {
      const { getMemoryStats, listMemories, getProjectMemoryDir } = require("../../memory");

      const stats = getMemoryStats();
      const projectDir = getProjectMemoryDir();
      const entries = listMemories({ scope: options.scope as any });

      console.log(`${c.bold}${c.magenta}Memory Compaction${c.reset}\n`);

      // Show current status
      console.log(`${c.bold}Current Status:${c.reset}`);
      console.log(`  Total memories:  ${c.green}${stats.total}${c.reset}`);
      console.log(`  Project scope:   ${stats.byScope.project} ${c.dim}${projectDir ? `(${projectDir})` : "(not available)"}${c.reset}`);
      console.log(`  Global scope:    ${stats.byScope.global} ${c.dim}(${stats.storagePath})${c.reset}`);
      console.log(`  Notes:           ${stats.byType.note}`);
      console.log(`  Sessions:        ${stats.byType.session}`);
      console.log();

      if (entries.length < 2) {
        console.log(`${c.yellow}⚠${c.reset} Not enough memories to compact (need at least 2).`);
        return;
      }

      // Show memories that would be analyzed
      console.log(`${c.bold}Memories to analyze (${options.scope} scope):${c.reset}`);
      const displayLimit = Math.min(entries.length, 10);
      for (let i = 0; i < displayLimit; i++) {
        const e = entries[i];
        const scope = (e as any)._scope;
        const scopeTag = scope === "project" ? `${c.cyan}[P]${c.reset}` : `${c.yellow}[G]${c.reset}`;
        console.log(`  ${scopeTag} ${e.title} ${c.dim}(${e.id})${c.reset}`);
      }
      if (entries.length > displayLimit) {
        console.log(`  ${c.dim}... and ${entries.length - displayLimit} more${c.reset}`);
      }
      console.log();

      // Instructions
      console.log(`${c.bold}How to compact:${c.reset}`);
      console.log(`  ${c.cyan}1.${c.reset} In Claude Code, use: ${c.green}/omc-mem-compact${c.reset}`);
      console.log(`  ${c.cyan}2.${c.reset} Or use MCP tool: ${c.green}mcp__oh-my-claude-background__compact_memories${c.reset}`);
      console.log();
      console.log(`${c.dim}Compaction uses AI (ZhiPu -> MiniMax -> DeepSeek) to analyze and group related memories.${c.reset}`);
    });
}
