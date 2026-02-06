/**
 * Embedding Provider
 *
 * Abstraction for vector embeddings used in semantic memory search.
 * Provider cascade: ZhiPu embedding-3 → OpenRouter text-embedding-3-small → null (no embeddings)
 *
 * When no provider is available, the system degrades to FTS5-only search (Tier 2)
 * or legacy in-memory search (Tier 3).
 *
 * Both providers use the OpenAI-compatible embeddings API format:
 *   POST /v1/embeddings { model, input }
 *   → { data: [{ embedding: number[] }] }
 */

// ---- Types ----

export interface EmbeddingProvider {
  /** Provider name for display and caching */
  name: string;
  /** Model identifier */
  model: string;
  /** Embedding dimensions */
  dimensions: number;
  /** Embed a single text */
  embed(text: string): Promise<number[]>;
  /** Embed multiple texts in batch */
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface EmbeddingConfig {
  /** Primary provider (default: zhipu) */
  provider: "zhipu" | "openrouter" | "none";
  /** Model name */
  model: string;
  /** Fallback provider */
  fallback: "openrouter" | "none";
}

// ---- Constants ----

const ZHIPU_EMBEDDING_URL = "https://open.bigmodel.cn/api/paas/v4/embeddings";
const ZHIPU_DEFAULT_MODEL = "embedding-3";
const ZHIPU_DIMENSIONS = 1024;

const OPENROUTER_EMBEDDING_URL = "https://openrouter.ai/api/v1/embeddings";
const OPENROUTER_DEFAULT_MODEL = "text-embedding-3-small";
const OPENROUTER_DIMENSIONS = 1536;

/** Max texts per batch API call */
const MAX_BATCH_SIZE = 20;

// ---- OpenAI-compatible Response Types ----

interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

// ---- Provider Factories ----

/**
 * Create a ZhiPu embedding provider.
 * Uses ZhiPu's OpenAI-compatible embeddings API.
 */
export function createZhiPuEmbeddingProvider(
  apiKey: string,
  model?: string
): EmbeddingProvider {
  const modelName = model ?? ZHIPU_DEFAULT_MODEL;

  return {
    name: "zhipu",
    model: modelName,
    dimensions: ZHIPU_DIMENSIONS,

    async embed(text: string): Promise<number[]> {
      const result = await callEmbeddingAPI(
        ZHIPU_EMBEDDING_URL,
        apiKey,
        modelName,
        [text]
      );
      return result[0]!;
    },

    async embedBatch(texts: string[]): Promise<number[][]> {
      return batchEmbed(ZHIPU_EMBEDDING_URL, apiKey, modelName, texts);
    },
  };
}

/**
 * Create an OpenRouter embedding provider.
 * Uses OpenRouter's OpenAI-compatible embeddings API.
 */
export function createOpenRouterEmbeddingProvider(
  apiKey: string,
  model?: string
): EmbeddingProvider {
  const modelName = model ?? OPENROUTER_DEFAULT_MODEL;

  return {
    name: "openrouter",
    model: modelName,
    dimensions: OPENROUTER_DIMENSIONS,

    async embed(text: string): Promise<number[]> {
      const result = await callEmbeddingAPI(
        OPENROUTER_EMBEDDING_URL,
        apiKey,
        modelName,
        [text]
      );
      return result[0]!;
    },

    async embedBatch(texts: string[]): Promise<number[][]> {
      return batchEmbed(OPENROUTER_EMBEDDING_URL, apiKey, modelName, texts);
    },
  };
}

// ---- Provider Resolution ----

/**
 * Resolve the best available embedding provider based on config and API keys.
 * Returns null if no provider is available (degrades to FTS5-only search).
 *
 * Resolution order:
 * 1. Check primary provider (default: zhipu) — requires ZHIPU_API_KEY env
 * 2. If unavailable, check fallback (default: openrouter) — requires OPENROUTER_API_KEY env
 * 3. If neither available, return null (Tier 2 mode)
 */
export function resolveEmbeddingProvider(
  config?: Partial<EmbeddingConfig>
): EmbeddingProvider | null {
  const primary = config?.provider ?? "zhipu";
  const fallback = config?.fallback ?? "openrouter";
  const model = config?.model;

  // Try primary
  if (primary !== "none") {
    const provider = tryCreateProvider(primary, model);
    if (provider) return provider;
  }

  // Try fallback
  if (fallback !== "none") {
    const provider = tryCreateProvider(fallback);
    if (provider) return provider;
  }

  return null;
}

/**
 * Try to create a provider if its API key is available
 */
function tryCreateProvider(
  name: string,
  model?: string
): EmbeddingProvider | null {
  switch (name) {
    case "zhipu": {
      const key = process.env.ZHIPU_API_KEY;
      if (key && key.length > 0) {
        return createZhiPuEmbeddingProvider(key, model);
      }
      return null;
    }
    case "openrouter": {
      const key = process.env.OPENROUTER_API_KEY;
      if (key && key.length > 0) {
        return createOpenRouterEmbeddingProvider(key, model);
      }
      return null;
    }
    default:
      return null;
  }
}

// ---- API Helpers ----

/**
 * Call an OpenAI-compatible embeddings API.
 * Both ZhiPu and OpenRouter use the same request/response format.
 */
async function callEmbeddingAPI(
  url: string,
  apiKey: string,
  model: string,
  input: string[]
): Promise<number[][]> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown");
    throw new Error(
      `Embedding API error ${response.status}: ${errorText.slice(0, 200)}`
    );
  }

  const data = (await response.json()) as EmbeddingResponse;

  if (!data.data || data.data.length === 0) {
    throw new Error("Embedding API returned empty data");
  }

  // Sort by index to maintain input order
  const sorted = [...data.data].sort((a, b) => a.index - b.index);
  return sorted.map((d) => d.embedding);
}

/**
 * Batch embed texts, splitting into chunks of MAX_BATCH_SIZE.
 * Handles large input arrays by making multiple API calls.
 */
async function batchEmbed(
  url: string,
  apiKey: string,
  model: string,
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);
    const embeddings = await callEmbeddingAPI(url, apiKey, model, batch);
    results.push(...embeddings);
  }

  return results;
}

// ---- Vector Math Helpers ----

/**
 * Compute cosine similarity between two vectors.
 * Returns value in [-1, 1], where 1 = identical direction.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dotProduct += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}
