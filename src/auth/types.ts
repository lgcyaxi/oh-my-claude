/**
 * Auth credential types for oh-my-claude
 *
 * Discriminated union types for OAuth and API key authentication.
 * Supports: OpenAI Codex, API keys.
 */

import { z } from "zod";

// --- OpenAI Codex ---

export const OpenAICredentialSchema = z.object({
  type: z.literal("oauth-openai"),
  refreshToken: z.string(),
  accessToken: z.string().optional(),
  expiresAt: z.number().default(0),
  accountId: z.string().optional(), // extracted from JWT claims
});

// --- Discriminated union ---

export const AuthCredentialSchema = z.discriminatedUnion("type", [
  OpenAICredentialSchema,
]);

// --- Auth store (persisted to auth.json) ---

export const AuthStoreSchema = z.object({
  version: z.literal(1).default(1),
  credentials: z.record(z.string(), AuthCredentialSchema).default({}),
});

// --- Inferred types ---

export type OpenAICredential = z.infer<typeof OpenAICredentialSchema>;
export type AuthCredential = z.infer<typeof AuthCredentialSchema>;
export type AuthStore = z.infer<typeof AuthStoreSchema>;

// --- Provider auth type (for config schema integration) ---

export type OAuthProviderType = "openai-oauth";

export function isOAuthProvider(type: string): type is OAuthProviderType {
  return type === "openai-oauth";
}

export function providerToCredentialKey(providerType: OAuthProviderType): string {
  switch (providerType) {
    case "openai-oauth":
      return "openai";
  }
}
