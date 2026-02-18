/**
 * menubar command — Launch the oh-my-claude menu bar app
 *
 * The menu bar app provides a GUI for:
 * - Viewing active proxy sessions
 * - Switching models
 * - Monitoring usage
 */

import type { Command } from "commander";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execSync } from "node:child_process";
import { homedir } from "node:os";
import { createFormatters } from "../utils/colors";
import { INSTALL_DIR } from "../utils/paths";

export function registerMenubarCommand(program: Command) {
  program
    .command("menubar")
    .description("Launch the oh-my-claude menu bar app for session management")
    .option("-d, --dev", "Run in development mode with DevTools")
    .option("-b, --build", "Build the menubar app before launching")
    .action(async (options: { dev?: boolean; build?: boolean }) => {
      const { c, ok, fail, dimText } = createFormatters();

      // Find menubar app directory - try multiple locations
      const currentDir = dirname(fileURLToPath(import.meta.url));
      const searchPaths = [
        // From source: dist/cli/commands/menubar.ts -> apps/menubar
        join(currentDir, "..", "..", "..", "apps", "menubar"),
        // From installed CLI: ~/.claude/oh-my-claude/dist/cli.js -> apps/menubar
        join(INSTALL_DIR, "apps", "menubar"),
        // Direct source path when running with bun run
        join(currentDir, "..", "..", "..", "..", "apps", "menubar"),
      ];

      let menubarDir: string | null = null;
      for (const p of searchPaths) {
        if (existsSync(p)) {
          menubarDir = p;
          break;
        }
      }

      if (!menubarDir) {
        console.log(fail("Menubar app source not found."));
        console.log(dimText("The menubar app is not included in the npm package."));
        console.log(dimText("Clone the repo to build it:"));
        console.log(`  git clone https://github.com/lgcyaxi/oh-my-claude.git`);
        console.log(`  cd oh-my-claude/apps/menubar`);
        console.log(`  bun install && bun run tauri build`);
        process.exit(1);
      }

      // Verify tauri.conf.json exists (required for Tauri to recognize the project)
      const tauriConf = join(menubarDir, "src-tauri", "tauri.conf.json");
      if (!existsSync(tauriConf)) {
        console.log(fail("Menubar app source is incomplete (missing tauri.conf.json)."));
        console.log(dimText("Clone the full repo to build the menubar app:"));
        console.log(`  git clone https://github.com/lgcyaxi/oh-my-claude.git`);
        console.log(`  cd oh-my-claude/apps/menubar`);
        console.log(`  bun install && bun run tauri build`);
        process.exit(1);
      }

      // Check if node_modules exists, if not install dependencies
      const nodeModulesPath = join(menubarDir, "node_modules");
      if (!existsSync(nodeModulesPath)) {
        console.log(dimText("Installing menubar dependencies..."));
        try {
          execSync("bun install", {
            cwd: menubarDir,
            stdio: "inherit",
          });
        } catch {
          console.log(fail("Failed to install menubar dependencies"));
          console.log(dimText(`Run 'bun install' in ${menubarDir}`));
          process.exit(1);
        }
      }

      // Build if requested
      if (options.build) {
        console.log(`${c.bold}Building menubar app...${c.reset}\n`);
        try {
          execSync("bun run tauri build", {
            cwd: menubarDir,
            stdio: "inherit",
          });
          console.log(ok("Build complete"));
        } catch (e) {
          console.log(fail("Build failed"));
          process.exit(1);
        }
      }

      // Launch the app
      console.log(`${c.bold}Launching oh-my-claude menu bar...${c.reset}\n`);

      const isWindows = process.platform === "win32";
      const isMac = process.platform === "darwin";

      if (options.dev) {
        // Development mode with DevTools
        console.log(dimText("Running in development mode..."));
        try {
          execSync("bun run tauri dev", {
            cwd: menubarDir,
            stdio: "inherit",
          });
        } catch {
          // Process exited
        }
      } else {
        // Try to find and launch the built app
        let appPath: string | undefined;

        if (isMac) {
          // macOS: look for .app bundle
          const releasePath = join(menubarDir, "src-tauri", "target", "release", "bundle", "macos");
          const possiblePaths = [
            join(releasePath, "omc-menubar.app"),
            join(releasePath, "oh-my-claude-menubar.app"),
            join(menubarDir, "src-tauri", "target", "release", "omc-menubar"),
            join(menubarDir, "src-tauri", "target", "release", "oh-my-claude-menubar"),
          ];

          for (const p of possiblePaths) {
            if (existsSync(p)) {
              appPath = p;
              break;
            }
          }
        } else if (isWindows) {
          // Windows: look for .exe
          const possiblePaths = [
            join(menubarDir, "src-tauri", "target", "release", "omc-menubar.exe"),
            join(menubarDir, "src-tauri", "target", "release", "oh-my-claude-menubar.exe"),
            join(menubarDir, "src-tauri", "target", "release", "bundle", "msi", "omc-menubar.exe"),
            join(menubarDir, "src-tauri", "target", "release", "bundle", "msi", "oh-my-claude-menubar.exe"),
          ];

          for (const p of possiblePaths) {
            if (existsSync(p)) {
              appPath = p;
              break;
            }
          }
        } else {
          // Linux: look for binary or AppImage
          const possiblePaths = [
            join(menubarDir, "src-tauri", "target", "release", "omc-menubar"),
            join(menubarDir, "src-tauri", "target", "release", "oh-my-claude-menubar"),
            join(menubarDir, "src-tauri", "target", "release", "bundle", "appimage", "omc-menubar"),
            join(menubarDir, "src-tauri", "target", "release", "bundle", "appimage", "oh-my-claude-menubar"),
          ];

          for (const p of possiblePaths) {
            if (existsSync(p)) {
              appPath = p;
              break;
            }
          }
        }

        if (appPath) {
          console.log(ok(`Launching: ${appPath}`));

          // On macOS, use 'open' to launch .app bundles
          if (isMac && appPath.endsWith(".app")) {
            spawn("open", [appPath], {
              detached: true,
              stdio: "ignore",
            }).unref();
          } else {
            spawn(appPath, [], {
              detached: true,
              stdio: "ignore",
            }).unref();
          }
          console.log(dimText("Menu bar app started in background"));
        } else {
          // Fallback: run in dev mode
          console.log(fail("Built app not found."));
          console.log(dimText("The menubar app requires Tauri (Rust) to build."));
          console.log(`${c.bold}Options:${c.reset}`);
          console.log(`  oh-my-claude menubar --dev     ${c.dim}# Run in dev mode (requires Rust)${c.reset}`);
          console.log(`  oh-my-claude menubar --build   ${c.dim}# Build release app (requires Rust)${c.reset}`);
          console.log(`\n${c.bold}Prerequisites:${c.reset}`);
          console.log(`  1. Install Rust: https://rustup.rs`);
          console.log(`  2. Install Tauri deps: https://v2.tauri.app/start/prerequisites`);
          process.exit(1);
        }
      }
    });
}
