/**
 * Lightweight terminal backend detection for `cc` command.
 *
 * Checks binary existence only - does NOT create panes or sessions.
 * Reuses the same platform-specific priority as src/terminal/factory.ts.
 */

import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { BUNDLED_WEZTERM_DIR } from "./paths";

export type DetectedTerminal = "wezterm" | "tmux" | null;

function resolvePackageRoot(): string {
  let currentDir = dirname(fileURLToPath(import.meta.url));

  for (let i = 0; i < 5; i += 1) {
    if (existsSync(join(currentDir, "package.json"))) {
      return currentDir;
    }
    currentDir = dirname(currentDir);
  }

  return currentDir;
}

export const CURRENT_PACKAGE_WEZTERM_DIR = join(
  resolvePackageRoot(),
  "apps",
  "wezterm",
  "windows-x64",
);

type WezTermBinaryName = "wezterm.exe" | "wezterm-gui.exe";

type WindowsWezTermResolveOptions = {
  currentExecutable?: string;
  installedBundleDir?: string;
  currentPackageBundleDir?: string;
  systemResolver?: (binaryName: WezTermBinaryName, bundledDir: string) => string | null;
};

function resolveWeztermFromCurrentSession(
  binaryName: WezTermBinaryName,
  currentExecutable = process.env.WEZTERM_EXECUTABLE,
): string | null {
  if (!currentExecutable || !existsSync(currentExecutable)) {
    return null;
  }

  const sibling = join(dirname(currentExecutable), binaryName);
  if (existsSync(sibling)) {
    return sibling;
  }

  return currentExecutable.toLowerCase().endsWith(binaryName.toLowerCase())
    ? currentExecutable
    : null;
}

export function resolveWeztermBundleFromDir(
  directory: string,
  binaryName: WezTermBinaryName,
): string | null {
  const binaryPath = join(directory, binaryName);
  return existsSync(binaryPath) && existsSync(join(directory, "wezterm-mux-server.exe"))
    ? binaryPath
    : null;
}

function resolveWeztermFromSystem(binaryName: WezTermBinaryName, bundledDir = BUNDLED_WEZTERM_DIR): string | null {
  if (process.platform !== "win32") {
    return null;
  }

  try {
    const matches = execSync(`where ${binaryName}`, {
      encoding: "utf-8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    const normalizedBundledDir = normalize(bundledDir).toLowerCase();
    const preferred = matches.find((entry) => {
      if (!existsSync(entry)) {
        return false;
      }

      return !normalize(entry).toLowerCase().startsWith(normalizedBundledDir);
    });
    if (preferred) {
      return preferred;
    }

    const fallback = matches.find((entry) => existsSync(entry));
    return fallback ?? null;
  } catch {
    return null;
  }
}

export function resolveWindowsWeztermBinary(
  binaryName: WezTermBinaryName,
  options: WindowsWezTermResolveOptions = {},
): string {
  const installedBundleDir = options.installedBundleDir ?? BUNDLED_WEZTERM_DIR;
  const currentPackageBundleDir =
    options.currentPackageBundleDir ?? CURRENT_PACKAGE_WEZTERM_DIR;
  const systemResolver = options.systemResolver ?? resolveWeztermFromSystem;

  return (
    resolveWeztermFromCurrentSession(binaryName, options.currentExecutable) ??
    resolveWeztermBundleFromDir(installedBundleDir, binaryName) ??
    resolveWeztermBundleFromDir(currentPackageBundleDir, binaryName) ??
    systemResolver(binaryName, installedBundleDir) ??
    binaryName.replace(".exe", "")
  );
}

/**
 * Resolve the WezTerm binary path.
 * On Windows: prefer the active WezTerm session, then installed bundle, then current package bundle,
 * then system install.
 * On other platforms: returns "wezterm" (system PATH).
 */
export function resolveWeztermBinary(): string {
  if (process.platform === "win32") {
    return resolveWindowsWeztermBinary("wezterm.exe");
  }
  return "wezterm";
}

/**
 * Resolve the WezTerm GUI binary path (wezterm-gui.exe).
 * Used for `wezterm start` which launches the GUI directly.
 */
export function resolveWeztermGuiBinary(): string {
  if (process.platform === "win32") {
    return resolveWindowsWeztermBinary("wezterm-gui.exe");
  }
  return "wezterm-gui";
}

/**
 * Check if a command binary exists and is callable.
 */
async function commandExists(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;

    try {
      child = spawn(cmd, args, {
        stdio: ["ignore", "ignore", "ignore"],
        shell: false,
        windowsHide: true,
      });
    } catch {
      resolve(false);
      return;
    }

    const timeout = setTimeout(() => {
      child.kill();
      resolve(false);
    }, 5_000);

    child.on("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve(code === 0);
    });
  });
}

/**
 * Detect available terminal multiplexer.
 *
 * Priority:
 * - Windows: active WezTerm/session install -> installed bundle -> current package bundle -> system WezTerm -> tmux
 * - Unix: tmux -> wezterm
 */
export async function detectTerminal(): Promise<DetectedTerminal> {
  const isWindows = process.platform === "win32";

  const weztermCmd = resolveWeztermBinary();
  const candidates: Array<{ name: DetectedTerminal; cmd: string; args: string[] }> = isWindows
    ? [
        { name: "wezterm", cmd: weztermCmd, args: ["--version"] },
        { name: "tmux", cmd: "tmux", args: ["-V"] },
      ]
    : [
        { name: "tmux", cmd: "tmux", args: ["-V"] },
        { name: "wezterm", cmd: weztermCmd, args: ["--version"] },
      ];

  for (const candidate of candidates) {
    if (await commandExists(candidate.cmd, candidate.args)) {
      return candidate.name;
    }
  }

  return null;
}

