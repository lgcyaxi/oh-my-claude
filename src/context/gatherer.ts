/**
 * Context Gatherer
 *
 * Functions to collect actual context data from the project
 * based on detected context types.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
  ContextType,
  ContextItem,
  GatheredContext,
  ContextProfile,
} from "./types";

const TOKEN_ESTIMATE_CHARS = 4; // ~4 chars per token

function estimateTokens(content: string): number {
  return Math.ceil(content.length / TOKEN_ESTIMATE_CHARS);
}

export async function gatherContext(
  workingDir: string,
  contextTypes: ContextType[],
  profile: ContextProfile,
  filePatterns?: string[]
): Promise<GatheredContext> {
  const items: ContextItem[] = [];
  let totalTokens = 0;
  let truncated = false;

  // Gather each context type in priority order
  for (const type of profile.priorities) {
    if (!contextTypes.includes(type)) continue;
    if (totalTokens >= profile.maxTokens) {
      truncated = true;
      break;
    }

    const remaining = profile.maxTokens - totalTokens;
    const item = await gatherContextType(
      workingDir,
      type,
      remaining,
      filePatterns
    );

    if (item) {
      items.push(item);
      totalTokens += item.tokenEstimate;
    }
  }

  return { items, totalTokens, truncated };
}

async function gatherContextType(
  workingDir: string,
  type: ContextType,
  maxTokens: number,
  filePatterns?: string[]
): Promise<ContextItem | null> {
  try {
    switch (type) {
      case "project-structure":
        return gatherProjectStructure(workingDir, maxTokens);
      case "package-info":
        return gatherPackageInfo(workingDir, maxTokens);
      case "git-status":
        return gatherGitStatus(workingDir, maxTokens);
      case "related-files":
        return gatherRelatedFiles(workingDir, maxTokens, filePatterns);
      case "config-files":
        return gatherConfigFiles(workingDir, maxTokens);
      case "test-patterns":
        return gatherTestPatterns(workingDir, maxTokens);
      case "readme":
        return gatherReadme(workingDir, maxTokens);
      case "recent-changes":
        return gatherRecentChanges(workingDir, maxTokens);
      default:
        return null;
    }
  } catch {
    return null; // Silently skip failed context gathering
  }
}

function truncateToTokens(content: string, maxTokens: number): string {
  const maxChars = maxTokens * TOKEN_ESTIMATE_CHARS;
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars) + "\n... (truncated)";
}

function gatherProjectStructure(dir: string, maxTokens: number): ContextItem {
  const tree = buildTree(dir, 3, [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".sisyphus",
  ]);
  const content = truncateToTokens(tree, maxTokens);
  return {
    type: "project-structure",
    content: `## Project Structure\n\`\`\`\n${content}\n\`\`\``,
    source: dir,
    tokenEstimate: estimateTokens(content),
  };
}

function gatherPackageInfo(dir: string, maxTokens: number): ContextItem | null {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return null;

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const relevant = {
    name: pkg.name,
    version: pkg.version,
    dependencies: pkg.dependencies,
    devDependencies: pkg.devDependencies,
    scripts: pkg.scripts,
  };
  const content = JSON.stringify(relevant, null, 2);
  return {
    type: "package-info",
    content: `## Package Info\n\`\`\`json\n${truncateToTokens(content, maxTokens)}\n\`\`\``,
    source: pkgPath,
    tokenEstimate: estimateTokens(content),
  };
}

function gatherGitStatus(dir: string, maxTokens: number): ContextItem | null {
  try {
    const branch = execSync("git branch --show-current", {
      cwd: dir,
      encoding: "utf-8",
    }).trim();
    const status = execSync("git status --short", {
      cwd: dir,
      encoding: "utf-8",
    });
    const content = `Branch: ${branch}\n${status}`;
    return {
      type: "git-status",
      content: `## Git Status\n\`\`\`\n${truncateToTokens(content, maxTokens)}\n\`\`\``,
      source: "git",
      tokenEstimate: estimateTokens(content),
    };
  } catch {
    return null;
  }
}

function gatherReadme(dir: string, maxTokens: number): ContextItem | null {
  const readmePath = join(dir, "README.md");
  if (!existsSync(readmePath)) return null;

  const content = readFileSync(readmePath, "utf-8");
  return {
    type: "readme",
    content: `## README\n${truncateToTokens(content, maxTokens)}`,
    source: readmePath,
    tokenEstimate: estimateTokens(content),
  };
}

function gatherRecentChanges(
  dir: string,
  maxTokens: number
): ContextItem | null {
  try {
    const log = execSync("git log --oneline -n 10", {
      cwd: dir,
      encoding: "utf-8",
    });
    return {
      type: "recent-changes",
      content: `## Recent Commits\n\`\`\`\n${truncateToTokens(log, maxTokens)}\n\`\`\``,
      source: "git log",
      tokenEstimate: estimateTokens(log),
    };
  } catch {
    return null;
  }
}

function gatherConfigFiles(dir: string, maxTokens: number): ContextItem | null {
  const configFiles = [
    "tsconfig.json",
    ".eslintrc.json",
    "vite.config.ts",
    "bunfig.toml",
  ];
  const found: string[] = [];

  for (const file of configFiles) {
    const filePath = join(dir, file);
    if (existsSync(filePath)) {
      found.push(`${file}: exists`);
    }
  }

  if (found.length === 0) return null;

  const content = found.join("\n");
  return {
    type: "config-files",
    content: `## Config Files\n\`\`\`\n${content}\n\`\`\``,
    source: dir,
    tokenEstimate: estimateTokens(content),
  };
}

function gatherTestPatterns(dir: string, maxTokens: number): ContextItem | null {
  const testDirs = ["test", "tests", "__tests__", "spec"];
  const found: string[] = [];

  for (const testDir of testDirs) {
    const testPath = join(dir, testDir);
    if (existsSync(testPath) && statSync(testPath).isDirectory()) {
      found.push(`/${testDir}/`);
    }
  }

  if (found.length === 0) return null;

  const content = `Test directories: ${found.join(", ")}`;
  return {
    type: "test-patterns",
    content: `## Test Structure\n${content}`,
    source: dir,
    tokenEstimate: estimateTokens(content),
  };
}

function gatherRelatedFiles(
  dir: string,
  maxTokens: number,
  patterns?: string[]
): ContextItem | null {
  if (!patterns || patterns.length === 0) return null;

  const content = `File patterns requested: ${patterns.join(", ")}`;
  return {
    type: "related-files",
    content: `## Related Files\n${content}`,
    source: dir,
    tokenEstimate: estimateTokens(content),
  };
}

function buildTree(
  dir: string,
  depth: number,
  ignore: string[],
  prefix = ""
): string {
  if (depth === 0) return "";

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true })
      .filter((e) => !ignore.includes(e.name) && !e.name.startsWith("."))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });
  } catch {
    return "";
  }

  let result = "";
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;

    const isLast = i === entries.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    result += `${prefix}${connector}${entry.name}\n`;

    if (entry.isDirectory()) {
      result += buildTree(
        join(dir, entry.name),
        depth - 1,
        ignore,
        prefix + childPrefix
      );
    }
  }

  return result;
}
