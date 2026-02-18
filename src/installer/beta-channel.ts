/**
 * Beta Channel Management
 *
 * Utilities for managing beta channel installations from GitHub dev branch.
 * Beta installations are tracked via a marker file at ~/.claude/oh-my-claude/.beta-channel
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { getInstallDir } from "./index";

/**
 * Beta channel marker file info
 */
export interface BetaChannelInfo {
  /** Git commit SHA or tag */
  ref: string;
  /** Branch name (usually 'dev') */
  branch: string;
  /** ISO timestamp of installation */
  installedAt: string;
}

/**
 * Get the path to the beta channel marker file
 */
export function getBetaChannelPath(): string {
  return join(getInstallDir(), ".beta-channel");
}

/**
 * Check if the current installation is from beta channel
 */
export function isBetaInstallation(): boolean {
  return existsSync(getBetaChannelPath());
}

/**
 * Get beta channel info from marker file
 * @returns BetaChannelInfo if on beta channel, null otherwise
 */
export function getBetaChannelInfo(): BetaChannelInfo | null {
  const markerPath = getBetaChannelPath();

  if (!existsSync(markerPath)) {
    return null;
  }

  try {
    const content = readFileSync(markerPath, "utf-8");
    const info = JSON.parse(content) as BetaChannelInfo;

    // Validate required fields
    if (!info.ref || !info.branch || !info.installedAt) {
      console.warn("Beta channel marker file is corrupted, treating as stable installation");
      return null;
    }

    return info;
  } catch (error) {
    console.warn("Failed to read beta channel marker file:", error);
    return null;
  }
}

/**
 * Set beta channel info (creates/updates marker file)
 */
export function setBetaChannelInfo(info: BetaChannelInfo): void {
  const markerPath = getBetaChannelPath();
  writeFileSync(markerPath, JSON.stringify(info, null, 2), "utf-8");
}

/**
 * Clear beta channel (removes marker file)
 * @returns true if marker was removed, false if it didn't exist
 */
export function clearBetaChannel(): boolean {
  const markerPath = getBetaChannelPath();

  if (!existsSync(markerPath)) {
    return false;
  }

  try {
    unlinkSync(markerPath);
    return true;
  } catch (error) {
    console.error("Failed to remove beta channel marker:", error);
    return false;
  }
}

/**
 * Result of a GitHub installation attempt
 */
export interface GitHubInstallResult {
  success: boolean;
  ref: string;
  resolvedRef?: string; // The actual commit SHA if ref was a branch
  error?: string;
}

/**
 * Install oh-my-claude from GitHub tarball
 *
 * @param ref - Git ref to install (branch name, tag, or commit SHA). Defaults to 'dev'
 * @param repoOwner - GitHub repository owner. Defaults to 'lgcyaxi'
 * @param repoName - GitHub repository name. Defaults to 'oh-my-claude'
 */
export async function installFromGitHub(
  ref: string = "dev",
  repoOwner: string = "anthropics",
  repoName: string = "oh-my-claude"
): Promise<GitHubInstallResult> {
  // Override with actual repo owner
  repoOwner = "lgcyaxi";

  const tarballUrl = `https://github.com/${repoOwner}/${repoName}/tarball/${ref}`;

  try {
    console.log(`Installing from GitHub: ${repoOwner}/${repoName}#${ref}`);
    console.log(`Tarball URL: ${tarballUrl}`);

    // Use npm to install from GitHub tarball
    // This will download, extract, and run npm install
    const installCmd = `npm install --global "${tarballUrl}"`;

    console.log(`Running: ${installCmd}`);
    execSync(installCmd, {
      stdio: "inherit",
      timeout: 120000, // 2 minute timeout
    });

    // Build dist/ in the global install directory
    // GitHub tarballs contain source only — the prepare script may silently
    // skip the build if bun is not in npm's PATH, leaving dist/ empty.
    const globalRoot = execSync("npm root -g", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    const globalPkgDir = join(globalRoot, "@lgcyaxi", "oh-my-claude");

    if (!existsSync(join(globalPkgDir, "dist", "cli.js"))) {
      console.log("Building from source (dist/ not found)...");
      execSync("bun run build:all", {
        cwd: globalPkgDir,
        stdio: "inherit",
        timeout: 120000,
      });
    }

    // Try to resolve the actual commit SHA for the ref
    let resolvedRef = ref;
    try {
      const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/commits/${ref}`;
      const response = execSync(`curl -s "${apiUrl}"`, { encoding: "utf-8" });
      const data = JSON.parse(response);
      if (data.sha) {
        resolvedRef = data.sha.substring(0, 7); // Short SHA
      }
    } catch {
      // Failed to resolve, use original ref
    }

    return {
      success: true,
      ref,
      resolvedRef,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check for common error patterns
    if (errorMessage.includes("404") || errorMessage.includes("Not Found")) {
      return {
        success: false,
        ref,
        error: `Ref '${ref}' not found on GitHub repository ${repoOwner}/${repoName}.`,
      };
    }

    if (errorMessage.includes("ENOTFOUND") || errorMessage.includes("getaddrinfo")) {
      return {
        success: false,
        ref,
        error: "Cannot reach GitHub. Check your internet connection.",
      };
    }

    return {
      success: false,
      ref,
      error: `Failed to install from GitHub: ${errorMessage}`,
    };
  }
}

/**
 * Check if a newer beta version is available on GitHub
 *
 * @param currentRef - Current installed ref (commit SHA)
 * @param branch - Branch to check (defaults to 'dev')
 * @returns Object with isNewer flag and latest ref info
 */
export async function checkForNewerBeta(
  currentRef: string,
  branch: string = "dev"
): Promise<{
  isNewer: boolean;
  latestRef?: string;
  latestDate?: string;
  error?: string;
}> {
  const repoOwner = "lgcyaxi";
  const repoName = "oh-my-claude";

  try {
    const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/commits/${branch}`;
    const response = execSync(`curl -s "${apiUrl}"`, {
      encoding: "utf-8",
      timeout: 10000,
    });

    const data = JSON.parse(response);

    if (!data.sha) {
      return { isNewer: false, error: "Invalid response from GitHub API" };
    }

    const latestRef = data.sha.substring(0, 7);
    const latestDate = data.commit?.committer?.date;

    // Compare refs (short SHA comparison)
    const isNewer = !currentRef.startsWith(latestRef) && !latestRef.startsWith(currentRef);

    return {
      isNewer,
      latestRef,
      latestDate,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes("rate limit")) {
      return { isNewer: false, error: "GitHub API rate limit exceeded. Try again later." };
    }

    return { isNewer: false, error: `Failed to check for updates: ${errorMessage}` };
  }
}
