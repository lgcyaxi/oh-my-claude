/**
 * Doctor zone: Recommendations
 *
 * Summarizes unconfigured providers and suggests next steps.
 */

import type { DoctorContext } from "./types";
import { getProvidersStatus } from "../../../../shared/providers/router";

export async function checkRecommendationsZone(ctx: DoctorContext, installStatus: { installed: boolean }) {
  const { ok, warn, header, c } = ctx.formatters;

  console.log(`\n${header("Recommendations:")}`);

  const providers = getProvidersStatus();
  const oauthTypes = new Set(["openai-oauth"]);
  const unconfiguredApiKey = Object.entries(providers)
    .filter(([_, info]) => !info.configured && info.type !== "claude-subscription" && !oauthTypes.has(info.type))
    .map(([name]) => name);
  const unconfiguredOAuth = Object.entries(providers)
    .filter(([_, info]) => !info.configured && oauthTypes.has(info.type))
    .map(([name]) => name);

  if (unconfiguredApiKey.length > 0) {
    console.log(`  ${warn(`Set API keys for: ${c.yellow}${unconfiguredApiKey.join(", ")}${c.reset}`)}`);
    if (ctx.detail) {
      for (const provider of unconfiguredApiKey) {
        console.log(`    ${c.dim}export ${provider.toUpperCase()}_API_KEY=your-key${c.reset}`);
      }
    }
  }
  if (unconfiguredOAuth.length > 0) {
    console.log(`  ${warn(`Authenticate OAuth: ${c.yellow}${unconfiguredOAuth.join(", ")}${c.reset}`)}`);
    if (ctx.detail) {
      for (const provider of unconfiguredOAuth) {
        console.log(`    ${c.dim}oh-my-claude auth login ${provider}${c.reset}`);
      }
    }
  }
  if (unconfiguredApiKey.length === 0 && unconfiguredOAuth.length === 0) {
    console.log(`  ${ok("All providers configured")}`);
  }

  if (!installStatus.installed) {
    console.log(`  ${warn("Run 'oh-my-claude install' to complete setup")}`);
  }
}
