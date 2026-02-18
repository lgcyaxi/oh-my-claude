export type { PaneId, PaneInfo, PaneCreateOptions, TerminalBackendName } from "./types";
export { TerminalBackendError, type TerminalBackend } from "./base";
export { TmuxBackend } from "./tmux";
export { WindowsTerminalBackend } from "./windows";
export { WezTermBackend } from "./wezterm";
export { createTerminalBackend, type TerminalBackendPreference } from "./factory";
