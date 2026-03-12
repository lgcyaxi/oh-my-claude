import type { Command } from 'commander';
import { registerCoworkerLogSubcommand } from './coworker-log';
import { createFormatters } from '../../utils/colors';

export function registerOpenCodeLogCommand(parent: Command): void {
	const sub = registerCoworkerLogSubcommand(parent, 'opencode', 'OpenCode');
	const { c } = createFormatters();

	sub.command('viewer')
		.description('Open or re-attach the OpenCode coworker viewer')
		.action(async () => {
			try {
				const { getOpenCodeCoworker } = await import('../../../coworker');
				const runtime = getOpenCodeCoworker(process.cwd());
				await runtime.startSession();
				const attached = runtime.ensureViewer();
				if (attached) {
					console.log(
						`${c.green}✓${c.reset} OpenCode viewer attached.`,
					);
					return;
				}
				console.log(
					`${c.yellow}!${c.reset} OpenCode viewer could not be opened. Status + log remain available.`,
				);
			} catch (error) {
				console.log(
					`${c.red}✗${c.reset} Failed to open OpenCode viewer: ${error}`,
				);
				process.exit(1);
			}
		});
}
