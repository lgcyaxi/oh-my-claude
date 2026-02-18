/**
 * auth command — Manage OAuth credentials for external providers
 *
 * Subcommands: login, logout, list, add-account
 */

import type { Command } from "commander";
import { createFormatters } from "../utils/colors";

export function registerAuthCommand(program: Command) {
  const authCmd = program
    .command("auth")
    .description("Manage OAuth credentials")
    .action(async () => {
      const { c, dimText, ok } = createFormatters();

      try {
        const { listCredentials, getCredential } = await import("../../auth/store");
        const { hasMiniMaxCredential } = await import("../../auth/minimax");
        const { hasKimiCredential } = await import("../../auth/kimi");
        const entries = listCredentials();
        const hasMiniMax = hasMiniMaxCredential();
        const hasKimi = hasKimiCredential();

        console.log(`\n${c.bold}OAuth Authentication${c.reset}\n`);

        if (entries.length > 0 || hasMiniMax || hasKimi) {
          // Display current credentials
          console.log(`${c.bold}Authenticated Providers${c.reset}\n`);

          for (const entry of entries) {
            const cred = getCredential(entry.provider);
            if (!cred) continue;

            switch (cred.type) {
              case "oauth-openai": {
                console.log(ok(`${c.cyan}openai${c.reset} — ${cred.accountId ?? "authenticated"}`));
                break;
              }
              default:
                console.log(ok(`${c.cyan}${entry.provider}${c.reset}`));
            }
          }

          if (hasMiniMax) {
            console.log(ok(`${c.cyan}minimax${c.reset} — quota display`));
          }

          if (hasKimi) {
            console.log(ok(`${c.cyan}kimi${c.reset} — token-based access`));
          }

          console.log();
        } else {
          console.log(dimText(`  No providers authenticated.\n`));
        }

        console.log(`${c.bold}Usage${c.reset}\n`);
        console.log(`  oh-my-claude auth login <provider>       ${dimText("# Authenticate with a provider")}`);
        console.log(`  oh-my-claude auth logout <provider>      ${dimText("# Remove credentials for a provider")}`);
        console.log();
        console.log(`Supported providers: ${c.cyan}openai${c.reset} (OAuth), ${c.cyan}minimax${c.reset} (quota), ${c.cyan}kimi${c.reset} (quota)`);
      } catch (error) {
        const { fail } = createFormatters();
        const msg = error instanceof Error ? error.message : String(error);
        console.log(fail(`Failed to check credentials: ${msg}`));
      }
    });

  // --- login ---
  authCmd
    .command("login <provider>")
    .description("Authenticate with an OAuth provider")
    .option("--headless", "Use device code flow instead of browser (OpenAI only)")
    .action(async (provider: string, options: { headless?: boolean }) => {
      const { ok, fail, c, dimText } = createFormatters();

       const normalizedProvider = normalizeProvider(provider);
       if (!normalizedProvider) {
         console.log(fail(`Unknown provider: "${provider}"`));
          console.log(dimText("Supported providers: openai (OAuth), minimax (quota), kimi (quota)"));
         process.exit(1);
       }

      console.log(`\n${c.bold}Authenticating with ${normalizedProvider}...${c.reset}\n`);

      try {
        switch (normalizedProvider) {
          case "openai": {
            if (options.headless) {
              const { loginCodexHeadless } = await import("../../auth/codex");
              const cred = await loginCodexHeadless();
              console.log(ok(`OpenAI authenticated (headless): ${c.cyan}${cred.accountId ?? "connected"}${c.reset}`));
            } else {
              const { loginCodexBrowser } = await import("../../auth/codex");
              const cred = await loginCodexBrowser();
              console.log(ok(`OpenAI authenticated: ${c.cyan}${cred.accountId ?? "connected"}${c.reset}`));
            }
            console.log(dimText(`  Models: gpt-5.2, gpt-5.3-codex, o3-mini`));
            break;
          }

          case "minimax": {
            const { loginMiniMax } = await import("../../auth/minimax");
            const result = await loginMiniMax();
            if (result.success && result.credential) {
              console.log(ok(`MiniMax authenticated`));
              if (result.credential.groupId) {
                console.log(dimText(`  Group ID: ${result.credential.groupId}`));
              }
              console.log(dimText(`  Usage quota will be shown in statusline`));
            } else {
              console.log(fail(`MiniMax authentication failed: ${result.error}`));
              process.exit(1);
            }
            break;
          }

          case "kimi": {
            const { loginKimi } = await import("../../auth/kimi");
            const result = await loginKimi();
            if (result.success && result.credential) {
              console.log(ok(`Kimi authenticated`));
              console.log(dimText(`  Token-based access for Kimi API`));
            } else {
              console.log(fail(`Kimi authentication failed: ${result.error}`));
              process.exit(1);
            }
            break;
          }
        }

        console.log(dimText(`\nYou can now use this provider in oh-my-claude.`));
        if (normalizedProvider === "openai") {
          console.log(dimText(`Try: /omc-switch gpt`));
        } else if (normalizedProvider === "minimax") {
          console.log(dimText(`Quota usage will be displayed in the statusline.`));
        } else if (normalizedProvider === "kimi") {
          console.log(dimText(`Try: /omc-switch km`));
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.log(fail(`Authentication failed: ${msg}`));
        process.exit(1);
      }
    });

  // --- logout ---
  authCmd
    .command("logout <provider>")
    .description("Remove credentials for a provider")
    .action(async (provider: string) => {
      const { ok, fail, dimText } = createFormatters();

      const normalizedProvider = normalizeProvider(provider);
      if (!normalizedProvider) {
        console.log(fail(`Unknown provider: "${provider}"`));
        process.exit(1);
      }

      try {
        switch (normalizedProvider) {
          case "kimi": {
            const { hasKimiCredential, removeKimiCredential } = await import("../../auth/kimi");
            if (!hasKimiCredential()) {
              console.log(dimText(`No credentials found for kimi.`));
              return;
            }
            removeKimiCredential();
            console.log(ok("Kimi credentials removed"));
            break;
          }
          default: {
            const { removeCredential, hasCredential } = await import("../../auth/store");
            if (!hasCredential(normalizedProvider)) {
              console.log(dimText(`No credentials found for ${normalizedProvider}.`));
              return;
            }
            removeCredential(normalizedProvider);
            console.log(ok(`Removed credentials for ${normalizedProvider}.`));
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.log(fail(`Logout failed: ${msg}`));
        process.exit(1);
      }
    });

}

function normalizeProvider(input: string): "openai" | "minimax" | "kimi" | null {
  const lower = input.toLowerCase();
  switch (lower) {
    case "openai":
    case "codex":
    case "chatgpt":
      return "openai";
    case "minimax":
    case "mm":
      return "minimax";
    case "kimi":
    case "km":
      return "kimi";
    default:
      return null;
  }
}
