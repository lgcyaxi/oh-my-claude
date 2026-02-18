/**
 * Kimi Login Script
 *
 * Usage: bun run scripts/kimi-login.ts
 *
 * This script:
 * 1. Opens Kimi website
 * 2. Waits for user to login (QR code scan or credentials)
 * 3. Extracts access_token from browser localStorage
 * 4. Extracts kimi-auth cookie
 * 5. Saves to ~/.claude/oh-my-claude/kimi-creds.json
 */

import { chromium } from "playwright";
import { homedir } from "os";
import { join, dirname } from "path";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { execSync } from "child_process";

const CREDS_PATH = join(homedir(), ".claude", "oh-my-claude", "kimi-creds.json");

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
  console.log("Starting Kimi login...\n");
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

  // Clear all cookies to force fresh login - don't trust cached credentials
  const context = await browser.newContext();
  await context.clearCookies();
  const page = await context.newPage();

  try {
    let capturedToken = "";

    /** 3 base64url parts separated by dots = JWT-like format */
    function isValidJwt(token: string): boolean {
      const parts = token.split(".");
      if (parts.length !== 3) return false;
      return parts.every(p => p.length > 0 && /^[A-Za-z0-9_-]+$/.test(p));
    }

    // Log API responses for debugging (token is extracted from localStorage instead)
    page.on("response", async (response: any) => {
      const url = response.url();
      if (url.includes("GetUsages") && response.status() === 200) {
        console.log(`GetUsages API call detected (HTTP ${response.status()})`);
      }
    });

    console.log("Opening Kimi website...");
    await page.goto("https://www.kimi.com/", { waitUntil: "networkidle" });
    await page.waitForLoadState("domcontentloaded");

    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);

    console.log("Please login to Kimi (scan QR code or enter credentials).");
    console.log("Waiting for login to complete (or close browser to cancel)...\n");

    // Poll for login completion by checking for access_token in localStorage.
    // The URL doesn't reliably change on login, so we check the actual auth state.
    const loginTimeout = 300_000; // 5 minutes
    const pollInterval = 2_000;
    const startTime = Date.now();
    let loginDetected = false;

    while (Date.now() - startTime < loginTimeout) {
      try {
        if (page.isClosed()) {
          console.log("Browser closed. Login cancelled.");
          process.exit(1);
        }

        // Check if access_token appeared in localStorage
        const token = await page.evaluate(() => localStorage.getItem("access_token")).catch(() => null);
        if (token && token.length > 10) {
          capturedToken = token;
          loginDetected = true;
          console.log("Login detected! Found access_token in localStorage.");
          break;
        }

        // Also check for kimi-auth cookie as fallback signal
        const cookies = await context.cookies();
        const kimiAuth = cookies.find(c => c.name === "kimi-auth");
        if (kimiAuth && kimiAuth.value.length > 10) {
          console.log("Login detected via kimi-auth cookie. Waiting for localStorage token...");
          // Give the page a moment to populate localStorage after cookie is set
          await new Promise(r => setTimeout(r, 3000));
          const tokenRetry = await page.evaluate(() => localStorage.getItem("access_token")).catch(() => null);
          if (tokenRetry && tokenRetry.length > 10) {
            capturedToken = tokenRetry;
            loginDetected = true;
            break;
          }
        }
      } catch (e: any) {
        if (e.message?.includes("browser has been closed") || e.message?.includes("context has been closed")) {
          console.log("Browser closed. Login cancelled.");
          process.exit(1);
        }
        // Page navigation in progress, retry
      }

      await new Promise(r => setTimeout(r, pollInterval));
    }

    if (!loginDetected) {
      console.error("Login timed out after 5 minutes.");
      await browser.close();
      process.exit(1);
    }

    console.log("Login successful! Extracting credentials...\n");

    // If token not yet captured, navigate to console page to extract it
    if (!capturedToken) {
      console.log("Navigating to console page...");
      await page.goto("https://www.kimi.com/code/console?from=kfc_overview_topbar", {
        waitUntil: "networkidle"
      });
      await new Promise(r => setTimeout(r, 3000));

      console.log("Extracting token from localStorage...");
      const accessToken = await page.evaluate(() => localStorage.getItem("access_token"));
      if (accessToken) {
        capturedToken = accessToken;
      } else {
        console.error("Failed to get access_token from localStorage");
        await browser.close();
        process.exit(1);
      }
    }

    console.log(`Got access_token: ${capturedToken.substring(0, 20)}...`);

    const finalCookies = await context.cookies();
    const kimiAuthCookie = finalCookies.find(c => c.name === "kimi-auth");

    console.log(`Got ${finalCookies.length} cookies`);

    if (kimiAuthCookie && isValidJwt(kimiAuthCookie.value)) {
      console.log(`Found valid kimi-auth cookie: ${kimiAuthCookie.value.substring(0, 20)}...`);
    } else if (kimiAuthCookie) {
      console.log(`Warning: kimi-auth cookie found but has invalid format (not JWT-like).`);
    } else {
      console.log("Warning: kimi-auth cookie not found.");
    }

    const cookieString = kimiAuthCookie ? `${kimiAuthCookie.name}=${kimiAuthCookie.value}` : "";
    const finalCookieString = cookieString || finalCookies.map(c => `${c.name}=${c.value}`).join("; ");

    console.log(`Token: ${capturedToken.substring(0, 20)}...`);

    if (!capturedToken || !isValidJwt(capturedToken)) {
      console.error("Cannot save credentials: Bearer token is missing or has invalid JWT format.");
      await browser.close();
      process.exit(1);
    }

    if (!kimiAuthCookie) {
      console.log("Warning: Saving without kimi-auth cookie. Some features may not work.");
    }

    mkdirSync(dirname(CREDS_PATH), { recursive: true });
    writeFileSync(
      CREDS_PATH,
      JSON.stringify(
        {
          token: capturedToken,
          cookie: finalCookieString,
          loggedInAt: Date.now(),
        },
        null,
        2
      )
    );

    console.log(`\nCredentials saved to: ${CREDS_PATH}`);
    console.log("\nLogin complete! You can now close the browser.");

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
