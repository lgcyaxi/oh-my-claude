import { randomUUID } from "node:crypto";
import { win32 } from "node:path";
import { BaseTerminalBackend, TerminalBackendError } from "./base";
import type { PaneId, PaneInfo } from "./types";

interface WindowsPaneState {
  paneId: PaneId;
  tabIndex: number;
  title: string;
  createdAt: Date;
  command: string;
  name: string;
}

export class WindowsTerminalBackend extends BaseTerminalBackend {
  readonly name = "windows-terminal" as const;

  private readonly windowId: string;
  private readonly panes = new Map<PaneId, WindowsPaneState>();
  private paneCounter = 0;

  constructor(options?: { windowId?: string }) {
    super();
    this.windowId = options?.windowId ?? "oh-my-claude-bridge";
  }

  async createPane(name: string, command: string): Promise<PaneId> {
    this.ensureWindowsPlatform();
    await this.ensureWtInstalled();

    const paneId = `wt-pane-${randomUUID()}`;
    const tabIndex = this.paneCounter;
    const title = this.buildTabTitle(name, paneId);
    const startupCommand = this.normalizeStartupCommand(command);

    const args = [
      "new-tab",
      "--title",
      `"${title}"`,
      "cmd.exe",
      "/d",
      "/s",
      "/k",
      `"${startupCommand}"`,
    ];

    // wt.exe is a UWP App Execution Alias — requires shell: true to resolve
    await this.runCommand("wt.exe", args, { shell: true });

    const createdAt = new Date();
    this.paneCounter += 1;

    const info: PaneInfo = {
      id: paneId,
      name,
      command: startupCommand,
      createdAt,
    };

    this.panes.set(paneId, {
      paneId,
      tabIndex,
      title,
      createdAt,
      command: startupCommand,
      name,
    });

    this.registerPane(info);
    return paneId;
  }

  async closePane(paneId: PaneId): Promise<void> {
    this.ensureWindowsPlatform();
    await this.ensureWtInstalled();

    const pane = this.requirePane(paneId);
    await this.focusPane(pane);
    await this.sendKeysToWindow("^+w", pane.title);

    this.panes.delete(paneId);
    this.unregisterPane(paneId);

    for (const tracked of this.panes.values()) {
      if (tracked.tabIndex > pane.tabIndex) {
        tracked.tabIndex -= 1;
      }
    }
  }

  async listPanes(): Promise<PaneInfo[]> {
    this.ensureWindowsPlatform();
    await this.ensureWtInstalled();

    const alive: PaneInfo[] = [];
    for (const pane of this.panes.values()) {
      if (await this.isPaneAlive(pane.paneId)) {
        alive.push({
          id: pane.paneId,
          name: pane.name,
          command: pane.command,
          createdAt: pane.createdAt,
        });
      }
    }

    return alive;
  }

  async injectText(paneId: PaneId, text: string): Promise<void> {
    this.ensureWindowsPlatform();
    await this.ensureWtInstalled();

    const pane = this.requirePane(paneId);
    await this.focusPane(pane);

    const normalized = text.replace(/\r\n/g, "\n");
    const parts = normalized.split("\n");

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i] ?? "";

      if (part.length > 0) {
        await this.pasteViaClipboard(part, pane.title);
      }

      if (i < parts.length - 1) {
        await this.sendKeysToWindow("{ENTER}", pane.title);
      }
    }
  }

  async sendKeys(paneId: PaneId, keys: string): Promise<void> {
    this.ensureWindowsPlatform();
    await this.ensureWtInstalled();

    const pane = this.requirePane(paneId);
    await this.focusPane(pane);

    const tokens = keys
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    if (tokens.length === 0) {
      return;
    }

    for (const token of tokens) {
      await this.sendKeysToWindow(this.translateSendKeysToken(token), pane.title);
    }
  }

  async isPaneAlive(paneId: PaneId): Promise<boolean> {
    this.ensureWindowsPlatform();
    await this.ensureWtInstalled();

    const pane = this.panes.get(paneId);
    if (!pane) {
      return false;
    }

    try {
      await this.runCommand("wt.exe", [
        "-w",
        this.windowId,
        "focus-tab",
        "--target",
        String(pane.tabIndex),
      ], { shell: true });
      return true;
    } catch {
      return false;
    }
  }

  async getPaneOutput(paneId: PaneId, _lines: number): Promise<string> {
    this.ensureWindowsPlatform();
    await this.ensureWtInstalled();

    const pane = this.requirePane(paneId);
    throw new TerminalBackendError({
      message: `Reading pane output is not supported by wt.exe backend for pane ${pane.paneId}.`,
      command: "wt.exe",
      args: ["focus-tab", "--target", String(pane.tabIndex)],
    });
  }

  private async ensureWtInstalled(): Promise<void> {
    // IMPORTANT: Do NOT use `wt.exe --help` or `wt.exe --version` for detection.
    // These commands open a new GUI window instead of printing to stdout.
    // Use `where.exe` to check binary existence without side effects.
    const available = await this.commandExists("where.exe", ["wt.exe"]);
    if (!available) {
      throw new TerminalBackendError({
        message:
          "Windows Terminal (wt.exe) is not installed or not available in PATH. Install Windows Terminal and enable its App Execution Alias.",
        command: "where.exe",
        args: ["wt.exe"],
      });
    }
  }

  private ensureWindowsPlatform(): void {
    if (process.platform !== "win32") {
      throw new TerminalBackendError({
        message: "WindowsTerminalBackend can only be used on Windows (win32).",
        command: "wt.exe",
        args: [],
      });
    }
  }

  private buildTabTitle(name: string, paneId: PaneId): string {
    const safeName = name.replace(/[^a-zA-Z0-9_-]+/g, " ").trim() || "pane";
    return `omc ${safeName} ${paneId.slice(-8)}`;
  }

  private normalizeStartupCommand(command: string): string {
    const trimmed = command.trim();
    if (!trimmed) {
      return "";
    }

    const looksLikeStandalonePath = !/\s/.test(trimmed) && /^[a-zA-Z]:[\\/]|^\\\\/.test(trimmed);
    if (looksLikeStandalonePath) {
      return win32.normalize(trimmed);
    }

    return trimmed;
  }

  private requirePane(paneId: PaneId): WindowsPaneState {
    const pane = this.panes.get(paneId);
    if (!pane) {
      throw new TerminalBackendError({
        message: `Unknown Windows Terminal pane id: ${paneId}`,
        command: "wt.exe",
        args: [],
      });
    }

    return pane;
  }

  private async focusPane(pane: WindowsPaneState): Promise<void> {
    await this.runCommand("wt.exe", [
      "-w",
      this.windowId,
      "focus-tab",
      "--target",
      String(pane.tabIndex),
    ], { shell: true });
  }

  private async pasteViaClipboard(text: string, windowTitle: string): Promise<void> {
    const escapedText = this.toPowerShellSingleQuotedLiteral(text);
    const escapedTitle = this.toPowerShellSingleQuotedLiteral(windowTitle);
    const script = [
      `$target = ${escapedTitle}`,
      `$payload = ${escapedText}`,
      "Set-Clipboard -Value $payload",
      "$ws = New-Object -ComObject WScript.Shell",
      "$null = $ws.AppActivate($target)",
      "Start-Sleep -Milliseconds 80",
      '$ws.SendKeys("^v")',
    ].join("; ");

    await this.runPowerShell(script);
  }

  private async sendKeysToWindow(keys: string, windowTitle: string): Promise<void> {
    const escapedTitle = this.toPowerShellSingleQuotedLiteral(windowTitle);
    const escapedKeys = this.toPowerShellSingleQuotedLiteral(keys);
    const script = [
      `$target = ${escapedTitle}`,
      "$ws = New-Object -ComObject WScript.Shell",
      "$null = $ws.AppActivate($target)",
      "Start-Sleep -Milliseconds 80",
      `$ws.SendKeys(${escapedKeys})`,
    ].join("; ");

    await this.runPowerShell(script);
  }

  private async runPowerShell(script: string): Promise<void> {
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    await this.runCommand("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      encoded,
    ]);
  }

  private toPowerShellSingleQuotedLiteral(value: string): string {
    return `'${value.replaceAll("'", "''")}'`;
  }

  private translateSendKeysToken(token: string): string {
    const normalized = token.trim().toLowerCase();
    if (!normalized) {
      return "";
    }

    if (normalized === "enter") return "{ENTER}";
    if (normalized === "tab") return "{TAB}";
    if (normalized === "escape" || normalized === "esc") return "{ESC}";
    if (normalized === "backspace") return "{BACKSPACE}";
    if (normalized === "delete" || normalized === "del") return "{DEL}";
    if (normalized === "space") return " ";

    const ctrl = /^c-([a-z])$/.exec(normalized);
    if (ctrl?.[1]) {
      return `^${ctrl[1].toUpperCase()}`;
    }

    const alt = /^m-([a-z])$/.exec(normalized);
    if (alt?.[1]) {
      return `%${alt[1].toUpperCase()}`;
    }

    return token;
  }
}
