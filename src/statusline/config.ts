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
import { PRESETS, DEFAULT_SEGMENT_POSITIONS } from "./segments/types";

// Zod schema for segment config
const SegmentConfigSchema = z.object({
  enabled: z.boolean(),
  position: z.number().int().min(1).max(10),
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
      model: SegmentConfigSchema.default({ enabled: true, position: 1 }),
      git: SegmentConfigSchema.default({ enabled: true, position: 2 }),
      directory: SegmentConfigSchema.default({ enabled: true, position: 3 }),
      context: SegmentConfigSchema.default({ enabled: true, position: 4 }),
      session: SegmentConfigSchema.default({ enabled: true, position: 5 }),
      "output-style": SegmentConfigSchema.default({ enabled: false, position: 6 }),
      mcp: SegmentConfigSchema.default({ enabled: true, position: 7 }),
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
    "mcp",
  ];

  const segments: Record<SegmentId, { enabled: boolean; position: number }> = {} as any;
  for (const id of allSegmentIds) {
    segments[id] = {
      enabled: enabledSegments.includes(id),
      position: DEFAULT_SEGMENT_POSITIONS[id],
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
    const validated = StatusLineConfigSchema.parse(parsed);

    // Apply preset overrides if preset is specified but segments aren't fully customized
    return applyPresetToConfig(validated as StatusLineConfig);
  } catch {
    // Return default on any error - graceful degradation
    return getDefaultConfig("standard");
  }
}

/**
 * Apply preset to config - enables segments based on preset
 */
function applyPresetToConfig(config: StatusLineConfig): StatusLineConfig {
  // If user has explicitly set segment enabled states, respect them
  // Otherwise, apply preset defaults
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
