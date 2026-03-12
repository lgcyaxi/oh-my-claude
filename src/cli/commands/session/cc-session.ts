/**
 * CC command — Session launch dispatcher
 *
 * Re-exports platform-specific session implementations.
 * - macOS/Linux: child.kill(), $SHELL, tmux inline, Terminal.app debug  (cc-session-unix.ts)
 * - Windows:     taskkill, cmd.exe, no tmux                            (cc-session-win.ts)
 */

import * as unix from './cc-session-unix';
import * as win from './cc-session-win';

const impl = process.platform === 'win32' ? win : unix;

export const launchDetachedSession = impl.launchDetachedSession;
export const launchInlineSession = impl.launchInlineSession;
