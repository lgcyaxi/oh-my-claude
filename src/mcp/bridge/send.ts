import type { ToolContext, CallToolResult } from "../shared/types";
import { createBridgeAIConfig, detectBridgeTerminalBackend } from "./config";
import { BUS_DEFAULT_PORT } from "../../workers/bridge/bus/types";
import { isBusRunning } from "../../workers/bridge/bus/lifecycle";

export async function handleBridgeSend(
  args: Record<string, unknown>,
  ctx: ToolContext,
  cachedProjectRoot: string | undefined
): Promise<CallToolResult> {
  const { ai_name, message: rawBridgeMessage, task_spec, wait_for_response, timeout_ms, auto_close } = args as {
    ai_name: string;
    message: string;
    task_spec?: { scope?: string; expected_output?: string; completion_criteria?: string };
    wait_for_response?: boolean;
    timeout_ms?: number;
    auto_close?: boolean;
  };

  if (!ai_name || !rawBridgeMessage) {
    return {
      content: [{ type: "text", text: "Error: ai_name and message are required" }],
      isError: true,
    };
  }

  // Prepend structured task spec header when provided
  let bridgeMessage = rawBridgeMessage;
  if (task_spec && (task_spec.scope || task_spec.expected_output || task_spec.completion_criteria)) {
    const lines = ["[TASK SPEC]"];
    if (task_spec.scope) lines.push(`Scope: ${task_spec.scope}`);
    if (task_spec.expected_output) lines.push(`Expected output: ${task_spec.expected_output}`);
    if (task_spec.completion_criteria) lines.push(`Done when: ${task_spec.completion_criteria}`);
    lines.push("---", rawBridgeMessage);
    bridgeMessage = lines.join("\n");
  }

  // ── Bus routing disabled ─────────────────────────────────────────────────
  // The bus path requires workers to be already running and polling via hooks.
  // But workers are lazy-spawned, so they don't exist until bridge_send triggers spawn.
  // For all worker types, we use the legacy path which:
  // 1. Auto-spawns workers via orchestrator.registerAI()
  // 2. For pane-based (cc:*): injects text directly
  // 3. For proc-based (codex): delegates via orchestrator.delegate()
  const baseAIType = ai_name.includes(":") ? ai_name.slice(0, ai_name.indexOf(":")) : ai_name;
  const isPaneBased = baseAIType === "cc" || baseAIType === "opencode";
  const busPort = parseInt(process.env.OMC_BUS_PORT ?? String(BUS_DEFAULT_PORT), 10);
  try {
    // Bus path disabled — always use legacy path for reliable spawn + delivery
    const busRunning = false;
    if (busRunning) {
      // Convert bridge_send args to a bus mandate
      const mandate = {
        role: task_spec?.scope ? "code" : "general",
        scope: task_spec?.scope ?? "unspecified",
        goal: bridgeMessage,
        acceptance: task_spec?.completion_criteria ?? "Task completed successfully",
        context: task_spec?.expected_output,
      };

      // POST /tasks to bus (session-scoped for multi-session isolation)
      const sessionId = ctx.getSessionId?.();
      const taskResp = await fetch(`http://localhost:${busPort}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ worker: ai_name, mandate, session: sessionId }),
        signal: AbortSignal.timeout(10_000),
      });

      if (taskResp.ok) {
        const taskData = (await taskResp.json()) as { taskId: string };
        const shouldWait = wait_for_response !== false;

        if (!shouldWait) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                sent: true,
                ai_name,
                via: "bus",
                taskId: taskData.taskId,
                waited: false,
              }),
            }],
          };
        }

        // Wait for completion via bus
        const waitTimeout = Math.min(timeout_ms ?? 120_000, 300_000);
        const waitResp = await fetch(
          `http://localhost:${busPort}/wait?tasks=${taskData.taskId}&mode=all&wait=true&timeout=${waitTimeout}`,
          { signal: AbortSignal.timeout(waitTimeout + 5000) },
        );

        if (waitResp.ok) {
          const waitData = (await waitResp.json()) as {
            done: boolean;
            tasks: Array<{ taskId: string; status: string; result?: { message: string } }>;
          };

          const task = waitData.tasks?.[0];
          const response = task?.result?.message ?? null;

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                sent: true,
                ai_name,
                via: "bus",
                taskId: taskData.taskId,
                waited: true,
                done: waitData.done,
                response,
                status: task?.status,
              }),
            }],
          };
        }
      }
      // If bus POST/wait failed, fall through to pane path
    }
  } catch {
    // Bus not available — fall through to legacy pane path
  }

  // ── Legacy pane-based path ─────────────────────────────────────────────
  // Dynamically import bridge modules (avoids loading them for non-bridge usage)
  const { readBridgeState, addAIToState } = await import("../../workers/bridge/state");
  let state = readBridgeState();
  let entry = state.ais.find((a) => a.name === ai_name);

  // Auto-spawn if not running or missing pane ID — bridge_send is fully self-contained
  if (!entry || !entry.paneId) {
    try {
      const { getBridgeOrchestrator } = await import("../../workers/bridge");
      const aiConfig = createBridgeAIConfig(ai_name);
      const terminalBackend = detectBridgeTerminalBackend();

      // For WezTerm: split right from current pane if WEZTERM_PANE is known
      // Skip split options if running headless/MCP context without a pane env var
      if (terminalBackend === "wezterm" && process.env.WEZTERM_PANE) {
        aiConfig.paneCreateOptions = {
          split: "h",
          targetPane: process.env.WEZTERM_PANE,
          splitPercent: 50,
          cwd: process.cwd(),
        };
      }

      // For tmux: split right from the current pane so the worker is visible in the same window.
      // Don't rely on process.env.TMUX — MCP server may not inherit it from Claude Code.
      // Instead, probe tmux directly via display-message which works as long as the server runs.
      if (terminalBackend === "tmux") {
        try {
          const { spawnSync } = await import("node:child_process");
          const result = spawnSync("tmux", ["display-message", "-p", "#D"], {
            encoding: "utf-8",
            timeout: 3000,
          });
          const currentPane = result.stdout?.trim();
          if (result.status === 0 && currentPane && currentPane.startsWith("%")) {
            aiConfig.paneCreateOptions = {
              split: "h",
              targetPane: currentPane,
              splitPercent: 50,
              cwd: cachedProjectRoot ?? process.cwd(),
            };
          }
        } catch {
          // headless/no-tmux — fall back to new-window behavior
        }
      }

      const orchestrator = getBridgeOrchestrator();

      // Inject session ID into process env so CCDaemon.buildStartupCommand() can pass it
      // to the worker process. The MCP server doesn't inherit OMC_SESSION_ID from Claude Code.
      const ctxSessionId = ctx.getSessionId?.();
      if (ctxSessionId && !process.env.OMC_SESSION_ID) {
        process.env.OMC_SESSION_ID = ctxSessionId;
      }

      // Guard: skip registerAI if the daemon is already in the in-memory orchestrator.
      // This handles two failure modes:
      //   1. bridge_send called rapidly twice — second call hits "already registered"
      //   2. MCP server restarted but bridge-state.json still has the entry (stale state)
      //      — in this case listAIs() is empty, so we DO register (correct behaviour)
      const isAlreadyRegistered = orchestrator.listAIs().some((ai) => ai.name === ai_name);
      if (!isAlreadyRegistered) {
        const daemon = await orchestrator.registerAI(aiConfig);
        const paneId = daemon.getPaneId?.() ?? undefined;
        const projectPath = daemon.getProjectPath?.() ?? process.cwd();

        addAIToState({
          name: ai_name,
          cliCommand: aiConfig.cliCommand,
          startedAt: new Date().toISOString(),
          paneId,
          terminalBackend,
          projectPath,
        });

        // Proc-based daemons (no paneId) resolve start() when fully initialized — no delay needed.
        // Terminal-pane daemons need a short warm-up delay.
        if (paneId) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }

      // Re-read state after spawn (or after guard confirmed already running)
      state = readBridgeState();
      entry = state.ais.find((a) => a.name === ai_name);
    } catch (spawnError) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "Worker spawn failed",
            worker: ai_name,
            details: spawnError instanceof Error ? spawnError.message : String(spawnError),
            suggestion: "Try an alternative worker or check provider configuration",
            fallback: "Use bridge_send with a different worker name",
          }),
        }],
        isError: true,
      };
    }
  }

  // Proc-based path: daemon has no pane (e.g. CodexAppServerDaemon).
  // Delegate via the orchestrator and poll for completion.
  if (!entry?.paneId) {
    try {
      const { getBridgeOrchestrator } = await import("../../workers/bridge");
      const orchestrator = getBridgeOrchestrator();
      const timeoutMs = timeout_ms ?? 120_000;
      const requestId = await orchestrator.delegate(ai_name, { message: bridgeMessage });

      // Poll until completed or timeout
      const pollIntervalMs = 500;
      const deadline = Date.now() + timeoutMs;
      let response: import("../../workers/bridge/types").BridgeResponse | null = null;

      while (Date.now() < deadline) {
        const status = orchestrator.checkStatus(requestId);
        if (status === "completed") {
          response = await orchestrator.getResponse(requestId);
          break;
        }
        if (status === "error") {
          break;
        }
        await new Promise((r) => setTimeout(r, pollIntervalMs));
      }

      if (response) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              sent: true,
              ai_name,
              waited: true,
              response: response.content,
            }),
          }],
        };
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            sent: true,
            ai_name,
            waited: true,
            response: null,
            message: `Proc-based bridge: no response within ${Math.round(timeoutMs / 1000)}s`,
          }),
        }],
      };
    } catch (procError) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: `Proc-based bridge_send to ${ai_name} failed: ${procError instanceof Error ? procError.message : String(procError)}`,
          }),
        }],
        isError: true,
      };
    }
  }

  if (entry.terminalBackend !== "wezterm" && entry.terminalBackend !== "tmux") {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: `bridge_send requires WezTerm or tmux backend (got: ${entry.terminalBackend ?? "unknown"})`,
        }),
      }],
      isError: true,
    };
  }

  // Send via the appropriate terminal backend's injectText method.
  // This handles newline splitting, bracketed-paste delays, and proper submit.
  const paneId = entry.paneId!;
  let backend: import("../../workers/terminal/base").TerminalBackend;
  try {
    if (entry.terminalBackend === "tmux") {
      const { TmuxBackend } = await import("../../workers/terminal/tmux");
      backend = new TmuxBackend();
    } else {
      const { WezTermBackend } = await import("../../workers/terminal/wezterm");
      backend = new WezTermBackend();
    }

    const textToSend = bridgeMessage.replace(/[\r\n]+$/u, "");
    await backend.injectText(paneId, textToSend);
    // WezTerm's injectText sends CR internally to submit.
    // Tmux's injectText does NOT send Enter — must send it explicitly.
    if (entry.terminalBackend === "tmux") {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await backend.sendKeys(paneId, "Enter");
    }
  } catch (sendError) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: `Failed to send text to ${ai_name} pane ${paneId}: ${sendError instanceof Error ? sendError.message : String(sendError)}`,
        }),
      }],
      isError: true,
    };
  }

  // Brief verification: check if text was submitted or stuck in input
  try {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const paneOutput = await backend.getPaneOutput(paneId, 20);
    const lastLines = paneOutput.trim().split("\n").slice(-5).join("\n");
    const sentTextSnippet = bridgeMessage.slice(0, 60).trim();

    const hasProcessingIndicator = /thinking|loading|processing|⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏|⠐|⠑|\.{3,}|Inspecting|Explored/i.test(lastLines);
    const textStillInInput = lastLines.includes(sentTextSnippet) && !hasProcessingIndicator;

    if (textStillInInput) {
      // Text pasted but not submitted — send Escape + Enter to force submit
      await backend.sendKeys(paneId, "Escape");
      await new Promise((resolve) => setTimeout(resolve, 100));
      await backend.sendKeys(paneId, "Enter");
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  } catch {
    // Verification is best-effort — continue to polling even if it fails
  }

  // Determine the base AI type for config/routing lookup
  const baseAIName = ai_name.includes(":") ? ai_name.slice(0, ai_name.indexOf(":")) : ai_name;
  const supportsPolling = baseAIName === "codex" || baseAIName === "opencode" || baseAIName === "cc";

  const shouldWait = wait_for_response !== false;
  if (!shouldWait || !supportsPolling) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          sent: true,
          ai_name,
          pane_id: entry.paneId,
          waited: false,
          message: `Message sent to ${ai_name}. Use bridge_send with wait_for_response=true to get responses.`,
        }),
      }],
    };
  }

  // Track request in per-session state for statusline
  const requestId = `bridge-${ai_name}-${Date.now()}`;
  try {
    const { addSessionBridgeRequest } = await import("../../workers/bridge/state");
    addSessionBridgeRequest(requestId, ai_name);
  } catch { /* non-critical */ }

  // Poll for response
  const timeoutMs = timeout_ms ?? 120000;
  const projectPath = entry.projectPath ?? cachedProjectRoot ?? process.cwd();

  try {
    let response: string | null = null;

    if (baseAIName === "cc") {
      // Try proxy-mediated capture first (clean, reliable)
      if (entry.proxySessionId && entry.proxyControlPort) {
        const { pollProxyResponse } = await import("../../workers/bridge/poll-response");
        response = await pollProxyResponse(entry.proxyControlPort, entry.proxySessionId, timeoutMs);
      }

      // Fallback to pane-output polling if proxy capture unavailable
      if (!response) {
        const { pollCCPaneResponse } = await import("../../workers/bridge/poll-response");
        response = await pollCCPaneResponse(entry, bridgeMessage, timeoutMs);
      }
    } else {
      const { pollForBridgeResponse } = await import("../../workers/bridge/poll-response");
      response = await pollForBridgeResponse(
        ai_name as "codex" | "opencode",
        projectPath,
        timeoutMs,
        {
          paneId,
          backend,
          sentMessage: bridgeMessage,
        },
      );
    }

    // Update per-session request state
    try {
      const { updateSessionBridgeRequest } = await import("../../workers/bridge/state");
      updateSessionBridgeRequest(requestId, response ? "completed" : "error");
    } catch { /* non-critical */ }

    // Auto-close behavior depends on context:
    // - Bridge Mode (OMC_BRIDGE_MODE=1): default false (workers are persistent team members)
    // - Manual bridge (no bridge mode): default true (one-shot helpers, clean up after task)
    // - Explicit auto_close parameter always wins
    const isBridgeMode = process.env.OMC_BRIDGE_MODE === "1";
    const shouldAutoClose = auto_close !== undefined ? auto_close : !isBridgeMode;
    let closed = false;

    if (shouldAutoClose && response) {
      // Kill the pane (best-effort — may already be gone)
      try {
        if (entry.terminalBackend === "tmux") {
          const { execSync } = await import("node:child_process");
          execSync(`tmux kill-pane -t ${paneId}`, { stdio: "pipe" });
        } else if (entry.terminalBackend === "wezterm") {
          const { execSync } = await import("node:child_process");
          execSync(`wezterm cli kill-pane --pane-id ${paneId}`, { stdio: "pipe" });
        }
      } catch { /* pane already gone */ }
      // Always remove from state and orchestrator — separate try so kill failure doesn't block cleanup
      try {
        const { removeAIFromState } = await import("../../workers/bridge/state");
        removeAIFromState(ai_name);
        closed = true;
      } catch { /* non-critical */ }
      try {
        const { getBridgeOrchestrator } = await import("../../workers/bridge");
        const orch = getBridgeOrchestrator();
        if (orch.listAIs().some((ai) => ai.name === ai_name)) {
          await orch.unregisterAI(ai_name);
        }
      } catch { /* non-critical */ }
    }

    if (response) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            sent: true,
            ai_name,
            pane_id: entry.paneId,
            waited: true,
            response,
            auto_closed: closed,
          }),
        }],
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          sent: true,
          ai_name,
          pane_id: entry.paneId,
          waited: true,
          response: null,
          message: `Message sent but no response received within ${Math.round(timeoutMs / 1000)}s timeout`,
        }),
      }],
    };
  } catch (pollError) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          sent: true,
          ai_name,
          pane_id: entry.paneId,
          waited: true,
          response: null,
          error: `Message sent but response polling failed: ${pollError instanceof Error ? pollError.message : String(pollError)}`,
        }),
      }],
    };
  }
}
