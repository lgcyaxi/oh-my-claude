/**
 * Doctor zone: Providers, Bridge Workers & OAuth
 *
 * Checks provider API key status, bridge worker availability,
 * and OAuth credential state.
 */

import type { DoctorContext } from "./types";
import { evaluateBridgeWorkerStatus } from "./types";
import { getProvidersStatus } from "../../../../shared/providers/router";
import { loadConfig } from "../../../../shared/config";

export async function checkProvidersZone(ctx: DoctorContext) {
  const { ok, fail, header, dimText, c } = ctx.formatters;

  // Providers
  console.log(`\n${header("Providers:")}`);
  try {
    const providers = getProvidersStatus();
    for (const [name, info] of Object.entries(providers)) {
      const isOAuth = info.type === "openai-oauth";
      const note = info.type === "claude-subscription"
        ? dimText("(uses Claude subscription)")
        : isOAuth
          ? dimText(`(OAuth — run 'oh-my-claude auth login ${name}')`)
          : "";
      console.log(`  ${info.configured ? ok(name) : fail(name)} ${note}`);
      if (ctx.detail && info.type !== "claude-subscription" && !isOAuth) {
        const envVar = info.apiKeyEnv ?? `${name.toUpperCase()}_API_KEY`;
        const isSet = process.env[envVar];
        console.log(`    Env: ${c.cyan}${envVar}${c.reset} ${isSet ? `${c.green}(set)${c.reset}` : `${c.red}(not set)${c.reset}`}`);
      }
    }
  } catch (error) {
    console.log(`  ${fail("Failed to check providers:")} ${error}`);
  }

  // Bridge Workers
  console.log(`\n${header("Bridge Workers:")}`);
  try {
    const config = loadConfig();
    const bridgeRows = [
      {
        key: "cc:glm",
        role: "code",
        status: evaluateBridgeWorkerStatus(config, {
          providers: ["zhipu-global", "zhipu"],
          configuredMessage: "ZhiPu GLM configured",
          label: "ZhiPu",
        }),
      },
      {
        key: "codex",
        role: "audit",
        status: { ok: true, message: "proc-based, always available" },
      },
      {
        key: "cc:mm",
        role: "docs",
        status: evaluateBridgeWorkerStatus(config, {
          providers: ["minimax", "minimax-cn"],
          configuredMessage: "MiniMax configured",
          label: "MiniMax",
        }),
      },
      {
        key: "cc:kimi",
        role: "design",
        status: evaluateBridgeWorkerStatus(config, {
          providers: ["kimi"],
          configuredMessage: "Kimi configured",
          label: "Kimi",
        }),
      },
    ] as const;

    const workerWidth = Math.max(...bridgeRows.map((row) => `${row.key} (${row.role})`.length));
    for (const row of bridgeRows) {
      const worker = `${row.key} (${row.role})`.padEnd(workerWidth, " ");
      const marker = row.status.ok ? ok(worker) : fail(worker);
      console.log(`  ${marker}  — ${row.status.message}`);
    }
  } catch (error) {
    console.log(`  ${fail("Failed to resolve bridge workers:")} ${error}`);
  }

  // OAuth Credentials
  console.log(`\n${header("OAuth Credentials:")}`);
  try {
    const { listCredentials } = require("../../../../shared/auth/store");
    const { hasMiniMaxCredential } = require("../../../../shared/auth/minimax");
    const { hasKimiCredential } = require("../../../../shared/auth/kimi");
    const creds = listCredentials() as Array<{ provider: string; type: string; detail: string }>;
    const hasMiniMax = hasMiniMaxCredential();
    const hasKimi = hasKimiCredential();

    if (creds.length === 0 && !hasMiniMax && !hasKimi) {
      console.log(`  ${dimText("No OAuth providers authenticated.")}`);
      console.log(`  ${dimText("Run: oh-my-claude auth login <openai|kimi|minimax>")}`);
    } else {
      for (const entry of creds) {
        console.log(`  ${ok(`${c.cyan}${entry.provider}${c.reset} — ${entry.detail}`)}`);
      }
      if (hasMiniMax) {
        console.log(`  ${ok(`${c.cyan}minimax${c.reset} — quota display`)}`);
      }
      if (hasKimi) {
        console.log(`  ${ok(`${c.cyan}kimi${c.reset} — quota display`)}`);
      }
    }
  } catch {
    console.log(`  ${dimText("Auth module not available (install required)")}`);
  }
}
