/**
 * auth command — Authenticate with OAuth/quota providers
 *
 * Usage:
 *   oh-my-claude auth              # Show authentication status
 *   oh-my-claude auth <provider>   # Authenticate with provider
 */

import type { Command } from "commander";
import { createFormatters } from "../../utils/colors";
import { listCredentials, getCredential } from "../../../shared/auth/store";
import { hasMiniMaxCredential } from "../../../shared/auth/minimax";
import { hasKimiCredential, loginKimi } from "../../../shared/auth/kimi";
import { hasAliyunCredential, loginAliyun } from "../../../shared/auth/aliyun";
import { loginMiniMax } from "../../../shared/auth/minimax";

export function registerAuthCommand(program: Command) {
  program
    .command("auth [provider]")
    .description("Authenticate with a provider (or show status)")
    .action(async (provider: string | undefined) => {
      const { c, dimText, ok, fail } = createFormatters();

      // No provider arg → show status
      if (!provider) {
        try {
          const entries = listCredentials();
          const hasMiniMax = hasMiniMaxCredential();
          const hasKimi = hasKimiCredential();
          const hasAliyun = hasAliyunCredential();

          console.log(`\n${c.bold}OAuth Authentication${c.reset}\n`);

          if (entries.length > 0 || hasMiniMax || hasKimi || hasAliyun) {
            console.log(`${c.bold}Authenticated Providers${c.reset}\n`);

            for (const entry of entries) {
              const cred = getCredential(entry.provider);
              if (!cred) continue;
              if (cred.type === "oauth-openai") {
                console.log(ok(`${c.cyan}openai${c.reset} — ${cred.accountId ?? "authenticated"}`));
              } else {
                console.log(ok(`${c.cyan}${entry.provider}${c.reset}`));
              }
            }

            if (hasMiniMax) console.log(ok(`${c.cyan}minimax-cn${c.reset} — quota display`));
            if (hasKimi)    console.log(ok(`${c.cyan}kimi${c.reset} — token-based access`));
            if (hasAliyun)  console.log(ok(`${c.cyan}aliyun${c.reset} — quota display`));
            console.log();
          } else {
            console.log(dimText(`  No providers authenticated.\n`));
          }

          console.log(`Run ${c.cyan}omc auth <provider>${c.reset} to authenticate.`);
          console.log(`Supported: ${c.cyan}minimax-cn${c.reset} (quota), ${c.cyan}kimi${c.reset} (quota), ${c.cyan}aliyun${c.reset} (quota)`);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.log(fail(`Failed to check credentials: ${msg}`));
        }
        return;
      }

      // Provider arg → login
      const normalizedProvider = normalizeProvider(provider);
      if (!normalizedProvider) {
        console.log(fail(`Unknown provider: "${provider}"`));
        console.log(dimText("Supported: minimax-cn (or mm), kimi (or km), aliyun (or ay)"));
        process.exit(1);
      }

      console.log(`\n${c.bold}Authenticating with ${normalizedProvider}...${c.reset}\n`);

      try {
        switch (normalizedProvider) {
          case "minimax-cn": {
            const result = await loginMiniMax();
            if (result.success && result.credential) {
              console.log(ok(`MiniMax authenticated`));
              if (result.credential.groupId) console.log(dimText(`  Group ID: ${result.credential.groupId}`));
              console.log(dimText(`  Usage quota will be shown in statusline`));
            } else {
              console.log(fail(`MiniMax authentication failed: ${result.error}`));
              process.exit(1);
            }
            break;
          }
          case "kimi": {
            const result = await loginKimi();
            if (result.success && result.credential) {
              console.log(ok(`Kimi authenticated`));
              console.log(dimText(`  Token-based access for Kimi API`));
              console.log(dimText(`  Try: /omc-switch km`));
            } else {
              console.log(fail(`Kimi authentication failed: ${result.error}`));
              process.exit(1);
            }
            break;
          }
          case "aliyun": {
            const result = await loginAliyun();
            if (result.success && result.credential) {
              console.log(ok(`Aliyun Bailian authenticated`));
              console.log(dimText(`  Coding Plan quota will be shown in statusline`));
            } else {
              console.log(fail(`Aliyun authentication failed: ${result.error}`));
              process.exit(1);
            }
            break;
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.log(fail(`Authentication failed: ${msg}`));
        process.exit(1);
      }
    });
}

function normalizeProvider(input: string): "minimax-cn" | "kimi" | "aliyun" | null {
  const lower = input.toLowerCase();
  switch (lower) {
    case "minimax":
    case "minimax-cn":
    case "mm":
    case "mm-cn":
      return "minimax-cn";
    case "kimi":
    case "km":
      return "kimi";
    case "aliyun":
    case "ay":
    case "bailian":
      return "aliyun";
    default:
      return null;
  }
}
