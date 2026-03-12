import type { Command } from 'commander';
import { registerCoworkerLogSubcommand } from './coworker-log';

export function registerCodexLogCommand(parent: Command): void {
	registerCoworkerLogSubcommand(parent, 'codex', 'Codex');
}
