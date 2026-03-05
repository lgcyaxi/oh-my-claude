/**
 * CC command — Bridge worker resolution and auto-spawn helpers
 */

import { execSync } from "node:child_process";
import { DEFAULT_BRIDGE_AI_CONFIGS, getBridgeBaseAIName } from "../../../mcp/bridge/config";
import type { BridgeWorkerDefinition, WorkerRole } from "../../../assets/agents/types";
import { loadConfig, isProviderConfigured } from "../../../shared/config/loader";
import { addAIToStateSafe } from "../../../workers/bridge/state";
import { createFormatters } from "../../utils/colors";

interface ResolveWorkersResult {
  workers: BridgeWorkerDefinition[];
  skipped: Array<{ name: string; role: WorkerRole; reason: string }>;
}

const resolveWorkerMetadata = (
  workerName: string
): Pick<BridgeWorkerDefinition, "role" | "taskCategories"> => {
  const config =
    DEFAULT_BRIDGE_AI_CONFIGS[workerName] ??
    (workerName === "cc:glm" ? DEFAULT_BRIDGE_AI_CONFIGS["cc:zp"] : undefined) ??
    (workerName === "cc:mm" ? DEFAULT_BRIDGE_AI_CONFIGS["cc:mm-cn"] : undefined);

  return {
    role: config?.role ?? "general",
    taskCategories: [...(config?.taskCategories ?? [])],
  };
};

const hasReachableBaseUrl = (config: ReturnType<typeof loadConfig>, providerName: string): boolean => {
  const provider = config.providers?.[providerName];
  const baseUrl = provider?.base_url?.trim();
  if (!baseUrl) return false;
  try {
    const parsed = new URL(baseUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

export function resolveBridgeWorkers(): ResolveWorkersResult {
  const workers: BridgeWorkerDefinition[] = [];
  const skipped: Array<{ name: string; role: WorkerRole; reason: string }> = [];

  const addSkipped = (name: string, reason: "provider not configured" | "API key missing" | "provider unreachable"): void => {
    const metadata = resolveWorkerMetadata(name);
    skipped.push({ name, role: metadata.role, reason });
  };

  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig();
  } catch {
    // Config unreadable — fall back to env var detection
    if (process.env.KIMI_API_KEY) {
      workers.push({ name: "cc:kimi", switchAlias: "kimi", label: "Kimi K2.5 (code)", ...resolveWorkerMetadata("cc:kimi") });
    }
    if (process.env.MINIMAX_API_KEY) {
      workers.push({ name: "cc:mm", switchAlias: "mm", label: "MiniMax-M2.5 (docs)", ...resolveWorkerMetadata("cc:mm") });
    } else if (process.env.MINIMAX_CN_API_KEY) {
      workers.push({ name: "cc:mm", switchAlias: "mm-cn", label: "MiniMax-M2.5 CN (docs)", ...resolveWorkerMetadata("cc:mm") });
    }
    if (process.env.ZAI_API_KEY) {
      workers.push({ name: "cc:glm", switchAlias: "zai", label: "GLM-5 via Z.AI (research)", ...resolveWorkerMetadata("cc:glm") });
    } else if (process.env.ZHIPU_API_KEY) {
      workers.push({ name: "cc:glm", switchAlias: "zp", label: "GLM-5 (research)", ...resolveWorkerMetadata("cc:glm") });
    }
    if (!process.env.KIMI_API_KEY) addSkipped("cc:kimi", "API key missing");
    if (!process.env.MINIMAX_API_KEY && !process.env.MINIMAX_CN_API_KEY) addSkipped("cc:mm", "API key missing");
    if (!process.env.ZAI_API_KEY && !process.env.ZHIPU_API_KEY) addSkipped("cc:glm", "API key missing");
    return { workers, skipped };
  }

  // Kimi — code implementation
  if (!config.providers?.kimi) {
    addSkipped("cc:kimi", "provider not configured");
  } else if (!isProviderConfigured(config, "kimi")) {
    addSkipped("cc:kimi", "API key missing");
  } else if (!hasReachableBaseUrl(config, "kimi")) {
    addSkipped("cc:kimi", "provider unreachable");
  } else {
    workers.push({ name: "cc:kimi", switchAlias: "kimi", label: "Kimi K2.5 (code)", ...resolveWorkerMetadata("cc:kimi") });
  }

  // MiniMax — documentation (prefer global, fallback to CN)
  if (!config.providers?.minimax && !config.providers?.["minimax-cn"]) {
    addSkipped("cc:mm", "provider not configured");
  } else if (isProviderConfigured(config, "minimax") && hasReachableBaseUrl(config, "minimax")) {
    workers.push({ name: "cc:mm", switchAlias: "mm", label: "MiniMax-M2.5 (docs)", ...resolveWorkerMetadata("cc:mm") });
  } else if (isProviderConfigured(config, "minimax-cn") && hasReachableBaseUrl(config, "minimax-cn")) {
    workers.push({ name: "cc:mm", switchAlias: "mm-cn", label: "MiniMax-M2.5 CN (docs)", ...resolveWorkerMetadata("cc:mm") });
  } else if (isProviderConfigured(config, "minimax") || isProviderConfigured(config, "minimax-cn")) {
    addSkipped("cc:mm", "provider unreachable");
  } else {
    addSkipped("cc:mm", "API key missing");
  }

  // ZhiPu/GLM — research (prefer Z.AI global, fallback to ZhiPu China)
  if (!config.providers?.["zhipu-global"] && !config.providers?.zhipu) {
    addSkipped("cc:glm", "provider not configured");
  } else if (isProviderConfigured(config, "zhipu-global") && hasReachableBaseUrl(config, "zhipu-global")) {
    workers.push({ name: "cc:glm", switchAlias: "zai", label: "GLM-5 via Z.AI (research)", ...resolveWorkerMetadata("cc:glm") });
  } else if (isProviderConfigured(config, "zhipu") && hasReachableBaseUrl(config, "zhipu")) {
    workers.push({ name: "cc:glm", switchAlias: "zp", label: "GLM-5 (research)", ...resolveWorkerMetadata("cc:glm") });
  } else if (isProviderConfigured(config, "zhipu-global") || isProviderConfigured(config, "zhipu")) {
    addSkipped("cc:glm", "provider unreachable");
  } else {
    addSkipped("cc:glm", "API key missing");
  }

  return { workers, skipped };
}

export function resolveWorkerForTask(
  taskDescription: string,
  workers: BridgeWorkerDefinition[]
): string | undefined {
  const lower = taskDescription.toLowerCase();
  for (const worker of workers) {
    if (worker.taskCategories.some((cat) => lower.includes(cat))) {
      return worker.name;
    }
  }
  return undefined;
}

/**
 * Auto-spawn bridge workers when -bridge flag is used.
 * Spawns tmux panes for each configured worker and registers them in bridge state.
 * This is fire-and-forget — does not block the main CC launch.
 */
export async function spawnBridgeWorkers(options: {
  sessionId: string;
  projectPath: string;
  terminalBackend: "tmux" | "wezterm";
  mainPaneId?: string;
  busPort?: number;
}): Promise<void> {
  const { sessionId, projectPath, terminalBackend, mainPaneId, busPort = 18912 } = options;
  const { c, ok, dimText, fail } = createFormatters();

  const { workers, skipped } = resolveBridgeWorkers();

  if (workers.length === 0 && skipped.length === 0) {
    console.log(dimText("  No bridge workers configured."));
    return;
  }

  const spawned: string[] = [];
  const spawnFailed: Array<{ name: string; reason: string }> = [];

  for (const worker of workers) {
    try {
      // Build the worker launch command
      const bridgeEnv = `OMC_BRIDGE_PANE=1 OMC_BRIDGE_WORKER_ID=${worker.name} OMC_BUS_PORT=${busPort} OMC_SESSION_ID=${sessionId}`;
      const launchCmd = `${bridgeEnv} oh-my-claude cc -p ${worker.switchAlias} -t none -skip`;

      let paneId: string;

      if (terminalBackend === "tmux") {
        if (mainPaneId) {
          // Split right from the main CC pane
          const raw = execSync(
            `tmux split-window -h -t ${mainPaneId} -p 30 -P -F '#D' 'cd "${projectPath}" && ${launchCmd}'`,
            { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
          ).trim();
          paneId = raw;
        } else {
          // Fallback: create pane in dedicated bridge session
          const bridgeSession = "oh-my-claude-bridge";
          try {
            execSync(`tmux has-session -t ${bridgeSession}`, { stdio: "pipe" });
          } catch {
            execSync(`tmux new-session -d -s ${bridgeSession} -n bridge`, { stdio: "pipe" });
          }
          const raw = execSync(
            `tmux split-window -t ${bridgeSession} -h -P -F '#D' 'cd "${projectPath}" && ${launchCmd}'`,
            { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
          ).trim();
          paneId = raw;
        }
      } else {
        // wezterm
        const raw = execSync(
          `wezterm cli split-pane --right -- bash -c 'cd "${projectPath}" && ${launchCmd}'`,
          { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
        ).trim();
        paneId = raw;
      }

      // Register in bridge state
      const lockResult = await addAIToStateSafe({
        name: worker.name,
        cliCommand: launchCmd,
        startedAt: new Date().toISOString(),
        paneId,
        terminalBackend,
        projectPath,
      });

      if (!lockResult.added) {
        // Race detected — kill the spawned pane
        try {
          if (terminalBackend === "tmux") {
            execSync(`tmux kill-pane -t ${paneId}`, { stdio: "pipe" });
          }
        } catch { /* best-effort cleanup */ }
        spawnFailed.push({ name: worker.name, reason: lockResult.error ?? "already running" });
      } else {
        spawned.push(`${worker.name} (${worker.role})`);
        console.log(dimText(`  Spawned: ${c.cyan}${worker.name}${c.reset} [${worker.switchAlias}]`));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      spawnFailed.push({ name: worker.name, reason: msg });
    }
  }

  // Print summary
  const parts: string[] = [];
  if (spawned.length > 0) {
    parts.push(`${c.green}${spawned.length} spawned${c.reset}`);
  }
  if (skipped.length > 0) {
    parts.push(`${c.yellow}${skipped.length} skipped${c.reset}`);
  }
  if (spawnFailed.length > 0) {
    parts.push(`${c.red}${spawnFailed.length} failed${c.reset}`);
  }

  console.log(ok(`Bridge workers: ${parts.join(", ")}`));

  // Print details for skipped/failed
  if (skipped.length > 0) {
    for (const s of skipped) {
      console.log(dimText(`  Skipped: ${s.name} — ${s.reason}`));
    }
  }
  if (spawnFailed.length > 0) {
    for (const f of spawnFailed) {
      console.log(dimText(`  Failed: ${f.name} — ${f.reason}`));
    }
  }
}
