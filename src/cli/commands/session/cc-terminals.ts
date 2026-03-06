/**
 * CC command — Terminal launcher implementations (WezTerm, tmux, pane cleanup)
 */

import { spawn, spawnSync, execSync } from "node:child_process";
import { resolveWeztermBinary } from "../../utils/terminal-detect";
import { detectTerminalBackend } from "./cc-routing";

/**
 * Check whether the WezTerm mux server is reachable.
 * `wezterm cli list` succeeds only when a mux server is running.
 */
export function isWezTermMuxAvailable(): boolean {
  try {
    const wezterm = resolveWeztermBinary();
    const result = spawnSync(wezterm, ["cli", "list"], {
      encoding: "utf-8",
      windowsHide: true,
      timeout: 5_000,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Determine if inline mode should wrap claude in a tmux session.
 */
export async function shouldUseTmuxInline(): Promise<boolean> {
  if (process.env.TMUX) return false;
  if (process.env.OMC_BRIDGE_PANE) return false;
  if (process.platform === "win32") return false;
  return detectTerminalBackend() === "tmux";
}

/**
 * Launch Claude Code in WezTerm.
 */
export function launchInWezterm(
  baseUrl: string,
  controlPort: number,
  claudeArgsStr: string,
  debug: boolean,
  cwd: string,
  proxyPid?: number,
  bridgeMode?: boolean,
): string | undefined {
  const isWindows = process.platform === "win32";
  const wezterm = resolveWeztermBinary();
  const muxAvailable = isWezTermMuxAvailable();
  const insideWezTerm = !!process.env.WEZTERM_PANE;

  if (isWindows) {
    const envParts = [
      `set ANTHROPIC_BASE_URL=${baseUrl}`,
      `set OMC_PROXY_CONTROL_PORT=${controlPort}`,
      "set CLAUDECODE=",
      ...(debug ? ["set OMC_DEBUG=1"] : []),
    ];
    const bridgeDownWin = bridgeMode ? " && oh-my-claude bridge down all >nul 2>&1" : "";
    const killProxy = proxyPid ? ` && taskkill /F /PID ${proxyPid} >nul 2>&1${bridgeDownWin}` : bridgeDownWin;
    const shellCmd = `${envParts.join(" && ")} && claude${claudeArgsStr}${killProxy}`;

    if (muxAvailable) {
      const spawnArgs = insideWezTerm
        ? ["cli", "spawn", "--cwd", cwd, "--", "cmd.exe", "/k", shellCmd]
        : ["cli", "spawn", "--new-window", "--cwd", cwd, "--", "cmd.exe", "/k", shellCmd];
      try {
        const result = spawnSync(wezterm, spawnArgs, { encoding: "utf-8", windowsHide: true });
        const stdout = (result.stdout ?? "").trim();
        if (/^\d+$/.test(stdout)) return stdout;
      } catch {}
    }

    try {
      const child = spawn(
        wezterm,
        ["start", "--always-new-process", "--cwd", cwd, "--", "cmd.exe", "/k", shellCmd],
        { detached: true, stdio: "ignore" },
      );
      child.unref();
    } catch {}

    return undefined;
  }

  // Unix path
  const envParts = [
    `ANTHROPIC_BASE_URL=${baseUrl}`,
    `OMC_PROXY_CONTROL_PORT=${controlPort}`,
    ...(debug ? ["OMC_DEBUG=1"] : []),
  ];
  const bridgeDown = bridgeMode ? "; oh-my-claude bridge down all 2>/dev/null" : "";
  const killProxy = proxyPid ? `; kill ${proxyPid} 2>/dev/null${bridgeDown}` : bridgeDown;
  const shellCmd = `cd '${cwd.replace(/'/g, "'\\''")}' && unset CLAUDECODE && ${envParts.join(" ")} claude${claudeArgsStr}${killProxy}`;

  if (muxAvailable) {
    const newWindowFlag = insideWezTerm ? "" : " --new-window";
    try {
      const stdout = execSync(
        `"${wezterm}" cli spawn${newWindowFlag} --cwd "${cwd}" -- bash -c '${shellCmd.replace(/'/g, "'\\''")}'`,
        { encoding: "utf-8" },
      ).trim();
      if (/^\d+$/.test(stdout)) return stdout;
    } catch {}
  }

  try {
    const child = spawn(
      wezterm,
      ["start", "--always-new-process", "--cwd", cwd, "--", "bash", "-c", shellCmd],
      { detached: true, stdio: "ignore" },
    );
    child.unref();
  } catch {}

  return undefined;
}

/**
 * Launch Claude Code in tmux.
 */
export function launchInTmux(
  sessionId: string,
  baseUrl: string,
  controlPort: number,
  claudeArgsStr: string,
  debug: boolean,
  cwd: string,
  proxyPid?: number,
  bridgeMode?: boolean,
): string | undefined {
  const tmuxSession = `omc-cc-${sessionId}`;
  const escapedCwd = cwd.replace(/'/g, "'\\''");
  const envParts = [
    `ANTHROPIC_BASE_URL=${baseUrl}`,
    `OMC_PROXY_CONTROL_PORT=${controlPort}`,
    ...(debug ? ["OMC_DEBUG=1"] : []),
  ];
  const bridgeDown = bridgeMode ? "; oh-my-claude bridge down all 2>/dev/null" : "";
  const killProxy = proxyPid ? `; kill ${proxyPid} 2>/dev/null${bridgeDown}` : bridgeDown;
  const shellCmd = `cd '${escapedCwd}' && unset CLAUDECODE && ${envParts.join(" ")} claude${claudeArgsStr}${killProxy}`;
  const escapedShellCmd = shellCmd.replace(/'/g, "'\\''");

  try {
    if (process.env.TMUX) {
      execSync(`tmux new-window -n '${tmuxSession}' -c '${escapedCwd}' '${escapedShellCmd}'`, {
        encoding: "utf-8",
        windowsHide: true,
      });
    } else {
      execSync(`tmux new-session -d -s ${tmuxSession} -c '${escapedCwd}' '${escapedShellCmd}'`, {
        encoding: "utf-8",
        windowsHide: true,
      });
    }
    return tmuxSession;
  } catch {
    return undefined;
  }
}

/**
 * Kill a terminal pane by backend type and pane ID.
 */
export function killTerminalPane(backend: string, paneId: string): void {
  try {
    if (backend === "wezterm") {
      const wezterm = resolveWeztermBinary();
      execSync(`"${wezterm}" cli kill-pane --pane-id ${paneId}`, {
        encoding: "utf-8",
        windowsHide: true,
      });
    } else if (backend === "tmux") {
      execSync(`tmux kill-session -t ${paneId}`, {
        encoding: "utf-8",
        windowsHide: true,
      });
    }
  } catch {
    // Terminal pane may already be dead
  }
}
