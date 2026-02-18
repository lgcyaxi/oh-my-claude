import { z } from "zod";

/**
 * Terminal backend type for the Multi-AI Bridge
 */
export const TerminalBackendSchema = z.enum(["tmux", "wezterm", "iterm2", "auto"]).default("auto");

/**
 * Pane layout configuration for the bridge
 */
export const PaneLayoutSchema = z.object({
  /** Layout type: "vertical" or "horizontal" */
  type: z.enum(["vertical", "horizontal"]).default("vertical"),
  /** Ratio of Claude pane to total width/height (0.0-1.0) */
  claudeRatio: z.number().min(0.1).max(0.9).default(0.6),
  /** Auto-arrange panes on startup */
  autoArrange: z.boolean().default(true),
});

/**
 * Daemon configuration for the bridge
 */
export const DaemonConfigSchema = z.object({
  /** Idle timeout in milliseconds before daemon shuts down (0 = never) */
  idleTimeoutMs: z.number().min(0).default(300000), // 5 minutes
  /** Request timeout in milliseconds */
  requestTimeoutMs: z.number().min(1000).default(30000), // 30 seconds
  /** Maximum retry attempts for failed requests */
  maxRetries: z.number().min(0).max(10).default(3),
});

/**
 * Individual AI configuration within the bridge
 */
export const AIConfigSchema = z.object({
  /** Unique identifier for this AI instance */
  id: z.string(),
  /** Display name for the AI */
  name: z.string(),
  /** Provider type (deepseek, zhipu, minimax, kimi, openai, google, copilot, claude) */
  provider: z.string(),
  /** Model name */
  model: z.string(),
  /** Temperature for generation (0.0-2.0) */
  temperature: z.number().min(0).max(2).optional(),
  /** Maximum tokens for generation */
  maxTokens: z.number().optional(),
  /** Whether this AI is enabled */
  enabled: z.boolean().default(true),
  /** Custom system prompt override */
  systemPrompt: z.string().optional(),
  /** Custom instructions for this AI */
  instructions: z.string().optional(),
});

/**
 * Logging configuration for the bridge
 */
export const LoggingConfigSchema = z.object({
  /** Log level: "debug", "info", "warn", "error" */
  level: z.enum(["debug", "info", "warn", "error"]).default("info"),
  /** Enable file logging */
  fileLogging: z.boolean().default(false),
  /** Log file path (relative to config directory) */
  logFilePath: z.string().default("bridge.log"),
  /** Maximum log file size in MB before rotation */
  maxFileSize: z.number().min(1).default(10),
  /** Number of rotated log files to keep */
  maxFiles: z.number().min(1).default(5),
});

/**
 * Integration flags for bridge features
 */
export const IntegrationFlagsSchema = z.object({
  /** Enable Claude Code integration */
  claudeCode: z.boolean().default(true),
  /** Enable memory system integration */
  memory: z.boolean().default(true),
  /** Enable statusline integration */
  statusline: z.boolean().default(true),
  /** Enable hook integration */
  hooks: z.boolean().default(true),
  /** Enable proxy integration for model switching */
  proxy: z.boolean().default(false),
  /** Enable multi-pane terminal layout */
  multiPane: z.boolean().default(true),
  /** Enable auto-context injection from memory */
  autoContext: z.boolean().default(true),
});

/**
 * Main bridge configuration schema
 */
export const MultiBridgeConfigSchema = z.object({
  /** Terminal backend to use */
  terminalBackend: TerminalBackendSchema,
  /** Pane layout configuration */
  paneLayout: PaneLayoutSchema.optional(),
  /** Daemon settings */
  daemon: DaemonConfigSchema.optional(),
  /** Array of AI configurations */
  ais: z.array(AIConfigSchema).default([]),
  /** Logging configuration */
  logging: LoggingConfigSchema.optional(),
  /** Integration flags */
  integrations: IntegrationFlagsSchema.optional(),
  /** Whether the bridge is enabled */
  enabled: z.boolean().default(false),
  /** Bridge version for migration tracking */
  version: z.string().default("1.0.0"),
});

export type TerminalBackend = z.infer<typeof TerminalBackendSchema>;
export type PaneLayout = z.infer<typeof PaneLayoutSchema>;
export type DaemonConfig = z.infer<typeof DaemonConfigSchema>;
export type AIConfig = z.infer<typeof AIConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type IntegrationFlags = z.infer<typeof IntegrationFlagsSchema>;
export type MultiBridgeConfig = z.infer<typeof MultiBridgeConfigSchema>;

/**
 * Default bridge configuration
 */
export const DEFAULT_BRIDGE_CONFIG: MultiBridgeConfig = MultiBridgeConfigSchema.parse({});
