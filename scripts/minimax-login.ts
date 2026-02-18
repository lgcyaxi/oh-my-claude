/**
 * MiniMax Login Script
 *
 * Usage: bun run scripts/minimax-login.ts
 *
 * This script:
 * 1. Opens MiniMax login page
 * 2. Waits for QR code scan
 * 3. After login, extracts cookie and groupId
 * 4. Saves to ~/.claude/oh-my-claude/minimax-creds.json
 */

// Playwright callbacks execute in browser context where `window` exists
declare const window: any;

import { chromium } from "playwright";
import { homedir } from "os";
import { join, dirname } from "path";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { execSync } from "child_process";

const CREDS_PATH = join(homedir(), ".claude", "oh-my-claude", "minimax-creds.json");

/** Find a browser executable on Windows */
function findBrowserWindows(): string | null {
  const candidates = [
    // Chrome
    join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
    join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
    join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
    // Edge
    join(process.env.PROGRAMFILES || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  // Try registry query for Edge
  try {
    const result = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe" /ve', { encoding: "utf-8" });
    const match = result.match(/REG_SZ\s+(.+\.exe)/i);
    if (match?.[1] && existsSync(match[1].trim())) return match[1].trim();
  } catch {}
  return null;
}

async function login() {
  console.log("Starting MiniMax login...\n");
  console.log("Note: You'll need to log in once. Your credentials will be saved for future use.\n");

  console.log("Opening browser for login...\n");

  let browser;
  const isWindows = process.platform === "win32";

  if (isWindows) {
    // On Windows, find browser executable explicitly to avoid Playwright channel detection issues
    const execPath = findBrowserWindows();
    if (execPath) {
      console.log(`Using browser: ${execPath}\n`);
      browser = await chromium.launch({
        headless: false,
        executablePath: execPath,
      });
    } else {
      console.error("No browser found. Please install Chrome or Edge.");
      process.exit(1);
    }
  } else {
    // On macOS/Linux, channel detection works fine
    try {
      browser = await chromium.launch({ headless: false, channel: "chrome" });
    } catch {
      try {
        browser = await chromium.launch({ headless: false });
      } catch {
        console.error("No browser found. Install Chrome or run: npx playwright install chromium");
        process.exit(1);
      }
    }
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to login page
    console.log("Opening MiniMax login page...");
    await page.goto("https://platform.minimaxi.com/login", { waitUntil: "networkidle" });

    // Wait a bit for page to fully load
    await page.waitForLoadState("domcontentloaded");

    // Check if already logged in (redirect to home)
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);

    // Listen for network requests to capture groupId from API calls
    let capturedGroupId = "";
    page.on("request", (request) => {
      const url = request.url();
      // Look for groupId in URL query params
      const match = url.match(/groupId=([^&"]+)/);
      if (match && !capturedGroupId) {
        capturedGroupId = match[1] ?? "";
        console.log(`Captured groupId from request: ${capturedGroupId}`);
      }
    });

    // Check if already logged in (URL changed from /login)
    if (!currentUrl.includes("/login")) {
      console.log("Already logged in! Extracting credentials...\n");
    } else {
      // Wait for QR code to appear (indicates not logged in)
      console.log("Waiting for QR code scan...");
      await page.waitForSelector(".qrcode, .login-qrcode, [class*='qr'], img[alt*='qr']", { timeout: 10000 }).catch(() => null);

      console.log("Please scan the QR code with your phone to login.");
      console.log("Waiting for login to complete (or close browser to cancel)...\n");

      // Wait for URL to change away from /login (indicates successful login)
      // Login redirects to /user-center/basic-information or similar
      let loginSuccess = false;
      try {
        // Wait for URL to contain /user-center (logged in state)
        await page.waitForFunction(
          () => (window as any).location.href.includes("/user-center"),
          { timeout: 120000 }
        );
        loginSuccess = true;
      } catch (e: any) {
        // Check if browser was closed
        if (e.message?.includes("browser has been closed") || e.message?.includes("context has been closed")) {
          console.log("Browser closed. Login cancelled.");
          await browser.close();
          process.exit(1);
        }
        // Alternative: wait for URL to not contain /login anymore
        try {
          await page.waitForFunction(
            () => !(window as any).location.href.includes("/login"),
            { timeout: 60000 }
          );
          loginSuccess = true;
        } catch (e2: any) {
          if (e2.message?.includes("browser has been closed") || e2.message?.includes("context has been closed")) {
            console.log("Browser closed. Login cancelled.");
            await browser.close();
            process.exit(1);
          }
          throw e2;
        }
      }

      if (!loginSuccess) {
        console.log("Login timed out or was cancelled.");
        await browser.close();
        process.exit(1);
      }
    }

    console.log("Login successful! Extracting credentials...\n");
    console.log(`Current URL: ${page.url()}`);

    // Navigate to coding plan page - this triggers the API call with groupId
    console.log("Navigating to Coding Plan page to extract groupId...");

    // Listen for API responses (more reliable than requests)
    let groupIdFromResponse = "";
    page.on("response", async (response) => {
      const url = response.url();
      // Look for the quota API response
      if (url.includes("coding_plan/remains") || url.includes("coding_plan")) {
        try {
          const data = await response.json();
          // The groupId might be in the response or headers
          const text = url;
          const match = text.match(/groupId=([^&"]+)/i);
          if (match && !groupIdFromResponse) {
            groupIdFromResponse = match[1] ?? "";
            console.log(`Captured groupId from API response URL: ${groupIdFromResponse}`);
          }
        } catch {}
      }
    });

    await page.goto("https://platform.minimaxi.com/user-center/payment/coding-plan", { waitUntil: "networkidle" });
    await page.waitForLoadState("domcontentloaded");

    // Wait for the page to fully load and show usage data
    console.log("Waiting for usage data to load...");
    await new Promise(r => setTimeout(r, 5000));

    // Also try to capture from requests
    const finalUrl = page.url();
    console.log(`Current URL: ${finalUrl}`);

    // Get all cookies
    const cookies = await context.cookies();
    const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    console.log(`Got ${cookies.length} cookies`);

    // Get groupId from captured network responses first (most reliable)
    let groupId = groupIdFromResponse || capturedGroupId;

    // If not captured, try localStorage
    if (!groupId) {
      groupId = await page.evaluate(() => {
        const keysToCheck = [
          "groupId", "group_id", "workspaceId", "workspace_id",
          "teamId", "team_id", "orgId", "org_id",
          "currentGroupId", "current_group_id", "userGroupId"
        ];
        for (const key of keysToCheck) {
          const val = localStorage.getItem(key) || sessionStorage.getItem(key);
          if (val) return val;
        }
        return "";
      });
    }

    // Try from URL query params
    if (!groupId) {
      groupId = await page.evaluate(() => {
        const url = (window as any).location.href;
        const match = url.match(/groupId=([^&]+)/) || url.match(/workspaceId=([^&]+)/);
        if (match) return match[1];
        return "";
      });
    }

    // Use captured groupId from network requests if available
    if (!groupId && capturedGroupId) {
      groupId = capturedGroupId;
      console.log(`Using captured groupId: ${groupId}`);
    }

    console.log(`Group ID: ${groupId || "not found"}`);

    if (!groupId) {
      console.log("Warning: groupId not found. Quota API may not work without it.");
    }

    // Check if login was successful (should have meaningful cookies)
    if (!cookieString || cookies.length < 3) {
      console.error("Login appears to have failed or was cancelled. Not saving credentials.");
      await browser.close();
      process.exit(1);
    }

    // Save credentials
    mkdirSync(dirname(CREDS_PATH), { recursive: true });
    writeFileSync(
      CREDS_PATH,
      JSON.stringify(
        {
          cookie: cookieString,
          groupId: groupId || "",
          loggedInAt: Date.now(),
        },
        null,
        2
      )
    );

    console.log(`Credentials saved to: ${CREDS_PATH}`);
    console.log("\nLogin complete! You can now close the browser.");

    // Wait a moment then close
    await new Promise(r => setTimeout(r, 2000));
  } catch (error) {
    console.error("Login failed:", error);
    await browser.close();
    process.exit(1);
  } finally {
    await browser.close();
  }
}

login();
