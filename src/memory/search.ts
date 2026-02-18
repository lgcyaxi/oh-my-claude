/**
 * Memory Search Module — Three-Tier Architecture
 *
 * Search tiers (automatic degradation):
 * - Tier 1 (Hybrid): FTS5 BM25 + Vector cosine → merged results (requires indexer + embeddings)
 * - Tier 2 (FTS5): FTS5 BM25 keyword search (requires indexer, no embeddings)
 * - Tier 3 (Legacy): In-memory token matching (no indexer, current behavior)
 *
 * All tiers return the same SearchResult shape.
 * Callers pass optional indexer/embeddingProvider to enable higher tiers.
 */

import { basename } from "node:path";
import type { MemoryEntry, MemorySearchOptions, SearchTier } from "./types";
import { listMemories } from "./store";
import type { MemoryIndexer, FTSSearchResult } from "./indexer";
import type { EmbeddingProvider } from "./embeddings";
import { cosineSimilarity } from "./embeddings";
import { mergeHybridResults } from "./hybrid-search";
import type { HybridSearchWeights } from "./hybrid-search";
import type { VectorSearchResult } from "./hybrid-search";

/**
 * Search result with relevance score and optional snippet
 */
export interface SearchResult {
  entry: MemoryEntry;
  score: number;
  /** Matched fields (legacy tier only) */
  matchedFields: ("title" | "content" | "tags")[];
  /** Which search tier produced this result */
  searchTier?: SearchTier;
  /** Snippet from matched chunk (~300 chars) */
  snippet?: string;
  /** Location of the matched chunk within the file */
  chunkLocation?: {
    file: string;
    startLine: number;
    endLine: number;
  };
}

/**
 * Options for three-tier search
 */
export interface TieredSearchOptions {
  indexer?: MemoryIndexer | null;
  embeddingProvider?: EmbeddingProvider | null;
  hybridWeights?: Partial<HybridSearchWeights>;
  snippetMaxChars?: number;
}

/**
 * Search memories with three-tier automatic degradation.
 *
 * @param options - Search query and filters
 * @param projectRoot - Explicit project root for scoped search
 * @param tiered - Optional indexer + embedding provider for higher tiers
 */
export async function searchMemories(
  options: MemorySearchOptions,
  projectRoot?: string,
  tiered?: TieredSearchOptions,
): Promise<SearchResult[]> {
  const indexer = tiered?.indexer;
  const embeddingProvider = tiered?.embeddingProvider;
  const snippetMaxChars = tiered?.snippetMaxChars ?? 300;

  // Determine available tier
  const tier: SearchTier =
    indexer?.isReady() && embeddingProvider
      ? "hybrid"
      : indexer?.isReady()
        ? "fts5"
        : "legacy";

  // If no query, tier doesn't matter — just list and return
  if (!options.query || options.query.trim().length === 0) {
    return searchLegacy(options, projectRoot);
  }

  // Tier 1 or 2: Use indexer
  if (tier !== "legacy" && indexer?.isReady() && options.query) {
    try {
      const limit = options.limit ?? 5;

      // Augment query with tags for better FTS/vector matching.
      // Tags like ["ulw", "permissions"] become extra search terms.
      let augmentedQuery = options.query;
      if (options.tags && options.tags.length > 0) {
        augmentedQuery = `${options.query} ${options.tags.join(" ")}`;
      }

      if (tier === "hybrid" && embeddingProvider) {
        return await searchHybrid(
          augmentedQuery,
          limit,
          indexer,
          embeddingProvider,
          options,
          projectRoot,
          tiered?.hybridWeights,
          snippetMaxChars,
        );
      } else {
        return await searchFTS5(
          augmentedQuery,
          limit,
          indexer,
          options,
          projectRoot,
          snippetMaxChars,
        );
      }
    } catch (e) {
      console.error(`[search] Tier ${tier} failed, falling back to legacy:`, e);
    }
  }

  // Tier 3: Legacy in-memory search
  return searchLegacy(options, projectRoot);
}

// ---- Tier 1: Hybrid (FTS5 + Vector) ----

async function searchHybrid(
  query: string,
  limit: number,
  indexer: MemoryIndexer,
  embeddingProvider: EmbeddingProvider,
  options: MemorySearchOptions,
  projectRoot?: string,
  weights?: Partial<HybridSearchWeights>,
  snippetMaxChars = 300,
): Promise<SearchResult[]> {
  const candidateLimit = limit * 4;

  // FTS5 BM25 search
  const ftsResults = await indexer.searchFTS(
    query,
    candidateLimit,
    options.scope,
    projectRoot,
  );

  // Vector search
  let vectorResults: VectorSearchResult[] = [];
  try {
    const queryVec = await embeddingProvider.embed(query);
    const embeddings = await indexer.getEmbeddings(
      embeddingProvider.name,
      embeddingProvider.model,
    );

    // Compute cosine similarity for all chunks
    const scored: VectorSearchResult[] = [];
    for (const [chunkId, vec] of embeddings) {
      const score = cosineSimilarity(queryVec, vec);
      if (score > 0.3) {
        scored.push({ chunkId, score });
      }
    }

    // Sort by score descending, take top candidates
    scored.sort((a, b) => b.score - a.score);
    vectorResults = scored.slice(0, candidateLimit);
  } catch (e) {
    console.error("[search] Vector search failed, using FTS only:", e);
  }

  // Merge results
  const merged = mergeHybridResults(
    ftsResults.map((f) => ({
      chunkId: f.chunkId,
      path: f.path,
      scope: f.scope,
      startLine: f.startLine,
      endLine: f.endLine,
      text: f.text,
      rank: f.rank,
    })),
    vectorResults,
    weights,
  );

  // Convert to SearchResult format
  return convertChunkResults(
    merged.slice(0, limit),
    ftsResults,
    "hybrid",
    snippetMaxChars,
    options,
    projectRoot,
  );
}

// ---- Tier 2: FTS5 Only ----

async function searchFTS5(
  query: string,
  limit: number,
  indexer: MemoryIndexer,
  options: MemorySearchOptions,
  projectRoot?: string,
  snippetMaxChars = 300,
): Promise<SearchResult[]> {
  const ftsResults = await indexer.searchFTS(
    query,
    limit * 2,
    options.scope,
    projectRoot,
  );

  if (ftsResults.length === 0) {
    // Fall back to legacy if FTS returns nothing
    return searchLegacy(options, projectRoot);
  }

  return convertChunkResults(
    ftsResults.map((f) => ({
      chunkId: f.chunkId,
      score: normalizeRank(f.rank),
      textScore: normalizeRank(f.rank),
      vectorScore: 0,
    })),
    ftsResults,
    "fts5",
    snippetMaxChars,
    options,
    projectRoot,
  ).slice(0, limit);
}

// ---- Tier 3: Legacy In-Memory ----

function searchLegacy(
  options: MemorySearchOptions,
  projectRoot?: string,
): SearchResult[] {
  const entries = listMemories(
    { type: options.type, scope: options.scope },
    projectRoot,
  );

  if (!options.query || options.query.trim().length === 0) {
    const results = entries.map((entry) => ({
      entry,
      score: 1,
      matchedFields: [] as ("title" | "content" | "tags")[],
      searchTier: "legacy" as SearchTier,
    }));
    return applyLimitAndSort(results, options);
  }

  let filtered = entries;
  if (options.tags && options.tags.length > 0) {
    const filterTags = new Set(options.tags.map((t) => t.toLowerCase()));
    filtered = filtered.filter((entry) =>
      entry.tags.some((t) => filterTags.has(t.toLowerCase())),
    );
  }

  const tokens = tokenize(options.query);
  if (tokens.length === 0) {
    const results = filtered.map((entry) => ({
      entry,
      score: 1,
      matchedFields: [] as ("title" | "content" | "tags")[],
      searchTier: "legacy" as SearchTier,
    }));
    return applyLimitAndSort(results, options);
  }

  const results: SearchResult[] = [];
  for (const entry of filtered) {
    const result = scoreEntry(entry, tokens);
    if (result.score > 0) {
      results.push({ ...result, searchTier: "legacy" });
    }
  }

  return applyLimitAndSort(results, options);
}

// ---- Helpers ----

/**
 * Convert chunk-level results to SearchResult format.
 * Deduplicates by file (takes highest-scoring chunk per file).
 */
function convertChunkResults(
  mergedResults: Array<{
    chunkId: string;
    score: number;
    textScore?: number;
    vectorScore?: number;
  }>,
  ftsResults: FTSSearchResult[],
  tier: SearchTier,
  snippetMaxChars: number,
  options: MemorySearchOptions,
  projectRoot?: string,
): SearchResult[] {
  // Build lookup from chunkId to FTS result for metadata
  const chunkMap = new Map<string, FTSSearchResult>();
  for (const f of ftsResults) {
    chunkMap.set(f.chunkId, f);
  }

  // Deduplicate by file path (take best chunk per file)
  const seenFiles = new Map<string, SearchResult>();

  for (const merged of mergedResults) {
    const chunk = chunkMap.get(merged.chunkId);
    if (!chunk) continue;

    const fileId = basename(chunk.path, ".md");

    if (seenFiles.has(chunk.path) && seenFiles.get(chunk.path)!.score >= merged.score) {
      continue;
    }

    // Create snippet from chunk text
    const snippet =
      chunk.text.length <= snippetMaxChars
        ? chunk.text
        : chunk.text.slice(0, snippetMaxChars) + "...";

    // Build a minimal MemoryEntry for compatibility
    const entry: MemoryEntry = {
      id: fileId,
      title: fileId, // Will be enriched if we have the file metadata
      type: "note",
      tags: [],
      content: chunk.text,
      createdAt: "",
      updatedAt: "",
    };

    // Try to enrich from store
    try {
      const entries = listMemories(
        { scope: options.scope ?? "all" },
        projectRoot,
      );
      const fullEntry = entries.find((e) => e.id === fileId);
      if (fullEntry) {
        entry.title = fullEntry.title;
        entry.type = fullEntry.type;
        entry.tags = fullEntry.tags;
        entry.createdAt = fullEntry.createdAt;
        entry.updatedAt = fullEntry.updatedAt;
        entry.content = fullEntry.content;
      }
    } catch {
      // ignore enrichment errors
    }

    seenFiles.set(chunk.path, {
      entry,
      score: merged.score,
      matchedFields: [],
      searchTier: tier,
      snippet,
      chunkLocation: {
        file: chunk.path,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
      },
    });
  }

  const results = Array.from(seenFiles.values());
  results.sort((a, b) => b.score - a.score);
  return results;
}

/**
 * Normalize FTS5 BM25 rank to 0-1 score.
 * BM25 rank is negative; more negative = better match.
 */
function normalizeRank(rank: number): number {
  return 1 / (1 + Math.max(0, rank));
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

function scoreEntry(
  entry: MemoryEntry,
  tokens: string[]
): { entry: MemoryEntry; score: number; matchedFields: ("title" | "content" | "tags")[] } {
  const titleLower = entry.title.toLowerCase();
  const contentLower = entry.content.toLowerCase();
  const tagsLower = entry.tags.map((t) => t.toLowerCase());

  let score = 0;
  const matchedFields = new Set<"title" | "content" | "tags">();

  for (const token of tokens) {
    if (titleLower.includes(token)) {
      score += 3;
      matchedFields.add("title");
    }
    if (tagsLower.some((t) => t.includes(token))) {
      score += 2;
      matchedFields.add("tags");
    }
    if (contentLower.includes(token)) {
      score += 1;
      matchedFields.add("content");
    }
  }

  const queryJoined = tokens.join(" ");
  if (titleLower === queryJoined) score += 5;

  return { entry, score, matchedFields: Array.from(matchedFields) };
}

function applyLimitAndSort(
  results: SearchResult[],
  options: MemorySearchOptions
): SearchResult[] {
  const sort = options.sort ?? "relevance";
  switch (sort) {
    case "relevance":
      results.sort((a, b) => b.score - a.score);
      break;
    case "newest":
      results.sort((a, b) =>
        b.entry.createdAt.localeCompare(a.entry.createdAt),
      );
      break;
    case "oldest":
      results.sort((a, b) =>
        a.entry.createdAt.localeCompare(b.entry.createdAt),
      );
      break;
  }

  if (options.limit && options.limit > 0) {
    return results.slice(0, options.limit);
  }
  return results;
}
