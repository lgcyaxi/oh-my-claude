import type { PreferenceStore } from '../../shared/preferences';
import type { MemoryIndexer } from '../../memory/indexer';
import type { EmbeddingProvider } from '../../memory/embeddings';
import type { CallToolResult as SdkCallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface ToolContext {
	getProjectRoot(): string | undefined;
	getSessionId(): string | undefined;
	getPrefStore(): PreferenceStore;
	ensureIndexer(): Promise<{
		indexer: MemoryIndexer;
		embeddingProvider: EmbeddingProvider | null;
	}>;
}

export type CallToolResult = SdkCallToolResult;
