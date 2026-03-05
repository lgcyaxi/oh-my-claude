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
export * from "./shared/config";

// Agents
export * from "./assets/agents";

// Providers
export * from "./shared/providers";

// Generators (excluding generateAgentMarkdown which is already exported from agents)
export {
  generateAllAgentFiles,
  generateAgentFile,
  getAgentsDirectory,
  getInstalledAgents,
  removeAgentFiles,
} from "./integration/generators";

// Installer
export * from "./integration/installer";

// Daemon layer
export * from "./workers/daemon";

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
} from "./workers/bridge/types";
export { DaemonRegistry, BridgeOrchestratorImpl, getBridgeOrchestrator, resetBridgeOrchestrator } from "./workers/bridge";
