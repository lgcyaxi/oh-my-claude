/**
 * Hybrid Search
 *
 * Merges FTS5 BM25 keyword results with vector cosine similarity results.
 * Produces a unified ranked result list using configurable weights.
 *
 * Default weights: vectorWeight: 0.7, textWeight: 0.3
 * BM25 score normalization: textScore = 1 / (1 + max(0, rank))
 * Final: score = vectorWeight * vectorScore + textWeight * textScore
 */

import type { FTSSearchResult } from "./indexer";

// ---- Types ----

export interface VectorSearchResult {
  chunkId: string;
  score: number;
}

export interface MergedSearchResult {
  chunkId: string;
  score: number;
  textScore: number;
  vectorScore: number;
}

export interface HybridSearchWeights {
  vectorWeight: number;
  textWeight: number;
  /** How many candidates to fetch from each source (multiplier of final limit) */
  candidateMultiplier: number;
}

// ---- Constants ----

export const DEFAULT_HYBRID_WEIGHTS: HybridSearchWeights = {
  vectorWeight: 0.7,
  textWeight: 0.3,
  candidateMultiplier: 4,
};

// ---- Merge Logic ----

/**
 * Merge FTS5 BM25 results with vector search results into a unified ranked list.
 *
 * Results that appear in both FTS and vector get combined scores.
 * Vector-only results (no keyword match) are included with zero text score.
 */
export function mergeHybridResults(
  ftsResults: FTSSearchResult[],
  vectorResults: VectorSearchResult[],
  weights?: Partial<HybridSearchWeights>,
): MergedSearchResult[] {
  const w = { ...DEFAULT_HYBRID_WEIGHTS, ...weights };
  const merged = new Map<string, MergedSearchResult>();

  // Process FTS results
  for (const fts of ftsResults) {
    // BM25 rank normalization: lower rank = better, convert to 0-1 score
    const textScore = 1 / (1 + Math.max(0, fts.rank));

    merged.set(fts.chunkId, {
      chunkId: fts.chunkId,
      score: w.textWeight * textScore,
      textScore,
      vectorScore: 0,
    });
  }

  // Process vector results
  for (const vec of vectorResults) {
    const existing = merged.get(vec.chunkId);

    if (existing) {
      // Chunk found in both FTS and vector — combine scores
      existing.vectorScore = vec.score;
      existing.score += w.vectorWeight * vec.score;
    } else {
      // Vector-only result
      merged.set(vec.chunkId, {
        chunkId: vec.chunkId,
        score: w.vectorWeight * vec.score,
        textScore: 0,
        vectorScore: vec.score,
      });
    }
  }

  // Sort by score descending
  const results = Array.from(merged.values());
  results.sort((a, b) => b.score - a.score);

  return results;
}
