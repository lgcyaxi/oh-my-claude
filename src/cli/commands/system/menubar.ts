/**
 * menubar command - Launch the oh-my-claude menu bar app
 *
 * The menu bar app provides a GUI for:
 * - Viewing active proxy sessions
 * - Switching models
 * - Monitoring usage
 */

import type { Command } from "commander";
import { existsSync, cpSync, mkdirSync, statSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync, execSync } from "node:child_process";
import { createFormatters } from "../../utils/colors";
import { INSTALL_DIR } from "../../utils/paths";

function resolveBunBinary(): string {
  const candidates: string[] = [];

  if (process.platform === "win32" && process.env.USERPROFILE) {
    candidates.push(join(process.env.USERPROFILE, ".bun", "bin", "bun.exe"));
  }

  const lookup = process.platform === "win32" ? "where bun" : "which bun";
  try {
    const discovered = execSync(lookup, {
      encoding: "utf-8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .filter((entry) => !/chocolatey/i.test(entry));
    candidates.push(...discovered);
  } catch {
    // fall through to candidate validation
  }

  const bunPath = candidates.find((candidate) => existsSync(candidate));
  if (!bunPath) {
    throw new Error("Bun runtime not found");
  }

  return bunPath;
}

function resolveCargoBinary(): string {
  const binaryName = process.platform === "win32" ? "cargo.exe" : "cargo";
  const candidates: string[] = [];

  const cargoHome = process.env.CARGO_HOME;
  const homeDir =
    process.platform === "win32" ? process.env.USERPROFILE : process.env.HOME;

  if (cargoHome) {
    candidates.push(join(cargoHome, "bin", binaryName));
  }
  if (homeDir) {
    candidates.push(join(homeDir, ".cargo", "bin", binaryName));
  }

  const lookup = process.platform === "win32" ? "where cargo" : "which cargo";
  try {
    const discovered = execSync(lookup, {
      encoding: "utf-8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    candidates.push(...discovered);
  } catch {
    // fall through to candidate validation
  }

  const cargoPath = candidates.find((candidate) => existsSync(candidate));
  if (!cargoPath) {
    throw new Error(
      "Rust toolchain not found (missing 'cargo'). Install rustup from https://rustup.rs and then rerun 'omc menubar --build'.",
    );
  }

  return cargoPath;
}

function resolveTauriScript(menubarDir: string): string {
  const tauriScript = join(
    menubarDir,
    "node_modules",
    "@tauri-apps",
    "cli",
    "tauri.js",
  );
  if (!existsSync(tauriScript)) {
    throw new Error("Local Tauri CLI not found");
  }
  return tauriScript;
}

function runBunCommand(menubarDir: string, args: string[], env?: NodeJS.ProcessEnv) {
  execFileSync(resolveBunBinary(), args, {
    cwd: menubarDir,
    stdio: "inherit",
    windowsHide: true,
    env: env ?? process.env,
  });
}

function runTauriCommand(menubarDir: string, args: string[], env?: NodeJS.ProcessEnv) {
  execFileSync(process.execPath, [resolveTauriScript(menubarDir), ...args], {
    cwd: menubarDir,
    stdio: "inherit",
    windowsHide: true,
    env: env ?? process.env,
  });
}

function resolveMenubarPlatformDir(
  platform = process.platform,
  arch = process.arch,
): string {
  if (platform === "win32") {
    return "windows-x64";
  }
  if (platform === "darwin") {
    return `macos-${arch === "arm64" ? "arm64" : "x64"}`;
  }
  return "linux-x64";
}

export function copyBuiltMenubarBinary(
  menubarDir: string,
  platform = process.platform,
  arch = process.arch,
): string {
  const binaryName = platform === "win32" ? "omc-menubar.exe" : "omc-menubar";
  const builtExe = join(menubarDir, "src-tauri", "target", "release", binaryName);
  if (!existsSync(builtExe)) {
    throw new Error(`Built menubar binary not found: ${builtExe}`);
  }

  const buildsDir = join(
    menubarDir,
    "builds",
    resolveMenubarPlatformDir(platform, arch),
  );
  mkdirSync(buildsDir, { recursive: true });
  const copiedExe = join(buildsDir, binaryName);
  cpSync(builtExe, copiedExe);

  if (!existsSync(copiedExe)) {
    throw new Error(`Failed to copy menubar binary to ${copiedExe}`);
  }

  return copiedExe;
}

function isLikelyGitLfsPointer(filePath: string): boolean {
  try {
    const stat = statSync(filePath);
    if (!stat.isFile() || stat.size >= 1024) {
      return false;
    }

    return readFileSync(filePath, { encoding: "utf-8" })
      .slice(0, 40)
      .startsWith("version https://git-lfs");
  } catch {
    return false;
  }
}

export function resolveMenubarAppPath(
  menubarDir: string,
  platform = process.platform,
  arch = process.arch,
): string | undefined {
  const isWindows = platform === "win32";
  const isMac = platform === "darwin";

  if (isMac) {
    const releasePath = join(menubarDir, "src-tauri", "target", "release", "bundle", "macos");
    const possiblePaths = [
      join(menubarDir, "builds", "macos-arm64", "omc-menubar"),
      join(menubarDir, "builds", "macos-x64", "omc-menubar"),
      join(releasePath, "omc-menubar.app"),
      join(releasePath, "oh-my-claude-menubar.app"),
      join(menubarDir, "src-tauri", "target", "release", "omc-menubar"),
    ];

    return possiblePaths.find((p) => existsSync(p) && !isLikelyGitLfsPointer(p));
  }

  if (isWindows) {
    const possiblePaths = [
      join(menubarDir, "builds", resolveMenubarPlatformDir(platform, arch), "omc-menubar.exe"),
      join(menubarDir, "src-tauri", "target", "release", "omc-menubar.exe"),
      join(menubarDir, "src-tauri", "target", "release", "bundle", "msi", "omc-menubar.exe"),
    ];

    return possiblePaths.find((p) => existsSync(p) && !isLikelyGitLfsPointer(p));
  }

  const possiblePaths = [
    join(menubarDir, "builds", resolveMenubarPlatformDir(platform, arch), "omc-menubar"),
    join(menubarDir, "src-tauri", "target", "release", "omc-menubar"),
    join(menubarDir, "src-tauri", "target", "release", "bundle", "appimage", "omc-menubar"),
  ];

  return possiblePaths.find((p) => existsSync(p) && !isLikelyGitLfsPointer(p));
}

export function registerMenubarCommand(program: Command) {
  program
    .command("menubar")
    .description("Launch the oh-my-claude menu bar app for session management")
    .option("-d, --dev", "Run in development mode with DevTools")
    .option("-b, --build", "Build the menubar app before launching")
    .action(async (options: { dev?: boolean; build?: boolean }) => {
      const { c, ok, fail, dimText } = createFormatters();

      const currentDir = dirname(fileURLToPath(import.meta.url));
      // Search order: installed version first (complete), then source directories (dev)
      const searchPaths = [
        join(INSTALL_DIR, "apps", "menubar"),
        join(currentDir, "..", "..", "apps", "menubar"),
        join(currentDir, "..", "..", "..", "..", "apps", "menubar"),
        join(currentDir, "..", "..", "..", "apps", "menubar"),
      ];

      let menubarDir: string | null = null;
      for (const p of searchPaths) {
        if (existsSync(p)) {
          menubarDir = p;
          break;
        }
      }

      if (!menubarDir) {
        console.log(fail("Menubar app not found."));
        console.log(dimText("Try reinstalling: oh-my-claude install --force"));
        process.exit(1);
      }

      const tauriConf = join(menubarDir, "src-tauri", "tauri.conf.json");
      if (!existsSync(tauriConf)) {
        console.log(fail("Menubar app source is incomplete (missing tauri.conf.json)."));
        console.log(dimText("Clone the full repo to build the menubar app:"));
        console.log(`  git clone https://github.com/lgcyaxi/oh-my-claude.git`);
        console.log(`  cd oh-my-claude/apps/menubar`);
        console.log(`  bun install && bun run tauri build --ci`);
        process.exit(1);
      }

      const nodeModulesPath = join(menubarDir, "node_modules");
      if (!existsSync(nodeModulesPath)) {
        console.log(dimText("Installing menubar dependencies..."));
        try {
          runBunCommand(menubarDir, ["install"]);
        } catch {
          console.log(fail("Failed to install menubar dependencies"));
          console.log(dimText(`Run 'bun install' in ${menubarDir}`));
          process.exit(1);
        }
      }

      if (options.build) {
        console.log(`${c.bold}Building menubar app...${c.reset}\n`);
        try {
          resolveCargoBinary();
          runBunCommand(menubarDir, ["run", "build"]);
          runTauriCommand(
            menubarDir,
            [
              "build",
              "--ci",
              "--config",
              JSON.stringify({ build: { beforeBuildCommand: null } }),
            ],
            { ...process.env, CI: "true" },
          );
          const copiedPath = copyBuiltMenubarBinary(menubarDir);
          console.log(ok(`Copied to ${copiedPath}`));

          console.log(ok("Build complete"));
        } catch (error) {
          console.log(fail("Build failed"));
          if (error instanceof Error && error.message) {
            console.log(dimText(error.message));
          }
          process.exit(1);
        }
      }

      console.log(`${c.bold}Launching oh-my-claude menu bar...${c.reset}\n`);

      const isWindows = process.platform === "win32";
      const isMac = process.platform === "darwin";

      if (options.dev) {
        console.log(dimText("Running in development mode..."));
        try {
          resolveCargoBinary();
          runTauriCommand(menubarDir, ["dev"]);
        } catch {
          // Process exited
        }
      } else {
        const appPath = resolveMenubarAppPath(menubarDir);

        if (appPath) {
          console.log(ok(`Launching: ${appPath}`));

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
