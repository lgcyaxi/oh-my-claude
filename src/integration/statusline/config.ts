/**
 * StatusLine configuration loader
 * Config file: ~/.config/oh-my-claude/statusline.json (Unix/macOS)
 *              %USERPROFILE%\.config\oh-my-claude\statusline.json (Windows)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir, platform } from "node:os";
import { z } from "zod";
import type { StatusLineConfig, SegmentId } from "./segments/types";
import { PRESETS, DEFAULT_SEGMENT_POSITIONS, DEFAULT_SEGMENT_ROWS } from "./segments/types";

// Zod schema for segment config
const SegmentConfigSchema = z.object({
  enabled: z.boolean(),
  position: z.number().int().min(1).max(20),
  row: z.number().int().min(1).max(5).default(1),
});

// Zod schema for style config
const StyleConfigSchema = z.object({
  separator: z.string().default(" "),
  brackets: z.boolean().default(true),
  colors: z.boolean().default(true),
});

// Zod schema for full statusline config
export const StatusLineConfigSchema = z.object({
  enabled: z.boolean().default(true),
  preset: z.enum(["minimal", "standard", "full"]).default("standard"),
  segments: z
    .object({
      // Row 1: Session & Identity
      proxy: SegmentConfigSchema.default({ enabled: true, position: 1, row: 1 }),
      session: SegmentConfigSchema.default({ enabled: true, position: 2, row: 1 }),
      model: SegmentConfigSchema.default({ enabled: true, position: 3, row: 1 }),
      mode: SegmentConfigSchema.default({ enabled: true, position: 4, row: 1 }),
      // Row 2: Workspace & Context
      git: SegmentConfigSchema.default({ enabled: true, position: 1, row: 2 }),
      directory: SegmentConfigSchema.default({ enabled: true, position: 2, row: 2 }),
      context: SegmentConfigSchema.default({ enabled: true, position: 3, row: 2 }),
      memory: SegmentConfigSchema.default({ enabled: false, position: 4, row: 2 }),
      preferences: SegmentConfigSchema.default({ enabled: false, position: 5, row: 2 }),
      "output-style": SegmentConfigSchema.default({ enabled: false, position: 6, row: 2 }),
      // Row 3: Infrastructure
      bridge: SegmentConfigSchema.default({ enabled: true, position: 1, row: 3 }),
      codex: SegmentConfigSchema.default({ enabled: false, position: 2, row: 3 }),
      usage: SegmentConfigSchema.default({ enabled: false, position: 3, row: 3 }),
    })
    .default({}),
  style: StyleConfigSchema.default({}),
});

// Config file path
export const CONFIG_DIR = join(homedir(), ".config", "oh-my-claude");
export const CONFIG_PATH = join(CONFIG_DIR, "statusline.json");

/**
 * Get default configuration based on preset
 */
export function getDefaultConfig(preset: StatusLineConfig["preset"] = "standard"): StatusLineConfig {
  const enabledSegments = PRESETS[preset];
  const allSegmentIds: SegmentId[] = [
    "model",
    "git",
    "directory",
    "context",
    "session",
    "output-style",
    "mode",
    "memory",
    "proxy",
    "bridge",
    "usage",
    "preferences",
    "codex",
  ];

  const segments: Record<SegmentId, { enabled: boolean; position: number; row: number }> = {} as any;
  for (const id of allSegmentIds) {
    segments[id] = {
      enabled: enabledSegments.includes(id),
      position: DEFAULT_SEGMENT_POSITIONS[id],
      row: DEFAULT_SEGMENT_ROWS[id],
    };
  }

  return {
    enabled: true,
    preset,
    segments,
    style: {
      separator: " ",
      brackets: true,
      colors: true,
    },
  };
}

/**
 * Load configuration from file
 * Returns default config if file doesn't exist or is invalid
 */
export function loadConfig(): StatusLineConfig {
  try {
    if (!existsSync(CONFIG_PATH)) {
      return getDefaultConfig("standard");
    }

    const content = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(content);

    // Capture which segment keys the file actually contains (before Zod fills defaults)
    const rawSegmentKeys = new Set<string>(
      parsed.segments ? Object.keys(parsed.segments) : []
    );

    // Detect if any existing segment has a `row` field — if none do, this is a pre-row config
    const hasRowField = parsed.segments
      ? Object.values(parsed.segments).some((s: any) => typeof s?.row === "number")
      : false;

    const validated = StatusLineConfigSchema.parse(parsed);

    return applyPresetToConfig(validated as StatusLineConfig, rawSegmentKeys, hasRowField);
  } catch {
    // Return default on any error - graceful degradation
    return getDefaultConfig("standard");
  }
}

/**
 * Apply preset to config - backfill missing segments and migrate row field.
 * This ensures configs created before new segments were added get them automatically.
 * Zod fills missing keys with schema defaults (enabled: false), so we compare against
 * the raw file keys to detect truly missing segments and apply preset-aware defaults.
 *
 * When `hasRowField` is false, the config predates the row redesign — migrate all
 * segments to the new row/position layout while preserving enabled state.
 */
function applyPresetToConfig(config: StatusLineConfig, rawSegmentKeys: Set<string>, hasRowField: boolean): StatusLineConfig {
  const presetSegments = PRESETS[config.preset] ?? PRESETS.standard;
  const allSegmentIds: SegmentId[] = [
    "model", "git", "directory", "context", "session",
    "output-style", "mode", "proxy", "bridge", "memory", "preferences", "usage", "codex",
  ];

  let modified = false;

  if (!hasRowField && rawSegmentKeys.size > 0) {
    // Pre-row config: migrate all segments to new row/position layout, preserve enabled state
    for (const id of allSegmentIds) {
      const wasEnabled = rawSegmentKeys.has(id)
        ? config.segments[id]?.enabled ?? presetSegments.includes(id)
        : presetSegments.includes(id);
      config.segments[id] = {
        enabled: wasEnabled,
        position: DEFAULT_SEGMENT_POSITIONS[id],
        row: DEFAULT_SEGMENT_ROWS[id],
      };
    }
    modified = true;
  } else {
    for (const id of allSegmentIds) {
      if (!rawSegmentKeys.has(id)) {
        config.segments[id] = {
          enabled: presetSegments.includes(id),
          position: DEFAULT_SEGMENT_POSITIONS[id],
          row: DEFAULT_SEGMENT_ROWS[id],
        };
        modified = true;
      }
    }
  }

  if (modified) {
    saveConfig(config);
  }

  return config;
}

/**
 * Ensure config directory exists with proper error handling for Windows
 * Returns true if directory exists or was created successfully
 */
export function ensureConfigDir(): boolean {
  try {
    if (existsSync(CONFIG_DIR)) {
      // Verify it's actually a directory
      const stat = statSync(CONFIG_DIR);
      if (!stat.isDirectory()) {
        console.error(`[statusline] Config path exists but is not a directory: ${CONFIG_DIR}`);
        return false;
      }
      return true;
    }

    // Create directory with recursive option (creates parent dirs too)
    mkdirSync(CONFIG_DIR, { recursive: true });

    // Verify creation was successful
    if (!existsSync(CONFIG_DIR)) {
      console.error(`[statusline] Failed to create config directory: ${CONFIG_DIR}`);
      return false;
    }

    return true;
  } catch (error) {
    // Provide platform-specific error message
    const isWindows = platform() === "win32";
    console.error(
      `[statusline] Failed to create config directory: ${CONFIG_DIR}\n` +
      `Error: ${error}\n` +
      (isWindows
        ? `On Windows, please ensure you have write permissions to: ${homedir()}\\.config\\`
        : `Please ensure you have write permissions to: ~/.config/`)
    );
    return false;
  }
}

/**
 * Save configuration to file
 */
export function saveConfig(config: StatusLineConfig): void {
  try {
    // Ensure directory exists with explicit validation
    if (!ensureConfigDir()) {
      return;
    }

    const content = JSON.stringify(config, null, 2);
    writeFileSync(CONFIG_PATH, content, "utf-8");

    // Verify file was written successfully
    if (!existsSync(CONFIG_PATH)) {
      console.error(`[statusline] Config file was not created at: ${CONFIG_PATH}`);
    }
  } catch (error) {
    console.error(`[statusline] Failed to save config to ${CONFIG_PATH}:`, error);
  }
}

/**
 * Create default config file if it doesn't exist
 * Called during installation
 * Returns true if config exists or was created successfully
 */
export function ensureConfigExists(preset: StatusLineConfig["preset"] = "full"): boolean {
  // First ensure directory exists
  if (!ensureConfigDir()) {
    return false;
  }

  if (!existsSync(CONFIG_PATH)) {
    const config = getDefaultConfig(preset);
    saveConfig(config);

    // Verify config was created
    if (!existsSync(CONFIG_PATH)) {
      console.error(`[statusline] Failed to create default config at: ${CONFIG_PATH}`);
      return false;
    }
  }

  return true;
}

/**
 * Update preset and reconfigure segments accordingly
 */
export function setPreset(preset: StatusLineConfig["preset"]): StatusLineConfig {
  const config = loadConfig();
  const newConfig = getDefaultConfig(preset);

  // Preserve style settings
  newConfig.style = config.style;

  saveConfig(newConfig);
  return newConfig;
}

/**
 * Toggle a specific segment
 */
export function toggleSegment(segmentId: SegmentId, enabled: boolean): StatusLineConfig {
  const config = loadConfig();
  if (config.segments[segmentId]) {
    config.segments[segmentId].enabled = enabled;
  }
  saveConfig(config);
  return config;
}

/**
 * Enable/disable entire statusline
 */
export function setEnabled(enabled: boolean): StatusLineConfig {
  const config = loadConfig();
  config.enabled = enabled;
  saveConfig(config);
  return config;
}
