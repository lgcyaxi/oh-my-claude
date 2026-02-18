/**
 * Kimi Authentication
 *
 * Uses Playwright to login to Kimi and extract Bearer token + cookie
 * for API access.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface KimiCredential {
  type: "kimi";
  token: string;      // Bearer token from Authorization header
  cookie: string;     // kimi-auth cookie value
  loggedInAt: number;
}

const CREDS_PATH = join(homedir(), ".claude", "oh-my-claude", "kimi-creds.json");

/** Get the path to the kimi login script */
function getLoginScriptPath(): string {
  return join(homedir(), ".claude", "oh-my-claude", "scripts", "kimi-login.ts");
}

export interface LoginResult {
  success: boolean;
  credential?: KimiCredential;
  error?: string;
}

/**
 * Login to Kimi using Playwright.
 * Opens browser, user logs in (QR code or password), extracts token and cookie.
 */
export async function loginKimi(): Promise<LoginResult> {
  return new Promise((resolve) => {
    console.log("\n=== Kimi Login ===\n");
    console.log("This will open a browser window.");
    console.log("Please login with QR code or password.\n");

    // Ensure playwright is installed (heavy dep, install on-demand)
    const scriptPath = getLoginScriptPath();
    const installDir = join(homedir(), ".claude", "oh-my-claude");
    const playwrightDir = join(installDir, "node_modules", "playwright");

    try {
      // Install playwright + tsx if not present (--ignore-scripts to avoid triggering prepare/build)
      const needsPlaywright = !existsSync(playwrightDir);
      const needsTsx = !existsSync(join(installDir, "node_modules", "tsx"));
      if (needsPlaywright || needsTsx) {
        const pkgs = [];
        if (needsPlaywright) pkgs.push("playwright");
        if (needsTsx) pkgs.push("tsx");
        console.log(`Installing ${pkgs.join(" + ")} (first-time setup, this may take a moment)...\n`);
        const installResult = spawnSync("bun", ["add", "--ignore-scripts", ...pkgs], {
          cwd: installDir,
          stdio: "inherit",
          shell: true,
        });
        if (installResult.status !== 0) {
          resolve({
            success: false,
            error: `Failed to install dependencies. Run manually: cd ~/.claude/oh-my-claude && bun add --ignore-scripts ${pkgs.join(" ")}`,
          });
          return;
        }
      }
    } catch {
      resolve({
        success: false,
        error: "Failed to install playwright dependency",
      });
      return;
    }

    // Run with Node.js (tsx) — Playwright doesn't work properly under Bun on Windows
    // (browser subprocess spawning hangs)
    // Use npx to invoke tsx, which works in both cmd.exe and Git Bash
    const result = spawnSync("npx", ["--yes", "tsx", scriptPath], {
      cwd: installDir,
      stdio: "inherit",
      shell: true,
      env: { ...process.env, NODE_PATH: join(installDir, "node_modules") },
    });

    if (result.status !== 0) {
      resolve({
        success: false,
        error: `Login script failed with code ${result.status}`,
      });
      return;
    }

    // Read the saved credentials
    if (!existsSync(CREDS_PATH)) {
      resolve({
        success: false,
        error: "Credentials file not found after login",
      });
      return;
    }

    try {
      const creds = JSON.parse(readFileSync(CREDS_PATH, "utf-8")) as KimiCredential;
      resolve({
        success: true,
        credential: creds,
      });
    } catch {
      resolve({
        success: false,
        error: "Failed to parse credentials file",
      });
    }
  });
}

/**
 * Check if Kimi credentials exist
 */
export function hasKimiCredential(): boolean {
  return existsSync(CREDS_PATH);
}

/**
 * Get Kimi credential
 */
export function getKimiCredential(): KimiCredential | null {
  if (!existsSync(CREDS_PATH)) {
    return null;
  }
  try {
    const creds = JSON.parse(readFileSync(CREDS_PATH, "utf-8"));
    if (creds.token && creds.cookie) {
      return creds as KimiCredential;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Remove Kimi credentials
 */
export function removeKimiCredential(): void {
  if (existsSync(CREDS_PATH)) {
    const { unlinkSync } = require("node:fs");
    unlinkSync(CREDS_PATH);
  }
}
