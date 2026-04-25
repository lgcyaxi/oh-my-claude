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

import { basename } from 'node:path';
import type { MemoryEntry, MemorySearchOptions, SearchTier } from './types';
import { listMemories } from './store';
import type { MemoryIndexer, FTSSearchResult } from './indexer';
import type { EmbeddingProvider } from './embeddings';
import { cosineSimilarity } from './embeddings';
import { mergeHybridResults } from './hybrid-search';
import type { HybridSearchWeights } from './hybrid-search';
import type { VectorSearchResult } from './hybrid-search';

/**
 * Search result with relevance score and optional snippet
 */
export interface SearchResult {
	entry: MemoryEntry;
	score: number;
	/** Matched fields (legacy tier only) */
	matchedFields: ('title' | 'content' | 'tags')[];
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
 * Envelope returned by `searchMemoriesEnvelope` that reports both the
 * results and the actual executed tier (which may differ from the
 * capability tier — e.g. "hybrid-capable" but ran FTS5-only because the
 * embedding cache was empty). Introduced in beta.8 (HIGH-10).
 */
export interface SearchEnvelope {
	results: SearchResult[];
	/** Tier the caller advertised as available (hybrid/fts5/legacy). */
	capabilityTier: SearchTier;
	/** Tier that actually ran (hybrid requires both FTS matches AND vectors). */
	executedTier: SearchTier;
}

/**
 * Search memories with three-tier automatic degradation.
 *
 * Backwards-compatible wrapper around {@link searchMemoriesEnvelope} —
 * returns only the results array. Prefer the envelope variant when you
 * need to report the executed tier to users (MCP recall, statusline).
 */
export async function searchMemories(
	options: MemorySearchOptions,
	projectRoot?: string,
	tiered?: TieredSearchOptions,
): Promise<SearchResult[]> {
	const envelope = await searchMemoriesEnvelope(
		options,
		projectRoot,
		tiered,
	);
	return envelope.results;
}

/**
 * Variant of {@link searchMemories} that also reports which tier was
 * actually executed (see {@link SearchEnvelope}). Introduced in beta.8.
 */
export async function searchMemoriesEnvelope(
	options: MemorySearchOptions,
	projectRoot?: string,
	tiered?: TieredSearchOptions,
): Promise<SearchEnvelope> {
	const indexer = tiered?.indexer;
	const embeddingProvider = tiered?.embeddingProvider;
	const snippetMaxChars = tiered?.snippetMaxChars ?? 300;

	// Determine available tier
	const capabilityTier: SearchTier =
		indexer?.isReady() && embeddingProvider
			? 'hybrid'
			: indexer?.isReady()
				? 'fts5'
				: 'legacy';

	// If no query, tier doesn't matter — just list and return
	if (!options.query || options.query.trim().length === 0) {
		return {
			results: searchLegacy(options, projectRoot),
			capabilityTier,
			executedTier: 'legacy',
		};
	}

	// Tier 1 or 2: Use indexer
	if (capabilityTier !== 'legacy' && indexer?.isReady() && options.query) {
		try {
			const limit = options.limit ?? 5;

			// Augment query with tags and concepts for better FTS/vector matching.
			// Tags like ["ulw", "permissions"] and concepts like ["authentication"] become extra search terms.
			let augmentedQuery = options.query;
			if (options.tags && options.tags.length > 0) {
				augmentedQuery = `${options.query} ${options.tags.join(' ')}`;
			}
			if (options.concepts && options.concepts.length > 0) {
				augmentedQuery = `${augmentedQuery} ${options.concepts.join(' ')}`;
			}

			if (capabilityTier === 'hybrid' && embeddingProvider) {
				const results = await searchHybrid(
					augmentedQuery,
					limit,
					indexer,
					embeddingProvider,
					options,
					projectRoot,
					tiered?.hybridWeights,
					snippetMaxChars,
				);
				// Executed tier read off the (uniform) per-result tag
				// assigned inside searchHybrid → convertChunkResults. If
				// the hybrid path downgraded to FTS-only (no embeddings)
				// the results carry 'fts5'; otherwise 'hybrid'.
				const executedTier: SearchTier =
					results[0]?.searchTier ?? 'hybrid';
				return {
					results,
					capabilityTier,
					executedTier,
				};
			}

			const fts = await searchFTS5(
				augmentedQuery,
				limit,
				indexer,
				options,
				projectRoot,
				snippetMaxChars,
			);
			return {
				results: fts,
				capabilityTier,
				executedTier: 'fts5',
			};
		} catch (e) {
			console.error(
				`[search] Tier ${capabilityTier} failed, falling back to legacy:`,
				e,
			);
		}
	}

	// Tier 3: Legacy in-memory search
	return {
		results: searchLegacy(options, projectRoot),
		capabilityTier,
		executedTier: 'legacy',
	};
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
	let embeddingsAvailable = 0;
	try {
		const queryVec = await embeddingProvider.embed(query);
		const embeddings = await indexer.getEmbeddings(
			embeddingProvider.name,
			embeddingProvider.model,
		);
		embeddingsAvailable = embeddings.size;

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
		console.error('[search] Vector search failed, using FTS only:', e);
	}

	// HIGH-10 (beta.8): If no vectors were available for ANY chunk — e.g.
	// the embedding cache is empty because the embed-on-write pipeline has
	// never run and no background backfill happened — then we just ran an
	// FTS5-only search even though the indexer reported 'hybrid' capability.
	// Tag the results truthfully so callers (statusline, MCP envelope,
	// dashboard) can surface the actual executed tier.
	const hadVectors = embeddingsAvailable > 0;
	const executedTier: SearchTier = hadVectors ? 'hybrid' : 'fts5';

	// Merge results (no-op for vectorResults when hadVectors=false)
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
	return await convertChunkResults(
		merged.slice(0, limit),
		ftsResults,
		executedTier,
		snippetMaxChars,
		options,
		projectRoot,
		indexer,
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

	const results = await convertChunkResults(
		ftsResults.map((f) => ({
			chunkId: f.chunkId,
			score: normalizeRank(f.rank),
			textScore: normalizeRank(f.rank),
			vectorScore: 0,
		})),
		ftsResults,
		'fts5',
		snippetMaxChars,
		options,
		projectRoot,
		indexer,
	);
	return results.slice(0, limit);
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
			matchedFields: [] as ('title' | 'content' | 'tags')[],
			searchTier: 'legacy' as SearchTier,
		}));
		return applyLimitAndSort(results, options);
	}

	let filtered = entries;

	// Category filter
	if (options.category) {
		const cats = Array.isArray(options.category)
			? options.category
			: [options.category];
		const catSet = new Set(cats);
		filtered = filtered.filter(
			(entry) => entry.category && catSet.has(entry.category),
		);
	}

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
			matchedFields: [] as ('title' | 'content' | 'tags')[],
			searchTier: 'legacy' as SearchTier,
		}));
		return applyLimitAndSort(results, options);
	}

	const results: SearchResult[] = [];
	for (const entry of filtered) {
		const result = scoreEntry(entry, tokens);
		if (result.score > 0) {
			results.push({ ...result, searchTier: 'legacy' });
		}
	}

	return applyLimitAndSort(results, options);
}

// ---- Helpers ----

/**
 * Convert chunk-level results to SearchResult format.
 * Deduplicates by file (takes highest-scoring chunk per file).
 *
 * When indexer is available, uses batch SQL lookup for metadata (title, type, tags, concepts, createdAt)
 * instead of reading every file from disk via listMemories(). This is the "progressive disclosure"
 * optimization — recall returns lightweight snippets, get_memory provides full content.
 */
async function convertChunkResults(
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
	indexer?: MemoryIndexer,
): Promise<SearchResult[]> {
	// Build lookup from chunkId to FTS result for metadata
	const chunkMap = new Map<string, FTSSearchResult>();
	for (const f of ftsResults) {
		chunkMap.set(f.chunkId, f);
	}

	// Collect unique file paths for batch lookup
	const uniquePaths = new Set<string>();
	for (const merged of mergedResults) {
		const chunk = chunkMap.get(merged.chunkId);
		if (chunk) uniquePaths.add(chunk.path);
	}

	// Batch metadata lookup from index (single SQL query, no disk reads)
	let indexedFiles: Map<string, import('./indexer').IndexedFile> | undefined;
	if (indexer?.isReady()) {
		try {
			indexedFiles = await indexer.getFilesByPaths(
				Array.from(uniquePaths),
			);
		} catch {
			// Fall through to legacy enrichment
		}
	}

	// Deduplicate by file path (take best chunk per file)
	const seenFiles = new Map<string, SearchResult>();

	for (const merged of mergedResults) {
		const chunk = chunkMap.get(merged.chunkId);
		if (!chunk) continue;

		const fileId = basename(chunk.path, '.md');

		if (
			seenFiles.has(chunk.path) &&
			seenFiles.get(chunk.path)!.score >= merged.score
		) {
			continue;
		}

		// Create snippet from chunk text
		const snippet =
			chunk.text.length <= snippetMaxChars
				? chunk.text
				: chunk.text.slice(0, snippetMaxChars) + '...';

		// Build a minimal MemoryEntry — use snippet as content (not full file)
		const entry: MemoryEntry = {
			id: fileId,
			title: fileId,
			type: 'note',
			tags: [],
			content: snippet,
			createdAt: '',
			updatedAt: '',
		};

		// Enrich from index metadata (preferred — no disk reads)
		const indexed = indexedFiles?.get(chunk.path);
		if (indexed) {
			if (indexed.title) entry.title = indexed.title;
			if (indexed.type) entry.type = indexed.type as 'note' | 'session';
			if (indexed.category)
				entry.category =
					indexed.category as import('./types').MemoryCategory;
			if (indexed.tags) {
				try {
					entry.tags = JSON.parse(indexed.tags);
				} catch {
					/* ignore */
				}
			}
			if (indexed.concepts) {
				try {
					entry.concepts = JSON.parse(indexed.concepts);
				} catch {
					/* ignore */
				}
			}
			if (indexed.filesTouched) {
				try {
					entry.files = JSON.parse(indexed.filesTouched);
				} catch {
					/* ignore */
				}
			}
			if (indexed.createdAt) entry.createdAt = indexed.createdAt;
		} else {
			// Fallback: enrich from store (disk reads)
			try {
				const entries = listMemories(
					{ scope: options.scope ?? 'all' },
					projectRoot,
				);
				const fullEntry = entries.find((e) => e.id === fileId);
				if (fullEntry) {
					entry.title = fullEntry.title;
					entry.type = fullEntry.type;
					entry.tags = fullEntry.tags;
					if (fullEntry.concepts) entry.concepts = fullEntry.concepts;
					if (fullEntry.files) entry.files = fullEntry.files;
					entry.createdAt = fullEntry.createdAt;
					entry.updatedAt = fullEntry.updatedAt;
				}
			} catch {
				// ignore enrichment errors
			}
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

	let results = Array.from(seenFiles.values());

	// Post-filter by category if specified
	if (options.category) {
		const cats = Array.isArray(options.category)
			? options.category
			: [options.category];
		const catSet = new Set(cats);
		results = results.filter(
			(r) => r.entry.category && catSet.has(r.entry.category),
		);
	}

	results.sort((a, b) => b.score - a.score);
	return results;
}

/**
 * Normalize FTS5 BM25 rank to 0-1 score.
 * BM25 rank is negative; more negative = better match.
 */
function normalizeRank(rank: number): number {
	return 1 / (1 + Math.abs(rank));
}

function tokenize(query: string): string[] {
	return query
		.toLowerCase()
		.split(/\s+/)
		.filter((w) => w.length > 0);
}

function scoreEntry(
	entry: MemoryEntry,
	tokens: string[],
): {
	entry: MemoryEntry;
	score: number;
	matchedFields: ('title' | 'content' | 'tags')[];
} {
	const titleLower = entry.title.toLowerCase();
	const contentLower = entry.content.toLowerCase();
	const tagsLower = entry.tags.map((t) => t.toLowerCase());

	let score = 0;
	const matchedFields = new Set<'title' | 'content' | 'tags'>();

	for (const token of tokens) {
		if (titleLower.includes(token)) {
			score += 3;
			matchedFields.add('title');
		}
		if (tagsLower.some((t) => t.includes(token))) {
			score += 2;
			matchedFields.add('tags');
		}
		if (contentLower.includes(token)) {
			score += 1;
			matchedFields.add('content');
		}
	}

	const queryJoined = tokens.join(' ');
	if (titleLower === queryJoined) score += 5;

	return { entry, score, matchedFields: Array.from(matchedFields) };
}

function applyLimitAndSort(
	results: SearchResult[],
	options: MemorySearchOptions,
): SearchResult[] {
	const sort = options.sort ?? 'relevance';
	switch (sort) {
		case 'relevance':
			results.sort((a, b) => b.score - a.score);
			break;
		case 'newest':
			results.sort((a, b) =>
				b.entry.createdAt.localeCompare(a.entry.createdAt),
			);
			break;
		case 'oldest':
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
