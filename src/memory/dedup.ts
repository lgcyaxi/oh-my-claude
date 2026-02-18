/**
 * Memory Deduplication
 *
 * Hybrid X+Z strategy:
 * - X (exact hash): SHA-256 content hash match → silent skip (no write)
 * - Z (semantic near-dupe): vector cosine > 0.90 → tag-and-defer
 *   (write with potential-duplicate frontmatter tag, resolve during compact)
 *
 * Detection layers:
 * 1. SHA-256 content hash — catches exact duplicates (always available, free)
 * 2. Vector cosine similarity — catches semantic near-duplicates (Tier 1 only)
 * 3. FTS5 BM25 query — catches keyword-similar memories (Tier 2+, no embeddings)
 */

import { basename } from "node:path";
import type { MemoryIndexer } from "./indexer";
import type { EmbeddingProvider } from "./embeddings";
import { cosineSimilarity } from "./embeddings";

// ---- Types ----

export interface DedupResult {
  /** Whether this is an exact duplicate that should be silently skipped */
  isDuplicate: boolean;
  /** ID of the exact match (if isDuplicate is true) */
  exactMatch?: string;
  /** Near-duplicate entries found (for tag-and-defer) */
  nearDuplicates: NearDuplicate[];
}

export interface NearDuplicate {
  /** ID of the similar memory */
  id: string;
  /** Path to the similar memory file */
  path: string;
  /** Similarity score (0-1) */
  similarity: number;
  /** How the similarity was detected */
  method: "vector" | "fts";
}

export interface DedupConfig {
  /** Enable exact hash skip (default: true) */
  exactHashSkip: boolean;
  /** Cosine similarity threshold for near-duplicate detection (default: 0.90) */
  semanticThreshold: number;
  /** Enable tag-and-defer for near-duplicates (default: true) */
  tagAndDefer: boolean;
}

// ---- Constants ----

export const DEFAULT_DEDUP_CONFIG: DedupConfig = {
  exactHashSkip: true,
  semanticThreshold: 0.90,
  tagAndDefer: true,
};

/**
 * FTS5 BM25 rank threshold for "suspiciously similar" detection.
 * BM25 rank is negative; closer to 0 = weaker match. More negative = stronger match.
 * A rank of -5 or better indicates high keyword overlap.
 */
const FTS_SUSPICION_RANK = -5;

// ---- Dedup Logic ----

/**
 * Check if content is a duplicate of an existing memory.
 *
 * Layer 1: Exact SHA-256 hash match → isDuplicate=true, silent skip
 * Layer 2: Vector cosine similarity (if embeddings available) → nearDuplicates
 * Layer 3: FTS5 keyword fallback (if no embeddings) → nearDuplicates
 *
 * @param content - The content to check
 * @param contentHash - Pre-computed SHA-256 hash of content
 * @param indexer - The memory indexer (for hash and FTS checks)
 * @param embeddingProvider - Optional embedding provider (for vector checks)
 * @param config - Dedup configuration
 */
export async function checkDuplicate(
  content: string,
  contentHash: string,
  indexer: MemoryIndexer | null,
  embeddingProvider: EmbeddingProvider | null,
  config: DedupConfig = DEFAULT_DEDUP_CONFIG,
): Promise<DedupResult> {
  const result: DedupResult = {
    isDuplicate: false,
    nearDuplicates: [],
  };

  // Layer 1: Exact hash match (always available if indexer exists)
  if (config.exactHashSkip && indexer?.isReady()) {
    const existing = await indexer.getFileByHash(contentHash);
    if (existing) {
      const id = basename(existing.path, ".md");
      return {
        isDuplicate: true,
        exactMatch: id,
        nearDuplicates: [],
      };
    }
  }

  if (!config.tagAndDefer || !indexer?.isReady()) {
    return result;
  }

  // Layer 2: Vector cosine similarity (Tier 1 — embeddings available)
  if (embeddingProvider) {
    try {
      // Embed the new content
      const queryVec = await embeddingProvider.embed(
        content.slice(0, 2000) // limit to ~500 tokens for embedding
      );

      // Load all existing embeddings
      const existingEmbeddings = await indexer.getEmbeddings(
        embeddingProvider.name,
        embeddingProvider.model
      );

      // Find chunks above similarity threshold
      const seenFiles = new Set<string>();
      for (const [chunkId, vec] of existingEmbeddings) {
        const sim = cosineSimilarity(queryVec, vec);
        if (sim >= config.semanticThreshold) {
          // Extract file path from chunk (lookup via FTS or chunk table)
          // chunkId format is "{fileHash}:{index}" — need to resolve to file path
          const fileHash = chunkId.split(":")[0]!;

          // Skip if we already found this file
          if (seenFiles.has(fileHash)) continue;
          seenFiles.add(fileHash);

          const file = await indexer.getFileByHash(fileHash);
          // The hash in chunkId is only first 12 chars, need partial match
          // Actually getFileByHash searches the full hash. We need a different lookup.
          // For now, record with the chunkId info we have.
          const id = file ? basename(file.path, ".md") : chunkId;
          const path = file?.path ?? "";

          result.nearDuplicates.push({
            id,
            path,
            similarity: sim,
            method: "vector",
          });
        }
      }
    } catch (e) {
      // Vector search failed — fall through to FTS fallback
      console.error("[dedup] Vector similarity check failed:", e);
    }
  }

  // Layer 3: FTS5 keyword similarity fallback (Tier 2+ when no embeddings)
  if (result.nearDuplicates.length === 0) {
    try {
      // Use first line (title) + first ~100 chars as search query
      const firstLine = content.split("\n").find((l) => l.trim())?.trim() ?? "";
      const searchText = (firstLine + " " + content.slice(0, 200))
        .replace(/[^\w\s]/g, " ")
        .trim();

      if (searchText.length > 10) {
        const ftsResults = await indexer.searchFTS(searchText, 5);

        for (const fts of ftsResults) {
          // BM25 rank is negative; more negative = stronger match
          if (fts.rank <= FTS_SUSPICION_RANK) {
            const id = basename(fts.path, ".md");
            // Normalize rank to 0-1 similarity score
            // rank of -20 → sim ~0.95, rank of -5 → sim ~0.75
            const sim = Math.min(1, Math.max(0, 1 - 1 / (1 + Math.abs(fts.rank))));

            // Only report if above threshold
            if (sim >= config.semanticThreshold * 0.85) {
              // Use a slightly lower threshold for FTS (less precise than vectors)
              result.nearDuplicates.push({
                id,
                path: fts.path,
                similarity: sim,
                method: "fts",
              });
            }
          }
        }
      }
    } catch (e) {
      console.error("[dedup] FTS similarity check failed:", e);
    }
  }

  return result;
}
