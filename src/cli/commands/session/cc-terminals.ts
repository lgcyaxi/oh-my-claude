/**
 * CC command - Terminal launcher dispatcher
 *
 * Re-exports platform-agnostic tmux-based implementations.
 * All platforms use tmux (psmux on Windows provides tmux compatibility).
 */

export {
	shouldUseTmuxInline,
	launchInTmux,
	spawnVisibleProxy,
	splitCCIntoProxyPane,
	spawnProxyInNativeTerminal,
	killTerminalPane,
} from './cc-terminals-unix';
