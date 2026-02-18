/**
 * Embedding Provider
 *
 * Abstraction for vector embeddings used in semantic memory search.
 * Explicit provider selection — configure which provider to use in oh-my-claude config:
 *
 *   "custom"     — Any OpenAI-compatible endpoint (Ollama, vLLM, LM Studio, etc.)
 *                   Activated via EMBEDDING_API_BASE env var
 *   "zhipu"      — ZhiPu embedding-3 (requires ZHIPU_API_KEY)
 *   "none"        — Disabled (FTS5-only search, Tier 2)
 *
 * When no provider is available or initialization fails, the system degrades
 * to FTS5-only search (Tier 2) or legacy in-memory search (Tier 3).
 *
 * All providers use the OpenAI-compatible embeddings API format:
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
  /** Embedding provider to use (explicit selection, no cascade) */
  provider: "custom" | "zhipu" | "none";
  /** Model name (used by zhipu; custom uses EMBEDDING_MODEL env) */
  model: string;
  /** Embedding dimensions (optional, auto-detected for custom provider) */
  dimensions?: number;
}

// ---- Constants ----

const ZHIPU_EMBEDDING_URL = "https://open.bigmodel.cn/api/paas/v4/embeddings";
const ZHIPU_DEFAULT_MODEL = "embedding-3";
const ZHIPU_DIMENSIONS = 1024;

/** Environment variables for custom embedding provider */
const CUSTOM_API_BASE_ENV = "EMBEDDING_API_BASE";
const CUSTOM_MODEL_ENV = "EMBEDDING_MODEL";
const CUSTOM_API_KEY_ENV = "EMBEDDING_API_KEY";
const CUSTOM_DIMENSIONS_ENV = "EMBEDDING_DIMENSIONS";

const CUSTOM_DEFAULT_MODEL = "text-embedding-3-small";

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
 * Create a custom OpenAI-compatible embedding provider.
 * Works with Ollama, vLLM, LM Studio, or any OpenAI-compatible endpoint.
 *
 * Dimension auto-detection: makes a single API call with a short probe text
 * to detect the embedding dimensions, unless explicitly set via env or config.
 */
export async function createCustomEmbeddingProvider(
  baseUrl: string,
  options?: {
    model?: string;
    apiKey?: string;
    dimensions?: number;
  }
): Promise<EmbeddingProvider> {
  const modelName = options?.model ?? CUSTOM_DEFAULT_MODEL;
  const apiKey = options?.apiKey ?? "";
  // Normalize URL: strip trailing slash, ensure no double /embeddings
  const url = baseUrl.replace(/\/+$/, "").replace(/\/embeddings$/, "") + "/embeddings";

  let dims = options?.dimensions ?? 0;

  // Auto-detect dimensions if not provided
  if (dims === 0) {
    try {
      const probeResult = await callEmbeddingAPI(url, apiKey, modelName, [
        "dimension probe",
      ]);
      dims = probeResult[0]!.length;
    } catch (e) {
      throw new Error(
        `Custom embedding provider: dimension auto-detection failed (${e instanceof Error ? e.message : String(e)}). Set EMBEDDING_DIMENSIONS to skip.`
      );
    }
  }

  return {
    name: "custom",
    model: modelName,
    dimensions: dims,

    async embed(text: string): Promise<number[]> {
      const result = await callEmbeddingAPI(url, apiKey, modelName, [text]);
      return result[0]!;
    },

    async embedBatch(texts: string[]): Promise<number[][]> {
      return batchEmbed(url, apiKey, modelName, texts);
    },
  };
}

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

// ---- Provider Resolution ----

/**
 * Resolve the embedding provider based on explicit config selection.
 * No cascade — uses exactly the provider specified in config.
 * Returns null if provider is "none", misconfigured, or initialization fails.
 *
 * Provider types:
 *   "custom"     → EMBEDDING_API_BASE + EMBEDDING_MODEL env vars
 *   "zhipu"      → ZHIPU_API_KEY env var
 *   "none"       → disabled (returns null)
 */
export async function resolveEmbeddingProvider(
  config?: Partial<EmbeddingConfig>
): Promise<EmbeddingProvider | null> {
  const selected = config?.provider ?? "custom";

  if (selected === "none") {
    console.error("[oh-my-claude] Embedding provider: none (disabled)");
    return null;
  }

  const model = config?.model;
  const dimensions = config?.dimensions;

  const provider = await tryCreateProvider(selected, model, dimensions);

  if (provider) {
    console.error(
      `[oh-my-claude] Embedding provider: ${provider.name}/${provider.model} (${provider.dimensions}d)`
    );
  } else {
    console.error(
      `[oh-my-claude] Embedding provider "${selected}" not available — falling back to FTS5-only (Tier 2)`
    );
  }

  return provider;
}

/**
 * Try to create a provider if its credentials are available.
 */
async function tryCreateProvider(
  name: string,
  model?: string,
  dimensions?: number
): Promise<EmbeddingProvider | null> {
  switch (name) {
    case "custom": {
      const baseUrl = process.env[CUSTOM_API_BASE_ENV];
      if (!baseUrl || baseUrl.length === 0) {
        console.error(
          `[oh-my-claude] Custom embedding provider selected but ${CUSTOM_API_BASE_ENV} not set`
        );
        return null;
      }
      try {
        return await createCustomEmbeddingProvider(baseUrl, {
          model: model ?? process.env[CUSTOM_MODEL_ENV] ?? undefined,
          apiKey: process.env[CUSTOM_API_KEY_ENV] ?? undefined,
          dimensions:
            dimensions ??
            (process.env[CUSTOM_DIMENSIONS_ENV]
              ? parseInt(process.env[CUSTOM_DIMENSIONS_ENV], 10)
              : undefined),
        });
      } catch (e) {
        console.error(
          `[oh-my-claude] Custom embedding provider failed: ${e instanceof Error ? e.message : String(e)}`
        );
        return null;
      }
    }
    case "zhipu": {
      const key = process.env.ZHIPU_API_KEY;
      if (!key || key.length === 0) {
        console.error(
          "[oh-my-claude] ZhiPu embedding selected but ZHIPU_API_KEY not set"
        );
        return null;
      }
      return createZhiPuEmbeddingProvider(key, model);
    }
    default:
      console.error(`[oh-my-claude] Unknown embedding provider: "${name}"`);
      return null;
  }
}

// ---- API Helpers ----

/**
 * Call an OpenAI-compatible embeddings API.
 * All providers (custom, ZhiPu) use the same request/response format.
 */
async function callEmbeddingAPI(
  url: string,
  apiKey: string,
  model: string,
  input: string[]
): Promise<number[][]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Only add Authorization header if apiKey is non-empty
  if (apiKey && apiKey.length > 0) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
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
