/**
 * SSE streaming passthrough utilities
 *
 * Handles both text/event-stream (SSE) and application/json responses.
 * Uses ReadableStream for true streaming without buffering.
 *
 * When switching to external providers, SSE events are transformed to:
 * - Replace provider model names with the original Claude model name
 * - Ensure response format matches Claude Code's expectations
 */

/** Timeout for upstream fetch requests (5 min — generous for slow providers) */
const UPSTREAM_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Pipe an upstream response body to the client response as a ReadableStream.
 * Preserves SSE format and handles backpressure.
 *
 * @param originalModel - The original model name from Claude Code (e.g., "claude-opus-4-6")
 *                       If provided, transforms SSE events to replace the provider's model name.
 * @param providerModel - The provider's model name (e.g., "kimi-k2.5") for logging
 */
export function createStreamingResponse(
  upstreamResponse: Response,
  overrideHeaders?: Record<string, string>,
  originalModel?: string,
  providerModel?: string
): Response {
  const contentType = upstreamResponse.headers.get("content-type") ?? "";
  const isSSE = contentType.includes("text/event-stream");

  // Build response headers — forward relevant upstream headers
  const headers = new Headers();
  const forwardHeaders = [
    "content-type",
    "x-request-id",
    "anthropic-ratelimit-requests-limit",
    "anthropic-ratelimit-requests-remaining",
    "anthropic-ratelimit-requests-reset",
    "anthropic-ratelimit-tokens-limit",
    "anthropic-ratelimit-tokens-remaining",
    "anthropic-ratelimit-tokens-reset",
  ];

  for (const name of forwardHeaders) {
    const value = upstreamResponse.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  // Apply overrides
  if (overrideHeaders) {
    for (const [key, value] of Object.entries(overrideHeaders)) {
      headers.set(key, value);
    }
  }

  // For SSE, ensure proper headers
  if (isSSE) {
    headers.set("content-type", "text/event-stream");
    headers.set("cache-control", "no-cache");
    headers.set("connection", "keep-alive");
  }

  // If no body, return empty response with same status
  if (!upstreamResponse.body) {
    return new Response(null, {
      status: upstreamResponse.status,
      headers,
    });
  }

  // If transforming model names, use SSE transformer
  if (isSSE && originalModel) {
    console.error(`[stream] Transforming SSE model: "${providerModel ?? "?"}" → "${originalModel}"`);
    const transformedStream = upstreamResponse.body.pipeThrough(
      new SSEModelTransformStream(originalModel)
    );
    return new Response(transformedStream, {
      status: upstreamResponse.status,
      headers,
    });
  }

  // Pipe the upstream body directly — true streaming passthrough
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers,
  });
}

/**
 * Forward a request to an upstream server and return the response
 *
 * @param passthroughAuth - If true, forwards all original auth headers as-is (OAuth mode)
 * @param rawBodyText - Pre-read body text to avoid double-consuming the request stream
 */
export async function forwardToUpstream(
  originalRequest: Request,
  targetUrl: string,
  apiKey: string,
  bodyOverride?: Record<string, unknown>,
  passthroughAuth?: boolean,
  rawBodyText?: string
): Promise<Response> {
  // Build forwarded headers
  const headers = new Headers();

  // Forward relevant headers from original request
  const forwardFromClient = [
    "content-type",
    "anthropic-version",
    "anthropic-beta",
    "accept",
  ];

  for (const name of forwardFromClient) {
    const value = originalRequest.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  if (passthroughAuth) {
    // OAuth mode: forward all auth-related headers from Claude Code as-is
    const authHeaders = ["authorization", "x-api-key"];
    for (const name of authHeaders) {
      const value = originalRequest.headers.get(name);
      if (value) {
        headers.set(name, value);
      }
    }
  } else {
    // API key mode: set the target API key explicitly
    headers.set("x-api-key", apiKey);
  }

  // Override Bun's default User-Agent so providers see "oh-my-claude" in their consoles
  headers.set("user-agent", "oh-my-claude/2.0");

  // Determine body — priority: bodyOverride > rawBodyText > originalRequest.body
  let body: string | null = null;
  if (bodyOverride) {
    body = JSON.stringify(bodyOverride);
    headers.set("content-type", "application/json");
  } else if (rawBodyText !== undefined) {
    // Use pre-read body text (avoids double-consumption of request stream)
    body = rawBodyText;
  } else if (originalRequest.body) {
    body = await originalRequest.text();
  }

  // Forward to upstream with timeout to prevent hanging on slow providers
  const upstreamResponse = await fetch(targetUrl, {
    method: originalRequest.method,
    headers,
    body,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });

  return upstreamResponse;
}

/**
 * TransformStream that parses SSE events and replaces the provider's model name
 * with the original Claude model name from the request.
 *
 * This is needed when switching to external providers (DeepSeek, ZhiPu, etc.)
 * because they return their own model names (e.g., "deepseek-chat") in the response,
 * but Claude Code expects to see the original model name (e.g., "claude-opus-4-6").
 *
 * The transformation is done as a streaming transform to avoid buffering the entire response.
 */
class SSEModelTransformStream extends TransformStream<Uint8Array, Uint8Array> {
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();
  private buffer = "";
  private readonly originalModel: string;

  constructor(originalModel: string) {
    super({
      transform: (chunk, controller) => this._transform(chunk, controller),
      flush: (controller) => this._flush(controller),
    });
    this.originalModel = originalModel;
  }

  private _transform(chunk: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>): void {
    // Decode chunk and add to buffer
    this.buffer += this.decoder.decode(chunk, { stream: true });

    // Process complete SSE events
    const lines = this.buffer.split("\n");
    // Keep the last incomplete line in the buffer
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      let outputLine = line;

      // Transform data lines that contain JSON
      if (line.startsWith("data: ")) {
        const jsonStr = line.slice(6); // Remove "data: " prefix
        try {
          const data = JSON.parse(jsonStr) as Record<string, unknown>;

          // Replace model name if present
          if (typeof data.model === "string") {
            data.model = this.originalModel;
            outputLine = `data: ${JSON.stringify(data)}`;
          }
        } catch {
          // Invalid JSON, pass through as-is
        }
      }

      // Enqueue transformed line
      controller.enqueue(this.encoder.encode(outputLine + "\n"));
    }
  }

  private _flush(controller: TransformStreamDefaultController<Uint8Array>): void {
    // Flush any remaining buffer content
    if (this.buffer.length > 0) {
      controller.enqueue(this.encoder.encode(this.buffer));
    }
  }
}
