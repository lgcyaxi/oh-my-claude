/**
 * CC command — Session launch dispatcher
 *
 * Cross-platform session implementation using tmux as the multiplexer.
 * All platforms (macOS/Linux/Windows via psmux) use the same code path.
 */

export { launchDetachedSession, launchInlineSession } from './cc-session-unix';
