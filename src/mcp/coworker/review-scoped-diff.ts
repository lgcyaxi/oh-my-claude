import type { CoworkerReviewTarget } from '../../coworker/types';
import { describeReviewTarget } from './scoped-review/git';
import { readGitDiff } from './scoped-review/uncommitted';
export { readGitShortStat } from './scoped-review/uncommitted';

export function buildScopedCodexReviewPrompt(
	projectRoot: string,
	target: CoworkerReviewTarget,
	paths: string[],
	message?: string,
): string {
	const diff = readGitDiff(projectRoot, target, paths);
	const scopeHeader = [
		'Perform a read-only code review for correctness bugs only.',
		`Restrict the review to these paths: ${paths.join(', ')}`,
	]
		.join('\n')
		.trim();

	const targetDescription = describeReviewTarget(target);
	const diffBlock = diff
		? `Diff to review:\n\`\`\`diff\n${diff}\n\`\`\``
		: 'No scoped diff was found for the requested paths.';

	return [scopeHeader, targetDescription, message, diffBlock]
		.filter(Boolean)
		.join('\n\n');
}

export function readScopedReviewPromptStats(
	projectRoot: string,
	target: CoworkerReviewTarget,
	paths: string[],
): {
	files: number;
	diffLines: number;
	binarySections: number;
	characters: number;
} | null {
	const diff = readGitDiff(projectRoot, target, paths);
	if (!diff) {
		return null;
	}
	const diffLines = diff.split('\n').length;
	const fileMatches = diff.match(/^diff --git /gm) ?? [];
	const binarySections = diff.match(/^Binary files /gm)?.length ?? 0;
	return {
		files: Math.max(fileMatches.length, paths.length),
		diffLines,
		binarySections,
		characters: diff.length,
	};
}
