/**
 * Aliyun Bailian Login Script
 *
 * Usage: bun run scripts/aliyun-login.ts
 *
 * This script:
 * 1. Opens Aliyun Bailian console
 * 2. Waits for user to login (QR code, password, SMS, etc.)
 * 3. Navigates to Coding Plan page to trigger the quota API
 * 4. Captures the full POST body (including sec_token) and cookies
 * 5. If auto-navigation doesn't capture the API, keeps browser open for manual navigation
 * 6. Saves credentials to ~/.claude/oh-my-claude/aliyun-creds.json
 */

// Playwright callbacks execute in browser context where `window` exists
declare const window: any;

import { chromium } from "playwright";
import { homedir } from "os";
import { join, dirname } from "path";
import { mkdirSync, existsSync } from "fs";
import { execSync } from "child_process";
import { writeSecretFile } from "../src/shared/auth/store";

const CREDS_PATH = join(homedir(), ".claude", "oh-my-claude", "aliyun-creds.json");

/** Find a browser executable on Windows */
function findBrowserWindows(): string | null {
  const candidates = [
    join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
    join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
    join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
    join(process.env.PROGRAMFILES || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  try {
    const result = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe" /ve', { encoding: "utf-8" });
    const match = result.match(/REG_SZ\s+(.+\.exe)/i);
    if (match?.[1] && existsSync(match[1].trim())) return match[1].trim();
  } catch {}
  return null;
}

async function login() {
  console.log("Starting Aliyun Bailian login...\n");
  console.log("Note: You'll need to log in once. Your cookies will be saved for quota display.\n");

  let browser;
  const isWindows = process.platform === "win32";

  if (isWindows) {
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

  // Track captured data
  let capturedQuotaResponse: any = null;
  let capturedFormBody: string = "";
  let capturedSecToken: string = "";

  // Intercept requests to capture the POST body (contains sec_token)
  page.on("request", (request: any) => {
    const url = request.url();
    if (url.includes("codingPlan") || url.includes("CodingPlan")) {
      const postData = request.postData();
      if (postData && !capturedFormBody) {
        capturedFormBody = postData;
        // Extract sec_token from the form body
        const tokenMatch = postData.match(/sec_token=([^&]+)/);
        if (tokenMatch) {
          capturedSecToken = tokenMatch[1];
          console.log(`Captured sec_token: ${capturedSecToken}`);
        }
        console.log(`Captured API form body (${postData.length} bytes)`);
      }
    }
  });

  // Intercept responses to capture quota data
  page.on("response", async (response: any) => {
    const url = response.url();
    if (url.includes("queryCodingPlanInstanceInfoV2")) {
      try {
        const text = await response.text();
        const data = JSON.parse(text);
        if (!capturedQuotaResponse && data.code === "200") {
          capturedQuotaResponse = data;
          console.log("Captured Coding Plan quota API response!");
        }
      } catch {}
    }
  });

  try {
    // Step 1: Open Bailian console
    console.log("Opening Aliyun Bailian console...");
    await page.goto("https://bailian.console.aliyun.com/", { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for page to settle
    await new Promise(r => setTimeout(r, 3000));

    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);

    // Step 2: Handle login if needed
    const isLoginPage = currentUrl.includes("login.aliyun.com") ||
                        currentUrl.includes("account.aliyun.com") ||
                        currentUrl.includes("signin");

    if (isLoginPage) {
      console.log("\nPlease login with your Aliyun account.");
      console.log("Supported methods: QR code, password, SMS, etc.");
      console.log("Waiting for login to complete (up to 5 minutes)...\n");

      const loginTimeout = 300_000;
      const pollInterval = 2_000;
      const startTime = Date.now();
      let loginDetected = false;

      while (Date.now() - startTime < loginTimeout) {
        try {
          if (page.isClosed()) {
            console.log("Browser closed. Login cancelled.");
            process.exit(1);
          }

          const url = page.url();
          if (url.includes("bailian.console.aliyun.com")) {
            loginDetected = true;
            console.log("Login detected! Redirected to Bailian console.");
            break;
          }
        } catch (e: any) {
          if (e.message?.includes("browser has been closed") || e.message?.includes("context has been closed")) {
            console.log("Browser closed. Login cancelled.");
            process.exit(1);
          }
        }

        await new Promise(r => setTimeout(r, pollInterval));
      }

      if (!loginDetected) {
        console.error("Login timed out after 5 minutes.");
        await browser.close();
        process.exit(1);
      }
    } else {
      console.log("Already logged in!");
    }

    console.log("\nLogin successful!");

    // Step 3: Navigate to the Coding Plan page.
    // The quota API (queryCodingPlanInstanceInfoV2) is triggered on this page.
    // Use full URL with region and tab to avoid "enable service" dialog.
    console.log("Navigating to Coding Plan page...");
    try {
      await page.goto("https://bailian.console.aliyun.com/cn-beijing/?tab=model#/efm/coding_plan", {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    } catch (error: any) {
      const isTimeout = error?.name === "TimeoutError" || `${error?.message || ""}`.includes("Timeout");
      if (!isTimeout) {
        throw error;
      }
      if (capturedQuotaResponse || capturedFormBody) {
        console.log("Navigation timed out, but auth/quota data was already captured. Continuing...");
      } else {
        console.log("Navigation timed out on SPA route. Continuing with response listener fallback...");
      }
    }

    // SPA hash routes can keep network active; explicitly wait for the quota response once after goto.
    if (!capturedQuotaResponse) {
      try {
        const quotaResp = await page.waitForResponse(
          (resp: any) => resp.url().includes("queryCodingPlanInstanceInfoV2"),
          { timeout: 45_000 }
        );
        const text = await quotaResp.text();
        const data = JSON.parse(text);
        if (!capturedQuotaResponse && data?.code === "200") {
          capturedQuotaResponse = data;
          console.log("Captured Coding Plan quota API response via waitForResponse!");
        }
      } catch {
        console.log("Quota API was not observed via waitForResponse; falling back to polling/manual capture.");
      }
    }

    // Step 4: Wait for the quota API to be captured (15s initial wait)
    console.log("Waiting for quota API response (up to 15s)...");
    const initialPollEnd = Date.now() + 15_000;
    while (Date.now() < initialPollEnd) {
      if (capturedQuotaResponse && capturedFormBody) {
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    // Step 5: If not captured, keep browser open for manual navigation
    if (!capturedQuotaResponse || !capturedFormBody) {
      console.log("\n" + "=".repeat(60));
      console.log("Quota API not captured automatically.");
      console.log("The page may show a '开通' (enable) dialog or require manual navigation.");
      console.log("");
      console.log("Please navigate to: Model > Coding Plan in the console,");
      console.log("or dismiss any dialogs and wait for the quota page to load.");
      console.log("");
      console.log("The browser will stay open for up to 3 minutes.");
      console.log("It will close automatically once the API is captured.");
      console.log("=".repeat(60) + "\n");

      const manualTimeout = 180_000; // 3 minutes
      const manualStart = Date.now();
      while (Date.now() - manualStart < manualTimeout) {
        try {
          if (page.isClosed()) break;
        } catch {
          break;
        }

        if (capturedQuotaResponse && capturedFormBody) {
          console.log("\nQuota API captured after manual navigation!");
          break;
        }
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    const verifiedWorking = !!capturedQuotaResponse;

    if (verifiedWorking) {
      console.log("\nQuota API captured successfully!");
    } else {
      console.log("\nWarning: Quota API not captured. Cookies will be saved anyway.");
      console.log("Statusline will fall back to request count display.");
    }

    // Step 6: Collect cookies from all domains
    const cookies = await context.cookies();
    const cookieString = cookies.map((c: any) => `${c.name}=${c.value}`).join("; ");

    console.log(`Got ${cookies.length} cookies`);

    if (!cookieString || cookies.length < 3) {
      console.error("Login appears to have failed. Not enough cookies captured.");
      await browser.close();
      process.exit(1);
    }

    // Step 7: Save credentials with 0600 permissions on POSIX (HIGH-13).
    mkdirSync(dirname(CREDS_PATH), { recursive: true });
    writeSecretFile(
      CREDS_PATH,
      JSON.stringify(
        {
          type: "aliyun",
          cookie: cookieString,
          secToken: capturedSecToken || undefined,
          formBody: capturedFormBody || undefined,
          loggedInAt: Date.now(),
          verified: verifiedWorking,
          ...(capturedQuotaResponse ? { _sampleResponse: capturedQuotaResponse } : {}),
        },
        null,
        2
      )
    );

    console.log(`\nCredentials saved to: ${CREDS_PATH}`);
    if (verifiedWorking) {
      console.log("Quota display is ready — statusline will show Aliyun usage.");
    } else {
      console.log("Warning: Could not verify quota API access. Statusline may fall back to request count.");
    }
    console.log("\nLogin complete! Browser will close in 3 seconds...");

    await new Promise(r => setTimeout(r, 3000));
  } catch (error) {
    console.error("Login failed:", error);
    await browser.close();
    process.exit(1);
  } finally {
    await browser.close();
  }
}

login();
