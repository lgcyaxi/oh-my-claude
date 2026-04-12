/**
 * CC command — OMC shortcut expansion and worktree pre-creation
 */

import { execSync } from "node:child_process";
import { join } from "node:path";
import { createFormatters } from "../../utils/colors";

/** OMC single-dash shortcuts → Claude Code args expansion. */
const OMC_SHORTCUTS: Record<string, string[]> = {
  "-r":    ["--resume"],
  "-skip": ["--dangerously-skip-permissions"],
  // -wt is handled specially in expandShortcuts (not a simple mapping)
};

/**
 * Expand OMC single-dash shortcuts in claudeArgs.
 *
 * Also rescues Commander options (-p, -t, --debug) that may have passed
 * through due to `passThroughOptions(true)` ordering — when an unknown OMC
 * shortcut like `-debug` appears before a Commander option like `-p`, Commander
 * stops parsing and passes everything through as operands.
 */
export function expandShortcuts(claudeArgs: string[]): {
  args: string[];
  isRemoteControl: boolean;
  worktreeName: string | null;
  debugMode: boolean;
  provider?: string;
  terminal?: string;
} {
  let isRemoteControl = false;
  let worktreeName: string | null = null;
  let debugMode = false;
  let provider: string | undefined;
  let terminal: string | undefined;
  const expanded: string[] = [];

  for (let i = 0; i < claudeArgs.length; i++) {
    const arg = claudeArgs[i]!;

    if (arg === "-rc" || arg === "-remote") {
      isRemoteControl = true;
      continue;
    }

    if (arg === "-debug" || arg === "--debug") {
      debugMode = true;
      continue;
    }

    // Rescue Commander options that passed through due to ordering
    if (arg === "-p" || arg === "--provider") {
      const next = claudeArgs[i + 1];
      if (next && !next.startsWith("-")) {
        provider = next;
        i++;
      }
      continue;
    }

    if (arg === "-t" || arg === "--terminal") {
      const next = claudeArgs[i + 1];
      if (next && !next.startsWith("-")) {
        terminal = next;
        i++;
      }
      continue;
    }

    // Handle -wt [name] — intercept to pre-create worktree from current branch
    if (arg === "-wt") {
      const next = claudeArgs[i + 1];
      if (next && !next.startsWith("-")) {
        worktreeName = next;
        expanded.push("--worktree", next);
        i++;
      } else {
        worktreeName = "";
        expanded.push("--worktree");
      }
      continue;
    }

    // Also intercept --worktree [name] (native Claude flag used directly)
    if (arg === "--worktree") {
      const next = claudeArgs[i + 1];
      if (next && !next.startsWith("-")) {
        worktreeName = next;
        expanded.push(arg, next);
        i++;
      } else {
        worktreeName = "";
        expanded.push(arg);
      }
      continue;
    }

    const mapped = OMC_SHORTCUTS[arg];
    if (mapped) {
      expanded.push(...mapped);
    } else {
      expanded.push(arg);
    }
  }

  return { args: expanded, isRemoteControl, worktreeName, debugMode, provider, terminal };
}

/**
 * Pre-create a git worktree from the current HEAD (not main).
 *
 * Claude Code's --worktree creates worktrees based on the main branch.
 * When on a different branch (e.g., dev), the user expects the worktree
 * to be based on their current branch. This function pre-creates the
 * worktree directory so Claude Code reuses it instead of creating a new one.
 */
export function preCreateWorktree(name: string): void {
  try {
    const currentBranch = execSync("git branch --show-current", {
      encoding: "utf-8",
      windowsHide: true,
    }).trim();

    if (!currentBranch) return;

    let defaultBranch = "main";
    try {
      const ref = execSync("git symbolic-ref refs/remotes/origin/HEAD", {
        encoding: "utf-8",
        windowsHide: true,
      }).trim();
      defaultBranch = ref.split("/").pop() ?? "main";
    } catch {
      try {
        execSync("git rev-parse --verify main", { encoding: "utf-8", windowsHide: true });
        defaultBranch = "main";
      } catch {
        try {
          execSync("git rev-parse --verify master", { encoding: "utf-8", windowsHide: true });
          defaultBranch = "master";
        } catch {
          return;
        }
      }
    }

    if (currentBranch === defaultBranch) return;

    const { existsSync } = require("node:fs");
    const worktreeDir = join(process.cwd(), ".claude", "worktrees", name);
    if (existsSync(worktreeDir)) return; // Reuse existing worktree

    const branchName = `worktree-${name}`;
    const { c, ok, dimText } = createFormatters();
    console.log(ok(`Creating worktree from ${c.cyan}${currentBranch}${c.reset} (not ${defaultBranch})`));

    execSync(`git worktree add -b "${branchName}" ".claude/worktrees/${name}" HEAD`, {
      encoding: "utf-8",
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });

    console.log(dimText(`  Branch: ${branchName} → .claude/worktrees/${name}`));
  } catch (err: any) {
    const msg = err?.stderr || err?.message || "";
    if (msg.includes("already exists")) {
      try {
        const { existsSync } = require("node:fs");
        const worktreeDir = join(process.cwd(), ".claude", "worktrees", name);
        if (!existsSync(worktreeDir)) {
          execSync(`git worktree add ".claude/worktrees/${name}" HEAD`, {
            encoding: "utf-8",
            windowsHide: true,
            stdio: ["ignore", "ignore", "pipe"],
          });
        }
      } catch {
        // Give up — let Claude Code handle it
      }
    }
  }
}
