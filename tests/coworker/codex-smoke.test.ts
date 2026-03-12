import { expect, test } from 'bun:test';

import { getCodexCoworker, stopCodexCoworker } from '../../src/coworker';

const runSmoke = process.env.OMC_RUN_CODEX_SMOKE === '1';
const codexSmokeTest = runSmoke ? test : test.skip;

codexSmokeTest(
	'codex coworker can complete a minimal app-server task',
	async () => {
		process.env.CODEX_NO_VIEWER = '1';

		const projectPath = process.cwd();
		const coworker = getCodexCoworker(projectPath);

		try {
			const result = await coworker.runTask({
				message: 'Reply with the exact token OMC_SMOKE_OK and nothing else.',
				timeoutMs: 180_000,
			});

			expect(result.content).toContain('OMC_SMOKE_OK');
		} finally {
			await stopCodexCoworker(projectPath);
		}
	},
	180_000,
);
