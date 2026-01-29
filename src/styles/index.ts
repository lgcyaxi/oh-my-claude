/**
 * Output Style Manager
 *
 * Manages built-in and custom output styles for Claude Code.
 * Styles are markdown files with YAML frontmatter stored in:
 * - Built-in: src/styles/*.md (copied to ~/.claude/oh-my-claude/styles/ on install)
 * - Custom: ~/.claude/output-styles/ (Claude Code's native styles directory)
 *
 * The active style is set in ~/.claude/settings.json → outputStyle field.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";

export interface StyleInfo {
  name: string;
  description: string;
  source: "built-in" | "custom";
  path: string;
}

export interface StyleContent extends StyleInfo {
  body: string;
}

/**
 * Get the Claude Code output styles directory
 */
export function getOutputStylesDir(): string {
  return join(homedir(), ".claude", "output-styles");
}

/**
 * Get the oh-my-claude built-in styles install directory
 */
export function getBuiltInStylesDir(): string {
  return join(homedir(), ".claude", "oh-my-claude", "styles");
}

/**
 * Get the Claude Code settings.json path
 */
function getSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

/**
 * Parse YAML frontmatter from a markdown file
 */
function parseFrontmatter(content: string): { name: string; description: string; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { name: "", description: "", body: content };
  }

  const frontmatter = match[1] ?? "";
  const body = (match[2] ?? "").trim();

  // Simple YAML parsing for name and description
  let name = "";
  let description = "";

  for (const line of frontmatter.split("\n")) {
    const nameMatch = line.match(/^name:\s*(.+)$/);
    if (nameMatch?.[1]) name = nameMatch[1].trim();

    const descMatch = line.match(/^description:\s*(.+)$/);
    if (descMatch?.[1]) description = descMatch[1].trim();
  }

  return { name, description, body };
}

/**
 * List all available output styles (built-in + custom)
 */
export function listStyles(): StyleInfo[] {
  const styles: StyleInfo[] = [];
  const seen = new Set<string>();

  // 1. Scan Claude Code's output-styles directory (custom styles take priority)
  const outputStylesDir = getOutputStylesDir();
  if (existsSync(outputStylesDir)) {
    const files = readdirSync(outputStylesDir).filter(f => f.endsWith(".md"));
    for (const file of files) {
      const filePath = join(outputStylesDir, file);
      try {
        const content = readFileSync(filePath, "utf-8");
        const { name, description } = parseFrontmatter(content);
        const styleName = name || file.replace(".md", "");

        // Check if this is a built-in style deployed there
        const builtInPath = join(getBuiltInStylesDir(), file);
        const isBuiltIn = existsSync(builtInPath);

        styles.push({
          name: styleName,
          description,
          source: isBuiltIn ? "built-in" : "custom",
          path: filePath,
        });
        seen.add(styleName);
      } catch {
        // Skip unreadable files
      }
    }
  }

  // 2. Scan built-in styles directory (only add if not already seen from output-styles)
  const builtInDir = getBuiltInStylesDir();
  if (existsSync(builtInDir)) {
    const files = readdirSync(builtInDir).filter(f => f.endsWith(".md"));
    for (const file of files) {
      const filePath = join(builtInDir, file);
      try {
        const content = readFileSync(filePath, "utf-8");
        const { name, description } = parseFrontmatter(content);
        const styleName = name || file.replace(".md", "");

        if (!seen.has(styleName)) {
          styles.push({
            name: styleName,
            description,
            source: "built-in",
            path: filePath,
          });
          seen.add(styleName);
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  // Sort: built-in first, then alphabetically
  styles.sort((a, b) => {
    if (a.source !== b.source) return a.source === "built-in" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return styles;
}

/**
 * Get a specific style by name
 */
export function getStyle(name: string): StyleContent | null {
  const styles = listStyles();
  const style = styles.find(s => s.name === name);
  if (!style) return null;

  try {
    const content = readFileSync(style.path, "utf-8");
    const { body } = parseFrontmatter(content);
    return { ...style, body };
  } catch {
    return null;
  }
}

/**
 * Get the currently active output style name
 */
export function getActiveStyle(): string | null {
  const settingsPath = getSettingsPath();
  if (!existsSync(settingsPath)) return null;

  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    return settings.outputStyle || null;
  } catch {
    return null;
  }
}

/**
 * Set the active output style
 *
 * 1. Copies the style .md file to ~/.claude/output-styles/ if not already there
 * 2. Sets the outputStyle field in ~/.claude/settings.json
 */
export function setActiveStyle(name: string): { success: boolean; error?: string } {
  // Find the style
  const style = getStyle(name);
  if (!style) {
    return { success: false, error: `Style "${name}" not found. Run 'oh-my-claude style list' to see available styles.` };
  }

  // Ensure the output-styles directory exists
  const outputStylesDir = getOutputStylesDir();
  if (!existsSync(outputStylesDir)) {
    mkdirSync(outputStylesDir, { recursive: true });
  }

  // Copy the style file to Claude Code's output-styles directory if not already there
  const targetPath = join(outputStylesDir, `${name}.md`);
  if (!existsSync(targetPath)) {
    copyFileSync(style.path, targetPath);
  }

  // Update settings.json
  const settingsPath = getSettingsPath();
  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    } catch {
      return { success: false, error: "Failed to parse ~/.claude/settings.json" };
    }
  }

  settings.outputStyle = name;

  try {
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
    return { success: true };
  } catch (error) {
    return { success: false, error: `Failed to write settings: ${error}` };
  }
}

/**
 * Reset to Claude Code default (remove outputStyle from settings)
 */
export function resetStyle(): { success: boolean; error?: string } {
  const settingsPath = getSettingsPath();
  if (!existsSync(settingsPath)) {
    return { success: true }; // Nothing to reset
  }

  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    delete settings.outputStyle;
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
    return { success: true };
  } catch (error) {
    return { success: false, error: `Failed to update settings: ${error}` };
  }
}

/**
 * Create a new custom style from a template
 */
export function createStyle(name: string): { success: boolean; path?: string; error?: string } {
  // Validate name
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name) || name.length < 2) {
    return { success: false, error: "Style name must be lowercase alphanumeric with hyphens (e.g., 'my-style')" };
  }

  // Check if already exists
  const outputStylesDir = getOutputStylesDir();
  const targetPath = join(outputStylesDir, `${name}.md`);
  if (existsSync(targetPath)) {
    return { success: false, error: `Style "${name}" already exists at ${targetPath}` };
  }

  // Ensure directory exists
  if (!existsSync(outputStylesDir)) {
    mkdirSync(outputStylesDir, { recursive: true });
  }

  // Write template
  const template = `---
name: ${name}
description: Custom output style - edit this description
---

# ${name.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")} Output Style

## Overview

Describe your output style here.

## Core Behavior

### 1. Response Format

- Define how responses should be structured
- Specify tone, length, and focus areas

### 2. Code Style

- Define coding conventions for this style
- Specify comment language and verbosity

## Response Characteristics

- **Tone:** [professional / casual / educational / etc.]
- **Length:** [brief / moderate / detailed]
- **Focus:** [code quality / speed / learning / etc.]
- **Code comments:** Match existing codebase language (auto-detect)
`;

  try {
    writeFileSync(targetPath, template, "utf-8");
    return { success: true, path: targetPath };
  } catch (error) {
    return { success: false, error: `Failed to create style: ${error}` };
  }
}

/**
 * Deploy built-in styles to the oh-my-claude styles directory
 * Called during installation
 */
export function deployBuiltInStyles(sourceDir: string): { deployed: string[]; skipped: string[] } {
  const result = { deployed: [] as string[], skipped: [] as string[] };

  const stylesSourceDir = join(sourceDir, "src", "styles");
  if (!existsSync(stylesSourceDir)) {
    return result;
  }

  // Deploy to oh-my-claude's built-in styles dir
  const builtInDir = getBuiltInStylesDir();
  if (!existsSync(builtInDir)) {
    mkdirSync(builtInDir, { recursive: true });
  }

  // Also deploy to Claude Code's output-styles dir
  const outputStylesDir = getOutputStylesDir();
  if (!existsSync(outputStylesDir)) {
    mkdirSync(outputStylesDir, { recursive: true });
  }

  const files = readdirSync(stylesSourceDir).filter(f => f.endsWith(".md"));
  for (const file of files) {
    const srcPath = join(stylesSourceDir, file);
    const builtInPath = join(builtInDir, file);
    const outputPath = join(outputStylesDir, file);

    try {
      // Always update built-in copy
      copyFileSync(srcPath, builtInPath);

      // Only copy to output-styles if not already there (don't overwrite user edits)
      if (!existsSync(outputPath)) {
        copyFileSync(srcPath, outputPath);
      }

      result.deployed.push(file.replace(".md", ""));
    } catch {
      result.skipped.push(file.replace(".md", ""));
    }
  }

  return result;
}
