/**
 * Doctor zone: Memory System
 *
 * Health check for memory files, WASM runtime, SQLite index,
 * embedding provider, search tier, and fix-mem repair functionality.
 */

import type { DoctorContext } from "./types";
import { INSTALL_DIR } from "../../../utils/paths";
import { loadConfig } from "../../../../shared/config";
import { existsSync, readFileSync, readdirSync, statSync, copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

function countMdFiles(dir: string): number {
  try {
    return existsSync(dir) ? readdirSync(dir).filter((f: string) => f.endsWith(".md")).length : 0;
  } catch { return 0; }
}

export async function checkMemoryZone(ctx: DoctorContext) {
  const { ok, fail, warn, header, subheader, dimText, c } = ctx.formatters;

  console.log(`\n${header("Memory System:")}`);
  try {
    const globalMemDir = join(homedir(), ".claude", "oh-my-claude", "memory");
    const projectMemDir = ctx.projectRoot ? join(ctx.projectRoot, ".claude", "mem") : null;
    const indexDbPath = join(globalMemDir, "index.db");
    const indexDbExists = existsSync(indexDbPath);

    const wasmPath = join(INSTALL_DIR, "mcp", "sql-wasm.wasm");
    const wasmExists = existsSync(wasmPath);

    let globalNotes = 0, globalSessions = 0;
    let projectNotes = 0, projectSessions = 0;

    globalNotes = countMdFiles(join(globalMemDir, "notes"));
    globalSessions = countMdFiles(join(globalMemDir, "sessions"));
    if (projectMemDir) {
      projectNotes = countMdFiles(join(projectMemDir, "notes"));
      projectSessions = countMdFiles(join(projectMemDir, "sessions"));
    }
    const totalFiles = globalNotes + globalSessions + projectNotes + projectSessions;

    const memConfig = loadConfig();
    const embeddingProvider = memConfig.memory?.embedding?.provider ?? "custom";
    const embeddingModel = memConfig.memory?.embedding?.model ?? "embedding-3";

    let embeddingAvailable = false;
    let embeddingDetail = "";
    switch (embeddingProvider) {
      case "custom": {
        const apiBase = process.env.EMBEDDING_API_BASE;
        const model = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
        embeddingAvailable = !!apiBase && apiBase.length > 0;
        embeddingDetail = embeddingAvailable
          ? `custom (${model} @ ${apiBase})`
          : "custom (EMBEDDING_API_BASE not set)";
        break;
      }
      case "zhipu": {
        embeddingAvailable = !!process.env.ZHIPU_API_KEY;
        embeddingDetail = embeddingAvailable ? `zhipu/${embeddingModel}` : "zhipu (ZHIPU_API_KEY not set)";
        break;
      }
      case "none":
        embeddingDetail = "disabled";
        break;
    }

    const canUseIndexer = wasmExists;
    const searchTier = canUseIndexer && indexDbExists && embeddingAvailable
      ? "hybrid"
      : canUseIndexer && (indexDbExists || totalFiles > 0)
        ? "fts5"
        : "legacy";

    const tierLabel = searchTier === "hybrid"
      ? `${c.green}Hybrid (FTS5 + Vector)${c.reset}`
      : searchTier === "fts5"
        ? `${c.yellow}FTS5 (keyword only)${c.reset}`
        : `${c.red}Legacy (in-memory)${c.reset}`;

    // Compact summary (always shown)
    console.log(`  ${totalFiles > 0 ? ok(`${totalFiles} memories`) : warn("No memories stored")} ${dimText(`(${globalNotes + projectNotes} notes, ${globalSessions + projectSessions} sessions)`)}`);
    console.log(`  ${wasmExists ? ok("WASM runtime") : fail("WASM runtime missing")} ${dimText(`sql-wasm.wasm`)}`);
    console.log(`  ${indexDbExists ? ok("SQLite index") : warn("No SQLite index")} ${dimText(`Search tier: `)}${tierLabel}`);
    console.log(`  ${embeddingAvailable ? ok(`Embedding: ${embeddingDetail}`) : (embeddingProvider === "none" ? dimText("○ Embedding: disabled") : warn(`Embedding: ${embeddingDetail}`))}`);

    if (!wasmExists) {
      console.log(`  ${dimText(`  Fix: run 'oh-my-claude doctor fix-mem'`)}`);
    }

    if (ctx.detail) {
      // Storage detail
      console.log(`\n  ${subheader("Storage:")}`);
      console.log(`    Global: ${dimText(globalMemDir)}`);
      console.log(`      Notes: ${globalNotes}  Sessions: ${globalSessions}`);
      if (projectMemDir) {
        console.log(`    Project: ${dimText(projectMemDir)}`);
        console.log(`      Notes: ${projectNotes}  Sessions: ${projectSessions}`);
      } else {
        console.log(`    Project: ${dimText("(no project scope — not in a git repo)")}`);
      }

      // WASM detail
      console.log(`\n  ${subheader("WASM Runtime:")}`);
      if (wasmExists) {
        try {
          const wasmStats = statSync(wasmPath);
          const wasmSizeKB = (wasmStats.size / 1024).toFixed(1);
          console.log(`    ${ok(`sql-wasm.wasm: ${wasmSizeKB} KB`)}`);
        } catch {
          console.log(`    ${ok("sql-wasm.wasm found")}`);
        }
        console.log(`    Path: ${dimText(wasmPath)}`);
      } else {
        console.log(`    ${fail("sql-wasm.wasm NOT FOUND — SQLite indexer cannot initialize")}`);
        console.log(`    ${dimText(`Expected: ${wasmPath}`)}`);
        console.log(`    ${dimText(`Fix: run 'oh-my-claude doctor fix-mem'`)}`);
      }

      // Index detail
      console.log(`\n  ${subheader("Index:")}`);
      if (indexDbExists) {
        try {
          const dbStats = statSync(indexDbPath);
          const dbSizeKB = (dbStats.size / 1024).toFixed(1);
          console.log(`    ${ok(`index.db: ${dbSizeKB} KB`)}`);
        } catch {
          console.log(`    ${ok("index.db exists")}`);
        }
      } else {
        console.log(`    ${warn("index.db not found — index is built on-demand when recall is first used")}`);
        console.log(`    ${dimText(`Expected: ${indexDbPath}`)}`);
      }

      // Embedding provider detail
      console.log(`\n  ${subheader("Embedding Provider:")}`);
      console.log(`    Configured: ${c.cyan}${embeddingProvider}${c.reset}`);
      if (embeddingProvider === "custom") {
        const apiBase = process.env.EMBEDDING_API_BASE;
        const model = process.env.EMBEDDING_MODEL;
        const apiKey = process.env.EMBEDDING_API_KEY;
        const dims = process.env.EMBEDDING_DIMENSIONS;
        console.log(`    EMBEDDING_API_BASE: ${apiBase ? `${c.green}${apiBase}${c.reset}` : `${c.red}(not set)${c.reset}`}`);
        console.log(`    EMBEDDING_MODEL: ${model ? `${c.green}${model}${c.reset}` : `${c.dim}(default: text-embedding-3-small)${c.reset}`}`);
        console.log(`    EMBEDDING_API_KEY: ${apiKey ? `${c.green}(set)${c.reset}` : `${c.dim}(not set — OK for local Ollama)${c.reset}`}`);
        if (dims) console.log(`    EMBEDDING_DIMENSIONS: ${c.green}${dims}${c.reset}`);

        if (apiBase) {
          try {
            const url = apiBase.replace(/\/+$/, "").replace(/\/embeddings$/, "") + "/embeddings";
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            const embKey = process.env.EMBEDDING_API_KEY;
            if (embKey) headers["Authorization"] = `Bearer ${embKey}`;
            const resp = await fetch(url, {
              method: "POST",
              headers,
              body: JSON.stringify({ model: model ?? "text-embedding-3-small", input: ["test"] }),
              signal: AbortSignal.timeout(5000),
            });
            if (resp.ok) {
              console.log(`    Connectivity: ${c.green}OK (HTTP ${resp.status})${c.reset}`);
            } else {
              console.log(`    Connectivity: ${c.yellow}HTTP ${resp.status}${c.reset}`);
            }
          } catch {
            console.log(`    Connectivity: ${c.red}FAILED (cannot reach ${apiBase})${c.reset}`);
          }
        }
      } else if (embeddingProvider === "zhipu") {
        console.log(`    ZHIPU_API_KEY: ${process.env.ZHIPU_API_KEY ? `${c.green}(set)${c.reset}` : `${c.red}(not set)${c.reset}`}`);
        console.log(`    Model: ${embeddingModel}`);
      }

      // Search tier detail
      console.log(`\n  ${subheader("Search Tier:")}`);
      console.log(`    Active: ${tierLabel}`);
      if (searchTier === "legacy") {
        console.log(`    ${dimText("Tier 1 (Hybrid): Requires index.db + embedding provider")}`);
        console.log(`    ${dimText("Tier 2 (FTS5):   Requires index.db (built on first recall)")}`);
        console.log(`    ${dimText("Tier 3 (Legacy): In-memory token matching (current)")}`);
      } else if (searchTier === "fts5") {
        console.log(`    ${dimText("To enable Tier 1 (Hybrid), configure an embedding provider")}`);
      }
    }
  } catch (error) {
    console.log(`  ${fail(`Memory system check failed: ${error}`)}`);
  }

  // fix-mem repair
  if (ctx.fixMem) {
    await runFixMem(ctx);
  }
}

async function runFixMem(ctx: DoctorContext) {
  const { ok, fail, warn, header, subheader, dimText } = ctx.formatters;

  console.log(`\n${header("Fixing Memory System...")}`);

  const mcpDir = join(INSTALL_DIR, "mcp");
  const wasmTarget = join(mcpDir, "sql-wasm.wasm");
  let fixCount = 0;

  // Step 1: Ensure WASM file exists
  console.log(`\n  ${subheader("Step 1: WASM Runtime")}`);
  if (existsSync(wasmTarget)) {
    console.log(`    ${ok("sql-wasm.wasm already present")}`);
  } else {
    let wasmSource: string | null = null;

    try {
      const nmPath = require.resolve("sql.js-fts5/dist/sql-wasm.wasm");
      if (nmPath && existsSync(nmPath)) wasmSource = nmPath;
    } catch { /* not available */ }

    if (!wasmSource) {
      const distPath = join(process.cwd(), "dist", "mcp", "sql-wasm.wasm");
      if (existsSync(distPath)) wasmSource = distPath;
    }

    if (!wasmSource) {
      try {
        const pkgPath = require.resolve("@lgcyaxi/oh-my-claude");
        const pkgDir = dirname(pkgPath);
        const npmWasm = join(pkgDir, "mcp", "sql-wasm.wasm");
        if (existsSync(npmWasm)) wasmSource = npmWasm;
      } catch { /* not available */ }
    }

    if (wasmSource) {
      try {
        mkdirSync(mcpDir, { recursive: true });
        copyFileSync(wasmSource, wasmTarget);
        console.log(`    ${ok(`Copied sql-wasm.wasm from ${wasmSource}`)}`);
        fixCount++;
      } catch (e: any) {
        console.log(`    ${fail(`Failed to copy WASM: ${e.message}`)}`);
      }
    } else {
      console.log(`    ${fail("Cannot find sql-wasm.wasm anywhere")}`);
      console.log(`    ${dimText("Try: bun install && bun run build:mcp && oh-my-claude install")}`);
    }
  }

  // Step 2: Rebuild SQLite index from markdown files
  console.log(`\n  ${subheader("Step 2: SQLite Index")}`);
  const memIndexDbPath = join(INSTALL_DIR, "memory", "index.db");

  if (!existsSync(join(mcpDir, "sql-wasm.wasm"))) {
    console.log(`    ${fail("Cannot rebuild index — WASM file missing (fix Step 1 first)")}`);
  } else {
    try {
      const { MemoryIndexer, getMemoryDir, getProjectMemoryDir } = require("../../../../memory");

      const indexer = new MemoryIndexer({ dbPath: memIndexDbPath });
      await indexer.init();

      if (!indexer.isReady()) {
        console.log(`    ${fail("Indexer failed to initialize")}`);
      } else {
        const memDirs: Array<{ path: string; scope: string; projectRoot?: string }> = [];
        const globalDir = getMemoryDir();
        memDirs.push({ path: globalDir, scope: "global" });

        if (ctx.projectRoot) {
          const projectDir = getProjectMemoryDir(ctx.projectRoot);
          if (projectDir) {
            memDirs.push({ path: projectDir, scope: "project", projectRoot: ctx.projectRoot });
          }
        }

        const syncResult = await indexer.syncFiles(memDirs);
        await indexer.flush();
        await indexer.close();

        const total = syncResult.added + syncResult.updated;
        if (total > 0 || syncResult.removed > 0) {
          console.log(`    ${ok(`Index rebuilt: ${syncResult.added} added, ${syncResult.updated} updated, ${syncResult.removed} removed, ${syncResult.unchanged} unchanged`)}`);
          fixCount++;
        } else if (syncResult.unchanged > 0) {
          console.log(`    ${ok(`Index up to date (${syncResult.unchanged} files unchanged)`)}`);
        } else {
          console.log(`    ${warn("No memory files to index")}`);
        }

        try {
          const dbStat = statSync(memIndexDbPath);
          console.log(`    ${dimText(`index.db: ${(dbStat.size / 1024).toFixed(1)} KB`)}`);
        } catch { /* ignore */ }
      }
    } catch (e: any) {
      console.log(`    ${fail(`Index rebuild failed: ${e.message}`)}`);
    }
  }

  // Step 3: Test embedding provider connectivity
  console.log(`\n  ${subheader("Step 3: Embedding Provider")}`);
  const fixEmbProvider = loadConfig().memory?.embedding?.provider ?? "custom";
  if (fixEmbProvider === "none") {
    console.log(`    ${dimText("Embedding disabled (provider: none)")}`);
  } else if (fixEmbProvider === "custom") {
    const apiBase = process.env.EMBEDDING_API_BASE;
    if (!apiBase) {
      console.log(`    ${warn("EMBEDDING_API_BASE not set — embedding disabled")}`);
    } else {
      const model = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
      try {
        const url = apiBase.replace(/\/+$/, "").replace(/\/embeddings$/, "") + "/embeddings";
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        const embKey = process.env.EMBEDDING_API_KEY;
        if (embKey) headers["Authorization"] = `Bearer ${embKey}`;
        const resp = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ model, input: ["fix-mem connectivity test"] }),
          signal: AbortSignal.timeout(10000),
        });
        if (resp.ok) {
          console.log(`    ${ok(`${model} @ ${apiBase} — connectivity OK`)}`);
        } else {
          console.log(`    ${fail(`HTTP ${resp.status} from ${apiBase}`)}`);
        }
      } catch {
        console.log(`    ${fail(`Cannot reach ${apiBase} — is Ollama running?`)}`);
      }
    }
  } else {
    const keyEnv = "ZHIPU_API_KEY";
    const hasKey = !!process.env[keyEnv];
    console.log(`    ${hasKey ? ok(`${fixEmbProvider} API key set`) : fail(`${keyEnv} not set`)}`);
  }

  // Summary
  console.log(`\n  ${fixCount > 0 ? ok(`Fixed ${fixCount} issue(s)`) : ok("No issues to fix")}`);
}
