#!/usr/bin/env node
/**
 * oh-my-claude Background Agent MCP Server — thin entry point
 *
 * Delegates all tool handling to domain modules under mcp/:
 *   memory/      — remember, recall, get_memory, forget, list_memories, memory_status, compact_memories, clear_memories, summarize_memories
 *   preference/  — add_preference, list_preferences, get_preference, update_preference, delete_preference, match_preferences, preference_stats
 *   proxy/       — switch_model, switch_status, switch_revert
 *   bridge/      — bridge_up, bridge_down, bridge_status, bridge_send
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { memoryToolSchemas, handleMemoryTool } from "../memory";
import { preferenceToolSchemas, handlePreferenceTool } from "../preference";
import { proxyToolSchemas, handleProxyTool } from "../proxy";
import { bridgeToolSchemas, handleBridgeTool } from "../bridge";
import { extractSessionIdFromEnv, resolveProjectRoot } from "../shared/utils";
import type { ToolContext } from "../shared/types";

import { PreferenceStore } from "../../shared/preferences";
import { MemoryIndexer, resolveEmbeddingProvider } from "../../memory";
import type { EmbeddingProvider } from "../../memory";
import { loadConfig } from "../../shared/config";
import { join } from "node:path";
import { homedir } from "node:os";

import { updateStatusFile } from "./manager";
import {
  getMemoryDir,
  getProjectMemoryDir,
  resolveCanonicalRoot,
  regenerateTimelines,
} from "../../memory";
import { existsSync } from "node:fs";

async function main() {
  // ─── Lazy-init shared state ──────────────────────────────────────────────

  let cachedProjectRoot: string | undefined;
  let cachedSessionId: string | undefined;
  let cachedPrefStore: PreferenceStore | null = null;
  let cachedIndexer: MemoryIndexer | null = null;
  let cachedEmbeddingProvider: EmbeddingProvider | null = null;
  let indexerInitPromise: Promise<void> | null = null;

  /** Track last sync time for periodic re-sync */
  let lastSyncTime = 0;
  const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Build the list of memory directories to sync into the index.
   * When running from a worktree, also includes the canonical repo root's
   * memory directory so cross-worktree memories are visible.
   */
  function getMemoryDirsForSync(): Array<{ path: string; scope: "project" | "global"; projectRoot?: string }> {
    const dirs: Array<{ path: string; scope: "project" | "global"; projectRoot?: string }> = [];

    // Global memory directory
    const globalDir = getMemoryDir();
    dirs.push({ path: globalDir, scope: "global" });

    // Project memory directory (if in a git repo)
    if (cachedProjectRoot) {
      const projectDir = getProjectMemoryDir(cachedProjectRoot);
      if (projectDir) {
        dirs.push({ path: projectDir, scope: "project", projectRoot: cachedProjectRoot });
      }

      // If in a worktree, also sync the canonical repo root's memories
      const canonicalRoot = resolveCanonicalRoot(cachedProjectRoot);
      if (canonicalRoot && canonicalRoot !== cachedProjectRoot) {
        const canonicalMemDir = getProjectMemoryDir(canonicalRoot);
        if (canonicalMemDir && existsSync(canonicalMemDir)) {
          dirs.push({ path: canonicalMemDir, scope: "project", projectRoot: canonicalRoot });
        }
      }
    }

    return dirs;
  }

  /**
   * Lazily initialize the SQLite indexer and embedding provider.
   * Called before recall/remember/forget/memory_status operations.
   * Safe to call multiple times — only initializes once.
   */
  async function ensureIndexer(): Promise<{ indexer: MemoryIndexer; embeddingProvider: EmbeddingProvider | null }> {
    // Fast path: already initialized, but periodically re-sync to pick up new files
    if (cachedIndexer?.isReady()) {
      const now = Date.now();
      if (now - lastSyncTime > SYNC_INTERVAL_MS) {
        lastSyncTime = now;
        try {
          const memoryDirs = getMemoryDirsForSync();
          if (memoryDirs.length > 0) {
            await cachedIndexer.syncFiles(memoryDirs);
            await cachedIndexer.flush();
          }
        } catch { /* best-effort periodic sync */ }
      }
      return { indexer: cachedIndexer, embeddingProvider: cachedEmbeddingProvider };
    }

    if (indexerInitPromise) {
      await indexerInitPromise;
      return { indexer: cachedIndexer!, embeddingProvider: cachedEmbeddingProvider };
    }

    indexerInitPromise = (async () => {
      try {
        const dbPath = join(homedir(), ".claude", "oh-my-claude", "memory", "index.db");
        cachedIndexer = new MemoryIndexer({ dbPath });
        await cachedIndexer.init();

        // Resolve embedding provider (explicit selection from config)
        const config = loadConfig();
        cachedEmbeddingProvider = await resolveEmbeddingProvider(config.memory?.embedding);

        // Sync all memory files into the index
        const memoryDirs = getMemoryDirsForSync();
        if (memoryDirs.length > 0) {
          await cachedIndexer.syncFiles(memoryDirs);
          await cachedIndexer.flush();
        }
        lastSyncTime = Date.now();

        // Regenerate timeline on startup for freshness
        try { regenerateTimelines(cachedProjectRoot); } catch { /* best-effort */ }

        const tier = cachedIndexer.isReady() && cachedEmbeddingProvider
          ? "hybrid"
          : cachedIndexer.isReady()
            ? "fts5"
            : "legacy";
        console.error(`[oh-my-claude] Indexer ready (tier: ${tier}, embeddings: ${cachedEmbeddingProvider ? "available" : "none"})`);
      } catch (e) {
        console.error("[oh-my-claude] Indexer init failed (falling back to legacy search):", e);
        cachedIndexer = null;
        cachedEmbeddingProvider = null;
      }
    })();

    await indexerInitPromise;
    return { indexer: cachedIndexer!, embeddingProvider: cachedEmbeddingProvider };
  }

  // ─── ToolContext implementation ──────────────────────────────────────────

  const ctx: ToolContext = {
    getProjectRoot: () => cachedProjectRoot,
    getSessionId: () => cachedSessionId,
    getPrefStore: () => {
      if (!cachedPrefStore) {
        cachedPrefStore = new PreferenceStore(cachedProjectRoot);
      }
      return cachedPrefStore;
    },
    ensureIndexer,
  };

  // ─── Tool registry ────────────────────────────────────────────────────────

  // Bridge workers (OMC_BRIDGE_PANE=1) get only bridge_event (to post results back).
  // They cannot spawn nested workers or manage bridge state.
  const isBridgeWorker = process.env.OMC_BRIDGE_PANE === "1";
  const workerBridgeTools = bridgeToolSchemas.filter(t => t.name === "bridge_event");

  const tools = [
    ...memoryToolSchemas,
    ...preferenceToolSchemas,
    ...proxyToolSchemas,
    ...(isBridgeWorker ? workerBridgeTools : bridgeToolSchemas),
  ];

  // ─── MCP server ───────────────────────────────────────────────────────────

  const server = new Server(
    { name: "oh-my-claude", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      const handlers = [
        handleMemoryTool,
        handlePreferenceTool,
        handleProxyTool,
        handleBridgeTool,
      ];

      for (const handler of handlers) {
        const result = await handler(name, args as Record<string, unknown>, ctx);
        if (result !== undefined) return result;
      }

      return {
        content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
        isError: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  // ─── Startup ──────────────────────────────────────────────────────────────

  // Resolve project root at startup for memory isolation
  cachedProjectRoot = resolveProjectRoot();
  if (cachedProjectRoot) {
    console.error(`[oh-my-claude] Project root: ${cachedProjectRoot}`);
  }

  // Extract session ID from ANTHROPIC_BASE_URL for session-scoped proxy operations
  cachedSessionId = extractSessionIdFromEnv();
  if (cachedSessionId) {
    console.error(`[oh-my-claude] Session ID: ${cachedSessionId}`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Write initial status file for statusline display
  updateStatusFile();

  console.error("oh-my-claude Background Agent MCP Server running");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
