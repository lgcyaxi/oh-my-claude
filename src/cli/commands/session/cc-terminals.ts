/**
 * CC command - Terminal launcher dispatcher
 *
 * Re-exports platform-specific implementations.
 * - macOS/Linux: tmux + Terminal.app  (cc-terminals-unix.ts)
 * - Windows:     wezterm + cmd.exe    (cc-terminals-win.ts)
 */

import * as unix from './cc-terminals-unix';
import * as win from './cc-terminals-win';

const impl = process.platform === 'win32' ? win : unix;

export const shouldUseTmuxInline = impl.shouldUseTmuxInline;
export const launchInWezterm = impl.launchInWezterm;
export const launchInTmux = impl.launchInTmux;
export const spawnVisibleProxy = impl.spawnVisibleProxy;
export const splitProxyIntoWeztermPane: typeof win.splitProxyIntoWeztermPane =
	'splitProxyIntoWeztermPane' in impl
		? (impl as typeof win).splitProxyIntoWeztermPane
		: () => undefined;
export const splitCCIntoProxyPane = impl.splitCCIntoProxyPane;
export const spawnProxyInNativeTerminal = impl.spawnProxyInNativeTerminal;
export const killTerminalPane = impl.killTerminalPane;
export const canManageWeztermPanes: () => boolean =
	'canManageWeztermPanes' in impl
		? (impl as typeof win).canManageWeztermPanes
		: () => false;
export const spawnProxyInWeztermWindow: typeof win.spawnProxyInWeztermWindow =
	'spawnProxyInWeztermWindow' in impl
		? (impl as typeof win).spawnProxyInWeztermWindow
		: async () => ({ windowStarted: false });
