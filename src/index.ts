/**
 * oh-my-claude
 *
 * Multi-agent orchestration plugin for Claude Code with multi-provider support
 *
 * Features:
 * - Agent definitions with prompts (Sisyphus, Oracle, Librarian, etc.)
 * - Multi-provider API clients (DeepSeek, ZhiPu, MiniMax, Google, OpenAI)
 * - Background agent MCP server for async task execution
 * - Hook scripts for Claude Code integration
 * - CLI installer for easy setup
 */

// Configuration
export * from "./config";

// Agents
export * from "./agents";

// Providers
export * from "./providers";

// Generators (excluding generateAgentMarkdown which is already exported from agents)
export {
  generateAllAgentFiles,
  generateAgentFile,
  getAgentsDirectory,
  getInstalledAgents,
  removeAgentFiles,
} from "./generators";

// Installer
export * from "./installer";

// Daemon layer
export * from "./daemon";

// Bridge orchestrator (explicit re-export to avoid BridgeConfig conflict with config module)
export type {
  RequestStatus,
  BridgeResponse,
  AIStatus,
  RequestInfo,
  HealthState,
  HealthStatus,
  SystemStatus,
  DaemonFactory,
  BridgeOrchestrator,
} from "./bridge/types";
export { DaemonRegistry, BridgeOrchestratorImpl, getBridgeOrchestrator, resetBridgeOrchestrator } from "./bridge";
