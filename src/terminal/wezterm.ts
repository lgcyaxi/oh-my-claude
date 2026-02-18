import { BaseTerminalBackend, TerminalBackendError } from "./base";
import type { PaneId, PaneInfo, PaneCreateOptions } from "./types";

/**
 * WezTerm backend using the `wezterm cli` API.
 *
 * Key commands:
 * - `wezterm cli spawn` → creates a pane and returns its numeric pane-id
 * - `wezterm cli split-pane` → splits an existing pane (right/bottom)
 * - `wezterm cli send-text --pane-id <id>` → injects text into a pane
 * - `wezterm cli get-text --pane-id <id>` → reads pane screen content
 * - `wezterm cli kill-pane --pane-id <id>` → kills a pane
 * - `wezterm cli list --format json` → lists all panes
 */
export class WezTermBackend extends BaseTerminalBackend {
  readonly name = "wezterm" as const;

  async createPane(name: string, command: string, options?: PaneCreateOptions): Promise<PaneId> {
    await this.ensureWezTermInstalled();

    let args: string[];

    if (options?.split && options?.targetPane) {
      // Split an existing pane — creates a split layout within the same tab/window
      // "h" = horizontal split → --right (side-by-side)
      // "v" = vertical split → --bottom (stacked)
      const direction = options.split === "h" ? "--right" : "--bottom";
      args = ["cli", "split-pane", direction, "--pane-id", options.targetPane];
      if (options.splitPercent) {
        args.push("--percent", String(options.splitPercent));
      }
      if (options.cwd) {
        args.push("--cwd", options.cwd);
      }
      args.push("--", "cmd.exe", "/k", command);
    } else {
      // Default: spawn a new window
      // `cmd.exe /k` keeps the window alive after the command exits, so the
      // pane remains available for diagnostics even if the AI crashes.
      args = ["cli", "spawn", "--new-window"];
      if (options?.cwd) {
        args.push("--cwd", options.cwd);
      }
      args.push("--", "cmd.exe", "/k", command);
    }

    const { stdout } = await this.runCommand("wezterm", args, { timeoutMs: 15_000 });

    const paneId = stdout.trim();
    if (!paneId || !/^\d+$/.test(paneId)) {
      throw new TerminalBackendError({
        message: `wezterm returned invalid pane-id: "${paneId}"`,
        command: "wezterm",
        args,
      });
    }

    this.registerPane({
      id: paneId,
      name,
      command,
      createdAt: new Date(),
    });

    return paneId;
  }

  async closePane(paneId: PaneId): Promise<void> {
    try {
      await this.runCommand("wezterm", ["cli", "kill-pane", "--pane-id", paneId], {
        timeoutMs: 10_000,
      });
    } catch {
      // Pane may already be dead — that's fine
    }
    this.unregisterPane(paneId);
  }

  async listPanes(): Promise<PaneInfo[]> {
    await this.ensureWezTermInstalled();

    try {
      // wezterm cli list may exit with code 1 on Windows/Git Bash even when
      // stdout contains valid JSON. Use runCommandRaw to tolerate non-zero exit.
      const { stdout } = await this.runCommandRaw("wezterm", ["cli", "list", "--format", "json"], {
        timeoutMs: 10_000,
      });

      // Deduplicate output — Git Bash sometimes prints JSON twice
      const trimmed = stdout.trim();
      const jsonStart = trimmed.indexOf("[");
      const jsonEnd = trimmed.indexOf("]", jsonStart);
      const jsonStr = jsonStart >= 0 && jsonEnd >= 0
        ? trimmed.slice(jsonStart, jsonEnd + 1)
        : trimmed;

      const items = JSON.parse(jsonStr) as Array<{
        pane_id?: number;
        title?: string;
        cwd?: string;
      }>;

      return items.map((item) => ({
        id: String(item.pane_id ?? ""),
        name: item.title ?? "",
        command: item.cwd ?? "",
        createdAt: new Date(),
      }));
    } catch {
      // Fall back to tracked panes if wezterm cli list fails
      return this.getTrackedPanes();
    }
  }

  async injectText(paneId: PaneId, text: string): Promise<void> {
    // Strip trailing newlines — we send Enter separately as raw \x0d.
    // TUI apps (Codex, OpenCode) treat \n/\r\n in pasted text as multi-line input,
    // not as a submit action. Raw \x0d (CR) triggers the actual Enter key press.
    const cleanText = text.replace(/[\r\n]+$/u, "");

    // Step 1: Send the text content via stdin (no trailing newline)
    await this.runCommand("wezterm", ["cli", "send-text", "--pane-id", paneId, "--no-paste"], {
      timeoutMs: 10_000,
      input: cleanText,
    });

    // Step 2: Send raw CR (\x0d) to trigger Enter/Submit in the TUI
    await this.runCommand("wezterm", ["cli", "send-text", "--pane-id", paneId, "--no-paste"], {
      timeoutMs: 10_000,
      input: "\x0d",
    });
  }

  async sendKeys(paneId: PaneId, keys: string): Promise<void> {
    // Pass keys via stdin for reliable delivery
    await this.runCommand("wezterm", ["cli", "send-text", "--pane-id", paneId, "--no-paste"], {
      timeoutMs: 10_000,
      input: keys,
    });
  }

  async isPaneAlive(paneId: PaneId): Promise<boolean> {
    try {
      const { stdout } = await this.runCommand("wezterm", ["cli", "list", "--format", "json"], {
        timeoutMs: 10_000,
      });

      const items = JSON.parse(stdout) as Array<{ pane_id?: number }>;
      const numericId = parseInt(paneId, 10);
      return items.some((item) => item.pane_id === numericId);
    } catch {
      return false;
    }
  }

  async getPaneOutput(paneId: PaneId, _lines: number): Promise<string> {
    try {
      const { stdout } = await this.runCommand("wezterm", ["cli", "get-text", "--pane-id", paneId], {
        timeoutMs: 10_000,
      });
      return stdout;
    } catch {
      return "";
    }
  }

  private async ensureWezTermInstalled(): Promise<void> {
    const available = await this.commandExists("wezterm", ["--version"]);
    if (!available) {
      throw new TerminalBackendError({
        message: "wezterm is not installed or not available in PATH.",
        command: "wezterm",
        args: ["--version"],
      });
    }
  }
}
