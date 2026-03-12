/**
 * Local OAuth callback server for PKCE flows
 *
 * Starts a temporary HTTP server to receive OAuth authorization codes.
 * Uses native crypto.subtle for PKCE (zero external deps).
 * Cross-platform: works on macOS, Linux, Windows, WSL, Docker.
 *
 * Uses Node.js http.createServer for CLI compatibility (CLI runs via Node.js,
 * not Bun, so Bun.serve() is not available).
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

/**
 * PKCE code verifier + challenge pair
 */
export interface PkcePair {
  verifier: string;
  challenge: string;
}

/**
 * Result from OAuth callback
 */
export interface OAuthCallbackResult {
  code: string;
  state?: string;
}

/**
 * Generate a cryptographically random string for PKCE
 */
function generateRandomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
}

/**
 * Base64url encode an ArrayBuffer
 */
function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Generate PKCE code verifier and challenge using native crypto.subtle
 */
export async function generatePKCE(): Promise<PkcePair> {
  const verifier = generateRandomString(43);
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const challenge = base64UrlEncode(hash);
  return { verifier, challenge };
}

/**
 * Generate a random state parameter for CSRF protection
 */
export function generateState(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)).buffer);
}

const HTML_SUCCESS = `<!doctype html>
<html>
  <head><title>oh-my-claude - Authorization Successful</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; justify-content: center;
      align-items: center; height: 100vh; margin: 0; background: #0d1117; color: #e6edf3; }
    .container { text-align: center; padding: 2rem; }
    h1 { color: #58a6ff; margin-bottom: 1rem; }
    p { color: #8b949e; }
  </style></head>
  <body>
    <div class="container">
      <h1>Authorization Successful</h1>
      <p>You can close this window and return to oh-my-claude.</p>
    </div>
    <script>setTimeout(() => window.close(), 2000)</script>
  </body>
</html>`;

const HTML_ERROR = (error: string) => `<!doctype html>
<html>
  <head><title>oh-my-claude - Authorization Failed</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; justify-content: center;
      align-items: center; height: 100vh; margin: 0; background: #0d1117; color: #e6edf3; }
    .container { text-align: center; padding: 2rem; }
    h1 { color: #f85149; margin-bottom: 1rem; }
    p { color: #8b949e; }
    .error { color: #ffa198; font-family: monospace; margin-top: 1rem; padding: 1rem;
      background: #21262d; border-radius: 0.5rem; }
  </style></head>
  <body>
    <div class="container">
      <h1>Authorization Failed</h1>
      <p>An error occurred during authorization.</p>
      <div class="error">${error}</div>
    </div>
  </body>
</html>`;

/**
 * Start a local OAuth callback server and wait for the authorization code.
 *
 * Uses Node.js http.createServer instead of Bun.serve() so the CLI
 * works when invoked via Node.js (bin/oh-my-claude.js).
 *
 * @param port Port to listen on (0 for ephemeral)
 * @param expectedState Expected state parameter for CSRF validation
 * @param timeoutMs Timeout before giving up (default: 5 minutes)
 * @returns Promise that resolves with the authorization code
 */
export async function startCallbackServer(
  port: number = 0,
  expectedState?: string,
  timeoutMs: number = 5 * 60 * 1000
): Promise<OAuthCallbackResult> {
  return new Promise<OAuthCallbackResult>((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);

      if (url.pathname === "/callback" || url.pathname === "/auth/callback" || url.pathname === "/oauth-callback") {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const errorDescription = url.searchParams.get("error_description");

        if (error) {
          const msg = errorDescription || error;
          clearTimeout(timeout);
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(HTML_ERROR(msg));
          setTimeout(() => {
            server.close();
            reject(new Error(msg));
          }, 100);
          return;
        }

        if (!code) {
          const msg = "Missing authorization code";
          clearTimeout(timeout);
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(HTML_ERROR(msg));
          setTimeout(() => {
            server.close();
            reject(new Error(msg));
          }, 100);
          return;
        }

        if (expectedState && state !== expectedState) {
          const msg = "Invalid state parameter — potential CSRF attack";
          clearTimeout(timeout);
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(HTML_ERROR(msg));
          setTimeout(() => {
            server.close();
            reject(new Error(msg));
          }, 100);
          return;
        }

        clearTimeout(timeout);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(HTML_SUCCESS);
        setTimeout(() => {
          server.close();
          resolve({ code, state: state ?? undefined });
        }, 100);
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    });

    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("OAuth callback timeout — authorization took too long"));
    }, timeoutMs);

    server.listen(port, () => {
      // Server is ready to accept connections
    });
  });
}

/**
 * Get the callback URL for a running server
 */
export function getCallbackUrl(port: number, path: string = "/callback"): string {
  return `http://localhost:${port}${path}`;
}
