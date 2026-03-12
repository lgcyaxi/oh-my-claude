import { expect, test } from 'bun:test';

import { getOpenCodeCoworker, stopOpenCodeCoworker } from '../../src/coworker';

const runSmoke = process.env.OMC_RUN_OPENCODE_SMOKE === '1';
const opencodeSmokeTest = runSmoke ? test : test.skip;

opencodeSmokeTest(
	'opencode coworker can complete a minimal server task',
	async () => {
		process.env.OPENCODE_NO_VIEWER = '1';

		const projectPath = process.cwd();
		const coworker = getOpenCodeCoworker(projectPath);

		try {
			const result = await coworker.runTask({
				message: 'Reply with the exact token OMC_OPENCODE_SMOKE_OK and nothing else.',
				timeoutMs: 180_000,
			});

			expect(result.content).toContain('OMC_OPENCODE_SMOKE_OK');
		} finally {
			await stopOpenCodeCoworker(projectPath);
		}
	},
	180_000,
);
