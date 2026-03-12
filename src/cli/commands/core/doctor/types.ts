/**
 * Shared types and helpers for the doctor command zones.
 */

import type { Formatters } from "../../../utils/colors";
import type { OhMyClaudeConfig } from "../../../../shared/config";
import { isProviderConfigured } from "../../../../shared/config";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";

export interface DoctorContext {
  detail: boolean;
  fixMem: boolean;
  formatters: Formatters;
  projectRoot: string | null;
}

export type CoworkerRouteStatus = { ok: boolean; message: string };

export function providerHasReachableBaseUrl(config: OhMyClaudeConfig, providerName: string): boolean {
  const provider = config.providers?.[providerName];
  const baseUrl = provider?.base_url?.trim();
  if (!baseUrl) return false;
  try {
    const parsed = new URL(baseUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function evaluateCoworkerRouteStatus(
  config: OhMyClaudeConfig,
  opts: {
    providers: string[];
    configuredMessage: string;
    label: string;
  }
): CoworkerRouteStatus {
  const providerEntries = opts.providers
    .map((name) => ({ name, cfg: config.providers?.[name] }))
    .filter((item) => Boolean(item.cfg));

  if (providerEntries.length === 0) {
    return { ok: false, message: `${opts.label} not configured` };
  }

  for (const entry of providerEntries) {
    if (!isProviderConfigured(config, entry.name)) continue;
    if (providerHasReachableBaseUrl(config, entry.name)) {
      return { ok: true, message: opts.configuredMessage };
    }
  }

  for (const entry of providerEntries) {
    if (isProviderConfigured(config, entry.name) && !providerHasReachableBaseUrl(config, entry.name)) {
      return { ok: false, message: `${opts.label} unreachable` };
    }
  }

  return { ok: false, message: `${opts.label} API key missing` };
}

/**
 * Walk up from cwd to find the project root (git repo or .claude/mem directory).
 */
export function findProjectRoot(): string | null {
  let dir = process.cwd();

  // On MSYS/Git Bash, try resolving via git to get the canonical path
  try {
    const gitRoot = execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      cwd: dir,
    }).trim();
    if (gitRoot && existsSync(gitRoot)) {
      return gitRoot;
    }
  } catch {
    // Not in a git repo or git not available — fall back to manual walk
  }

  while (true) {
    if (existsSync(join(dir, ".git"))) return dir;
    if (existsSync(join(dir, ".claude", "mem"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}
