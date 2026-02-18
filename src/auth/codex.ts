/**
 * OpenAI Codex OAuth flow
 *
 * Two authentication methods:
 * 1. Browser (PKCE) — local callback server, opens browser
 * 2. Headless (Device Code) — for SSH/remote, displays code to enter
 *
 * Gets access to GPT-5.2, GPT-5.3 Codex via ChatGPT Pro/Plus subscription.
 * Reference: anomalyco/opencode (packages/opencode/src/plugin/codex.ts)
 */

import { generatePKCE, generateState, startCallbackServer, getCallbackUrl } from "./server";
import { setCredential } from "./store";
import type { OpenAICredential } from "./types";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const ISSUER = "https://auth.openai.com";
const CALLBACK_PORT = 1455;
const POLLING_SAFETY_MARGIN_MS = 3000;

interface TokenResponse {
  id_token: string;
  access_token: string;
  refresh_token: string;
  expires_in?: number;
}

interface JwtClaims {
  chatgpt_account_id?: string;
  organizations?: Array<{ id: string }>;
  email?: string;
  "https://api.openai.com/auth"?: {
    chatgpt_account_id?: string;
  };
}

/**
 * Parse JWT claims (decode payload segment)
 */
function parseJwtClaims(token: string): JwtClaims | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  try {
    return JSON.parse(Buffer.from(parts[1]!, "base64url").toString());
  } catch {
    return undefined;
  }
}

/**
 * Extract account ID from token claims
 */
function extractAccountId(tokens: TokenResponse): string | undefined {
  for (const tokenStr of [tokens.id_token, tokens.access_token]) {
    if (!tokenStr) continue;
    const claims = parseJwtClaims(tokenStr);
    if (!claims) continue;
    const id =
      claims.chatgpt_account_id ||
      claims["https://api.openai.com/auth"]?.chatgpt_account_id ||
      claims.organizations?.[0]?.id;
    if (id) return id;
  }
  return undefined;
}

/**
 * Login via browser PKCE flow
 */
export async function loginCodexBrowser(): Promise<OpenAICredential> {
  const pkce = await generatePKCE();
  const state = generateState();
  const redirectUri = getCallbackUrl(CALLBACK_PORT, "/auth/callback");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "openid profile email offline_access",
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    state,
    originator: "oh-my-claude",
  });

  const authUrl = `${ISSUER}/oauth/authorize?${params.toString()}`;

  // Start callback server
  const callbackPromise = startCallbackServer(CALLBACK_PORT, state);

  console.log(`\nOpen this URL in your browser:\n${authUrl}\n`);

  // Try to open browser
  try {
    const { platform } = await import("node:os");
    const { exec } = await import("node:child_process");
    const os = platform();
    if (os === "darwin") exec(`open "${authUrl}"`);
    else if (os === "win32") exec(`start "" "${authUrl}"`);
    else exec(`xdg-open "${authUrl}"`);
  } catch {
    // Silent
  }

  console.log("Waiting for authorization...");
  const { code } = await callbackPromise;

  // Exchange code for tokens
  const response = await fetch(`${ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: CLIENT_ID,
      code_verifier: pkce.verifier,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  const tokens = (await response.json()) as TokenResponse;
  const accountId = extractAccountId(tokens);
  const expiresAt = Date.now() + (tokens.expires_in ?? 3600) * 1000;

  const credential: OpenAICredential = {
    type: "oauth-openai",
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    expiresAt,
    accountId,
  };

  setCredential("openai", credential);
  return credential;
}

/**
 * Login via headless device code flow (for SSH/remote environments)
 */
export async function loginCodexHeadless(): Promise<OpenAICredential> {
  // Request device code
  const deviceResponse = await fetch(`${ISSUER}/api/accounts/deviceauth/usercode`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "oh-my-claude/1.6.0",
    },
    body: JSON.stringify({ client_id: CLIENT_ID }),
  });

  if (!deviceResponse.ok) {
    throw new Error(`Failed to initiate device authorization: ${deviceResponse.status}`);
  }

  const deviceData = (await deviceResponse.json()) as {
    device_auth_id: string;
    user_code: string;
    interval: string;
  };

  const interval = Math.max(parseInt(deviceData.interval) || 5, 1) * 1000;

  console.log(`\nGo to: ${ISSUER}/codex/device`);
  console.log(`Enter code: ${deviceData.user_code}\n`);
  console.log("Waiting for authorization...");

  // Poll for completion
  while (true) {
    const response = await fetch(`${ISSUER}/api/accounts/deviceauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "oh-my-claude/1.6.0",
      },
      body: JSON.stringify({
        device_auth_id: deviceData.device_auth_id,
        user_code: deviceData.user_code,
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        authorization_code: string;
        code_verifier: string;
      };

      // Exchange for tokens
      const tokenResponse = await fetch(`${ISSUER}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: data.authorization_code,
          redirect_uri: `${ISSUER}/deviceauth/callback`,
          client_id: CLIENT_ID,
          code_verifier: data.code_verifier,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error(`Token exchange failed: ${tokenResponse.status}`);
      }

      const tokens = (await tokenResponse.json()) as TokenResponse;
      const accountId = extractAccountId(tokens);
      const expiresAt = Date.now() + (tokens.expires_in ?? 3600) * 1000;

      const credential: OpenAICredential = {
        type: "oauth-openai",
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token,
        expiresAt,
        accountId,
      };

      setCredential("openai", credential);
      return credential;
    }

    if (response.status !== 403 && response.status !== 404) {
      throw new Error(`Device authorization failed: ${response.status}`);
    }

    await new Promise((r) => setTimeout(r, interval + POLLING_SAFETY_MARGIN_MS));
  }
}

/**
 * Login to OpenAI Codex (auto-selects browser or headless)
 */
export async function loginCodex(headless: boolean = false): Promise<OpenAICredential> {
  if (headless) {
    return loginCodexHeadless();
  }
  return loginCodexBrowser();
}
