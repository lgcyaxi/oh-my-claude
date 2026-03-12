import {
	readGitShortStat,
	readScopedReviewPromptStats,
} from './review-scoped-diff';

export { buildScopedCodexReviewPrompt } from './review-scoped-diff';

export function recommendCodexReviewTimeout(
	projectRoot: string,
	target: import('../../coworker/types').CoworkerReviewTarget,
	requestedTimeoutMs?: number,
	paths?: string[],
): number | undefined {
	const minimum = paths?.length ? 240_000 : 120_000;
	const maximum = paths?.length ? 720_000 : 480_000;
	const fallback = Math.max(requestedTimeoutMs ?? minimum, minimum);
	const scopedPromptStats = paths?.length
		? readScopedReviewPromptStats(projectRoot, target, paths)
		: null;
	const shortStatText = readGitShortStat(projectRoot, target, paths);
	const stats = shortStatText ? parseGitShortStat(shortStatText) : null;
	let recommended = fallback;
	if (stats) {
		recommended = Math.max(
			recommended,
			estimateCodexReviewTimeout(stats, minimum, maximum),
		);
	}
	if (scopedPromptStats) {
		recommended = Math.max(
			recommended,
			estimateCodexScopedPromptTimeout(
				scopedPromptStats,
				minimum,
				maximum,
			),
		);
	}
	return requestedTimeoutMs
		? Math.max(requestedTimeoutMs, recommended, minimum)
		: Math.max(recommended, minimum);
}

export function estimateCodexReviewTimeout(
	stats: { files: number; linesChanged: number },
	minimum = 120_000,
	maximum = 480_000,
): number {
	return Math.min(
		maximum,
		Math.max(
			minimum,
			120_000 + stats.files * 15_000 + stats.linesChanged * 90,
		),
	);
}

export function estimateCodexScopedPromptTimeout(
	stats: {
		files: number;
		diffLines: number;
		binarySections: number;
		characters: number;
	},
	minimum = 240_000,
	maximum = 720_000,
): number {
	return Math.min(
		maximum,
		Math.max(
			minimum,
			180_000 +
				stats.files * 20_000 +
				stats.diffLines * 120 +
				stats.binarySections * 45_000 +
				Math.ceil(stats.characters / 40),
		),
	);
}

export function parseGitShortStat(
	text: string,
): { files: number; linesChanged: number } | null {
	if (!text) {
		return null;
	}

	const files = Number(text.match(/(\d+) files? changed/)?.[1] ?? 0);
	const insertions = Number(text.match(/(\d+) insertions?\(\+\)/)?.[1] ?? 0);
	const deletions = Number(text.match(/(\d+) deletions?\(-\)/)?.[1] ?? 0);

	if (files === 0 && insertions === 0 && deletions === 0) {
		return null;
	}

	return { files, linesChanged: insertions + deletions };
}
