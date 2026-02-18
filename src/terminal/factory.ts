import { TerminalBackendError, type TerminalBackend } from "./base";
import { TmuxBackend } from "./tmux";
import { WindowsTerminalBackend } from "./windows";
import { WezTermBackend } from "./wezterm";

export type TerminalBackendPreference = "tmux" | "wezterm" | "windows-terminal" | "iterm2";

export async function createTerminalBackend(
  preferred?: TerminalBackendPreference
): Promise<TerminalBackend> {
  const candidates = buildCandidateOrder(preferred);
  const errors: string[] = [];

  for (const candidate of candidates) {
    const backend = createBackend(candidate);
    try {
      await backend.listPanes();
      return backend;
    } catch (error) {
      errors.push(formatError(candidate, error));
    }
  }

  const installInstructions = getInstallInstructions();
  
  throw new TerminalBackendError({
    message: `No terminal backend is available. ${errors.join(" | ")}\n\n${installInstructions}`,
    command: "terminal-backend-factory",
    args: candidates,
  });
}

type BackendCandidate = "tmux" | "wezterm" | "windows-terminal";

function buildCandidateOrder(preferred?: TerminalBackendPreference): BackendCandidate[] {
  if (preferred === "windows-terminal") {
    return process.platform === "win32"
      ? ["windows-terminal", "wezterm", "tmux"]
      : ["wezterm", "tmux"];
  }

  if (preferred === "iterm2") {
    return process.platform === "win32" ? ["windows-terminal", "wezterm", "tmux"] : ["tmux", "wezterm"];
  }

  if (preferred === "tmux") {
    return process.platform === "win32" ? ["tmux", "windows-terminal", "wezterm"] : ["tmux", "wezterm"];
  }

  if (preferred === "wezterm") {
    return process.platform === "win32" 
      ? ["wezterm", "windows-terminal", "tmux"] 
      : ["wezterm", "tmux"];
  }

  // Default order varies by environment
  if (process.platform === "win32") {
    // On Windows, always prefer WezTerm — even inside tmux.
    // WezTerm is the host terminal; tmux runs inside it.
    // WezTerm CLI is reliably accessible from all subprocesses.
    return ["wezterm", "windows-terminal", "tmux"];
  }

  return ["tmux", "wezterm"];
}

function createBackend(candidate: BackendCandidate): TerminalBackend {
  if (candidate === "windows-terminal") {
    return new WindowsTerminalBackend();
  }

  if (candidate === "tmux") {
    return new TmuxBackend();
  }

  return new WezTermBackend();
}

function formatError(backend: BackendCandidate, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${backend}: ${message}`;
}

function getInstallInstructions(): string {
  if (process.platform === "win32") {
    return `To use the Multi-AI Bridge on Windows, you need to install a supported terminal:

Option 1 (Recommended): Install WezTerm
  winget install wez.wezterm
  # Or download from: https://wezfurlong.org/wezterm/

Option 2: Install Windows Terminal
  winget install Microsoft.WindowsTerminal
  # Or get from Microsoft Store

After installation, restart your terminal and try again.

Note: WezTerm is recommended because it has better programmatic control for managing AI assistant panes.`;
  }

  if (process.platform === "darwin") {
    return `To use the Multi-AI Bridge on macOS, you need to install a supported terminal:

Option 1 (Recommended): Install tmux
  brew install tmux

Option 2: Install WezTerm
  brew install --cask wezterm

Option 3: Install iTerm2
  brew install --cask iterm2

After installation, restart your terminal and try again.`;
  }

  return `To use the Multi-AI Bridge, you need to install a supported terminal:

Option 1 (Recommended): Install tmux
  sudo apt-get install tmux  # Debian/Ubuntu
  sudo yum install tmux      # RHEL/CentOS
  sudo pacman -S tmux        # Arch

Option 2: Install WezTerm
  # See: https://wezfurlong.org/wezterm/installation.html

After installation, restart your terminal and try again.`;
}
