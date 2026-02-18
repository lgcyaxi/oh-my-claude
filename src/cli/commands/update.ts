/**
 * CLI "update" command — Update oh-my-claude to the latest version
 *
 * Supports stable (npm) and beta (GitHub tarball) channels.
 */

import type { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { createFormatters } from "../utils/colors";
import { INSTALL_DIR } from "../utils/paths";

export function registerUpdateCommand(program: Command) {
  program
    .command("update")
    .description("Update oh-my-claude to the latest version")
    .option("--check", "Only check for updates without installing")
    .option("--force", "Force update even if already on latest version")
    .option("--beta", "Install from GitHub dev branch (beta channel)")
    .option("--ref <ref>", "Specific git ref to install (requires --beta)")
    .action(async (options) => {
      const {
        isBetaInstallation,
        getBetaChannelInfo,
        setBetaChannelInfo,
        clearBetaChannel,
        installFromGitHub,
      } = require("../../installer/beta-channel");

      const { c, ok, fail, warn, dimText } = createFormatters();

      // Custom header for this command (cyan+bold, no leading newline)
      const header = (text: string) => `${c.cyan}${c.bold}${text}${c.reset}`;

      const PACKAGE_NAME = "@lgcyaxi/oh-my-claude";
      const GITHUB_REPO = "lgcyaxi/oh-my-claude";

      // Check if --ref is used without --beta
      if (options.ref && !options.beta) {
        console.log(`${fail("--ref requires --beta flag")}`);
        console.log(
          `${dimText("Usage: oh-my-claude update --beta --ref=<commit>")}`
        );
        process.exit(1);
      }

      console.log(`${c.bold}${c.magenta}oh-my-claude Update${c.reset}\n`);

      // Get current version and beta status
      let currentVersion = "unknown";
      const betaInfo = getBetaChannelInfo();
      const isCurrentlyBeta = isBetaInstallation();

      try {
        const localPkgPath = join(INSTALL_DIR, "package.json");

        if (existsSync(localPkgPath)) {
          const pkg = JSON.parse(readFileSync(localPkgPath, "utf-8"));
          currentVersion = pkg.version;
        } else {
          currentVersion = program.version() || "unknown";
        }
      } catch (error) {
        currentVersion = program.version() || "unknown";
      }

      // Display current version with channel info
      if (isCurrentlyBeta && betaInfo) {
        console.log(
          `Current version: ${c.cyan}${currentVersion}${c.reset} ${c.yellow}(beta)${c.reset}`
        );
        console.log(
          `Channel: beta (${betaInfo.branch} @ ${betaInfo.ref.substring(0, 7)})`
        );
      } else {
        console.log(
          `Current version: ${c.cyan}${currentVersion}${c.reset} ${c.green}(stable)${c.reset}`
        );
      }

      // === BETA UPDATE PATH ===
      if (options.beta) {
        const ref = options.ref || "dev";
        console.log(`\n${header("Installing from beta channel...")}`);
        console.log(
          `${dimText(`Target: GitHub ${GITHUB_REPO}#${ref}`)}\n`
        );

        if (options.check) {
          console.log(warn(`Would install beta from: ${ref}`));
          console.log(
            `\nRun ${c.cyan}oh-my-claude update --beta${c.reset} to install.`
          );
          process.exit(0);
        }

        try {
          // Install from GitHub tarball
          const tarballUrl = `https://github.com/${GITHUB_REPO}/tarball/${ref}`;
          console.log(`${dimText("Downloading from GitHub...")}`);
          console.log(`${dimText(`URL: ${tarballUrl}`)}\n`);

          // Use npm to install globally from tarball
          const installCmd = `npm install --global "${tarballUrl}"`;
          execSync(installCmd, { stdio: "inherit", timeout: 120000 });

          // Build dist/ in the global install directory
          // GitHub tarballs contain source only — the prepare script may silently
          // skip the build if bun is not in npm's PATH, leaving dist/ empty.
          const globalRoot = execSync("npm root -g", {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          }).trim();
          const globalPkgDir = join(globalRoot, "@lgcyaxi", "oh-my-claude");

          if (!existsSync(join(globalPkgDir, "dist", "cli.js"))) {
            console.log(
              `${dimText("Building from source (dist/ not found)...")}`
            );
            try {
              execSync("bun run build:all", {
                cwd: globalPkgDir,
                stdio: "inherit",
                timeout: 120000,
              });
              console.log(`${ok("Build complete")}`);
            } catch (buildError) {
              console.log(
                `${fail("Build failed — bun is required to build from GitHub source")}`
              );
              console.log(
                `${dimText("Ensure bun is installed: https://bun.sh")}`
              );
              throw buildError;
            }
          }

          // Run install --force using the global binary directly (not npx, which
          // may resolve to the npm registry instead of the freshly-installed version)
          console.log(`\n${dimText("Setting up components...")}`);
          execSync(`oh-my-claude install --force`, { stdio: "inherit" });

          // Resolve the actual commit SHA
          let resolvedRef = ref;
          try {
            const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/commits/${ref}`;
            const response = execSync(`curl -s "${apiUrl}"`, {
              encoding: "utf-8",
              timeout: 10000,
            });
            const data = JSON.parse(response);
            if (data.sha) {
              resolvedRef = data.sha.substring(0, 7);
            }
          } catch {
            // Use original ref if resolution fails
          }

          // Write beta channel marker
          setBetaChannelInfo({
            ref: resolvedRef,
            branch: ref === "dev" ? "dev" : ref,
            installedAt: new Date().toISOString(),
          });

          console.log(`\n${ok("Beta installation complete!")}`);
          if (isCurrentlyBeta && betaInfo) {
            console.log(
              `Updated from beta ${c.yellow}${betaInfo.ref.substring(0, 7)}${c.reset} to ${c.green}${resolvedRef}${c.reset}`
            );
          } else {
            console.log(
              `Switched from ${c.yellow}stable${c.reset} to ${c.green}beta (${resolvedRef})${c.reset}`
            );
          }
          console.log(
            `\n${dimText("To switch back to stable: oh-my-claude update")}`
          );
        } catch (error) {
          console.log(`\n${fail("Beta installation failed")}`);
          const errMsg =
            error instanceof Error ? error.message : String(error);
          if (errMsg.includes("404") || errMsg.includes("Not Found")) {
            console.log(
              `${dimText(`Ref '${ref}' not found on GitHub.`)}`
            );
          } else if (
            errMsg.includes("ENOTFOUND") ||
            errMsg.includes("getaddrinfo")
          ) {
            console.log(
              `${dimText("Cannot reach GitHub. Check your internet connection.")}`
            );
          } else {
            console.log(`${dimText(errMsg)}`);
          }
          console.log(`\n${dimText("Try running manually:")}`);
          console.log(
            `  ${c.cyan}npm install -g https://github.com/${GITHUB_REPO}/tarball/${ref}${c.reset}`
          );
          process.exit(1);
        }
        return;
      }

      // === SWITCH FROM BETA TO STABLE ===
      if (isCurrentlyBeta && betaInfo) {
        console.log(
          `\n${warn("Switching from beta to stable channel...")}`
        );

        if (options.check) {
          console.log(
            `\nRun ${c.cyan}oh-my-claude update${c.reset} to switch to stable.`
          );
          console.log(
            `${dimText("Or use --beta to stay on beta channel.")}`
          );
          process.exit(0);
        }
      }

      // === STABLE UPDATE PATH ===
      let latestVersion = "unknown";
      try {
        console.log(
          `${dimText("Checking npm registry for latest version...")}`
        );
        const npmInfo = execSync(`npm view ${PACKAGE_NAME} version`, {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        }).trim();
        latestVersion = npmInfo;
        console.log(
          `Latest version:  ${c.cyan}${latestVersion}${c.reset}\n`
        );
      } catch (error) {
        console.log(
          `${fail("Failed to fetch latest version from npm")}`
        );
        console.log(
          `${dimText("Check your internet connection or try again later")}\n`
        );
        process.exit(1);
      }

      // Compare versions (for stable updates)
      const isUpToDate =
        currentVersion === latestVersion && !isCurrentlyBeta;
      const needsUpdate = !isUpToDate || options.force || isCurrentlyBeta;

      if (isUpToDate && !options.force) {
        console.log(ok("You are already on the latest stable version!"));
        process.exit(0);
      }

      if (options.check) {
        if (needsUpdate) {
          if (isCurrentlyBeta) {
            console.log(
              warn(
                `Currently on beta. Stable version available: ${latestVersion}`
              )
            );
          } else {
            console.log(
              warn(
                `Update available: ${currentVersion} → ${latestVersion}`
              )
            );
          }
          console.log(
            `\nRun ${c.cyan}npx ${PACKAGE_NAME} update${c.reset} to update.`
          );
        }
        process.exit(0);
      }

      // Perform stable update
      console.log(header("Updating oh-my-claude...\n"));

      try {
        console.log(`${dimText("Clearing npx cache...")}`);
        try {
          execSync(`npx --yes clear-npx-cache`, {
            stdio: ["pipe", "pipe", "pipe"],
            timeout: 10000,
          });
        } catch {
          // Ignore errors
        }

        console.log(`${dimText("Downloading latest version...")}`);
        const updateCmd = `npx --yes ${PACKAGE_NAME}@latest install --force`;
        console.log(`${dimText(`Running: ${updateCmd}`)}\n`);

        execSync(updateCmd, { stdio: "inherit" });

        // Clear beta channel marker if switching from beta
        if (isCurrentlyBeta) {
          clearBetaChannel();
        }

        console.log(`\n${ok("Update complete!")}`);
        if (isCurrentlyBeta && betaInfo) {
          console.log(
            `Switched from ${c.yellow}beta (${betaInfo.ref.substring(0, 7)})${c.reset} to ${c.green}stable v${latestVersion}${c.reset}`
          );
        } else {
          console.log(
            `Updated from ${c.yellow}${currentVersion}${c.reset} to ${c.green}${latestVersion}${c.reset}`
          );
        }
        console.log(
          `\n${dimText("View changelog at: https://github.com/lgcyaxi/oh-my-claude/blob/main/CHANGELOG.md")}`
        );
      } catch (error) {
        console.log(`\n${fail("Update failed")}`);
        console.log(`${dimText("Try running manually:")}`);
        console.log(
          `  ${c.cyan}npx ${PACKAGE_NAME}@latest install --force${c.reset}`
        );
        process.exit(1);
      }
    });
}
