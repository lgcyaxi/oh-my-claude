/**
 * SSE streaming passthrough utilities
 *
 * Handles both text/event-stream (SSE) and application/json responses.
 * Uses ReadableStream for true streaming without buffering.
 */

/**
 * Pipe an upstream response body to the client response as a ReadableStream.
 * Preserves SSE format and handles backpressure.
 */
export function createStreamingResponse(
  upstreamResponse: Response,
  overrideHeaders?: Record<string, string>
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

  // Forward to upstream
  const upstreamResponse = await fetch(targetUrl, {
    method: originalRequest.method,
    headers,
    body,
  });

  return upstreamResponse;
}
