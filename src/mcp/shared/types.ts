import type { PreferenceStore } from "../../shared/preferences";
import type { MemoryIndexer } from "../../memory/indexer";
import type { EmbeddingProvider } from "../../memory/embeddings";

export interface ToolContext {
  getProjectRoot(): string | undefined;
  getSessionId(): string | undefined;
  getPrefStore(): PreferenceStore;
  ensureIndexer(): Promise<{ indexer: MemoryIndexer; embeddingProvider: EmbeddingProvider | null }>;
}

export type CallToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};
