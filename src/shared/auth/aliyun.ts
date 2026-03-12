/**
 * Aliyun Bailian Authentication
 *
 * Uses Playwright to login to Aliyun Bailian console and extract cookies
 * for Coding Plan quota API access.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface AliyunCredential {
  type: "aliyun";
  cookie: string;
  loggedInAt: number;
}

const CREDS_PATH = join(homedir(), ".claude", "oh-my-claude", "aliyun-creds.json");

/** Get the path to the aliyun login script */
function getLoginScriptPath(): string {
  return join(homedir(), ".claude", "oh-my-claude", "scripts", "aliyun-login.ts");
}

export interface LoginResult {
  success: boolean;
  credential?: AliyunCredential;
  error?: string;
}

/**
 * Login to Aliyun Bailian using Playwright.
 * Opens browser, user logs in, extracts console cookies.
 */
export async function loginAliyun(): Promise<LoginResult> {
  return new Promise((resolve) => {
    console.log("\n=== Aliyun Bailian Login ===\n");
    console.log("This will open a browser window.");
    console.log("Please login with your Aliyun account.\n");

    const scriptPath = getLoginScriptPath();
    const installDir = join(homedir(), ".claude", "oh-my-claude");
    const playwrightDir = join(installDir, "node_modules", "playwright");

    try {
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

    if (!existsSync(CREDS_PATH)) {
      resolve({
        success: false,
        error: "Credentials file not found after login",
      });
      return;
    }

    try {
      const creds = JSON.parse(readFileSync(CREDS_PATH, "utf-8")) as AliyunCredential;
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
 * Check if Aliyun credentials exist
 */
export function hasAliyunCredential(): boolean {
  return existsSync(CREDS_PATH);
}

/**
 * Get Aliyun credential
 */
export function getAliyunCredential(): AliyunCredential | null {
  if (!existsSync(CREDS_PATH)) {
    return null;
  }
  try {
    const creds = JSON.parse(readFileSync(CREDS_PATH, "utf-8"));
    if (creds.cookie) {
      return creds as AliyunCredential;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Remove Aliyun credentials
 */
export function removeAliyunCredential(): void {
  if (existsSync(CREDS_PATH)) {
    const { unlinkSync } = require("node:fs");
    unlinkSync(CREDS_PATH);
  }
}
