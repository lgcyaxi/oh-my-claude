import {
	existsSync,
	lstatSync,
	readFileSync,
	readlinkSync,
	type Stats,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import type { CoworkerReviewTarget } from '../../../coworker/types';

export function describeReviewTarget(target: CoworkerReviewTarget): string {
	switch (target.type) {
		case 'uncommittedChanges':
			return 'Review target: uncommitted changes.';
		case 'baseBranch':
			return `Review target: changes relative to base branch ${target.branch}.`;
		case 'commit':
			return `Review target: commit ${target.sha}.${target.title ? ` ${target.title}` : ''}`.trim();
		case 'custom':
			return target.instructions;
	}
}

export function buildGitDiffArgs(
	target: CoworkerReviewTarget,
	paths: string[] | undefined,
	shortStat: boolean,
): string[] | null {
	const statFlag = shortStat ? '--shortstat' : '--unified=3';
	switch (target.type) {
		case 'uncommittedChanges':
			return ['diff', '--no-ext-diff', statFlag, '--', ...(paths ?? [])];
		case 'baseBranch':
			return [
				'diff',
				'--no-ext-diff',
				statFlag,
				`${target.branch}...HEAD`,
				'--',
				...(paths ?? []),
			];
		case 'commit':
			return [
				'diff',
				'--no-ext-diff',
				statFlag,
				`${target.sha}^!`,
				'--',
				...(paths ?? []),
			];
		case 'custom':
			return paths?.length
				? ['diff', '--no-ext-diff', statFlag, '--', ...paths]
				: null;
	}
}

export function readNumStatEntries(
	projectRoot: string,
	args: string[],
): Array<{ path: string; linesChanged: number }> {
	const result = spawnSync('git', args, {
		cwd: projectRoot,
		encoding: 'utf8',
	});
	if (result.status !== 0 && result.status !== 1) {
		return [];
	}
	return result.stdout
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const [insertions, deletions, path] = line.split('\t');
			if (!path) {
				return null;
			}
			const numericInsertions =
				insertions === '-' ? 1 : Number(insertions || 0);
			const numericDeletions =
				deletions === '-' ? 1 : Number(deletions || 0);
			return {
				path,
				linesChanged: numericInsertions + numericDeletions,
			};
		})
		.filter(
			(entry): entry is { path: string; linesChanged: number } =>
				entry !== null,
		);
}

export function listUntrackedFiles(
	projectRoot: string,
	paths: string[],
): string[] {
	const result = spawnSync(
		'git',
		['ls-files', '--others', '--exclude-standard', '--', ...paths],
		{
			cwd: projectRoot,
			encoding: 'utf8',
		},
	);
	if (result.status !== 0) {
		return [];
	}
	return result.stdout
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
}

export function hasGitHead(projectRoot: string): boolean {
	return (
		spawnSync('git', ['rev-parse', '--verify', 'HEAD'], {
			cwd: projectRoot,
			encoding: 'utf8',
		}).status === 0
	);
}

export function buildSyntheticShortStat(
	absolutePath: string,
	stat: Stats,
): string {
	if (stat.isSymbolicLink()) {
		return ' 1 file changed, 1 insertion(+)';
	}
	if (isProbablyBinaryFile(absolutePath)) {
		return ' 1 file changed';
	}
	const content = readFileSync(absolutePath, 'utf8');
	const insertions = countTextInsertions(content);
	if (insertions > 0) {
		return ` 1 file changed, ${insertions} insertion${insertions === 1 ? '' : 's'}(+)`;
	}
	return ' 1 file changed';
}

export function buildSyntheticPatchHunk(
	projectRoot: string,
	absolutePath: string,
): string {
	const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
	const result = spawnSync(
		'git',
		[
			'diff',
			'--no-index',
			'--binary',
			'--unified=3',
			'--src-prefix=a/',
			'--dst-prefix=b/',
			'--',
			nullDevice,
			absolutePath,
		],
		{
			cwd: projectRoot,
			encoding: 'utf8',
			maxBuffer: 4 * 1024 * 1024,
		},
	);

	if (result.status !== 0 && result.status !== 1) {
		return '';
	}
	const lines = result.stdout.split('\n');
	const start = lines.findIndex(
		(line) => line.startsWith('@@ ') || line.startsWith('Binary files '),
	);
	if (start === -1) {
		return '';
	}
	return lines.slice(start).join('\n').trim();
}

export function countTextInsertions(content: string): number {
	if (!content) {
		return 0;
	}
	return content.endsWith('\n')
		? content.slice(0, -1).split('\n').length
		: content.split('\n').length;
}

export function estimateSyntheticLinesChanged(
	absolutePath: string,
	stat: Stats,
): number {
	if (stat.isSymbolicLink()) {
		return 1;
	}
	if (isProbablyBinaryFile(absolutePath)) {
		return 1;
	}
	const content = readFileSync(absolutePath, 'utf8');
	return countTextInsertions(content);
}

export function isProbablyBinaryFile(absolutePath: string): boolean {
	try {
		const content = readFileSync(absolutePath);
		const sample = content.subarray(0, 8192);
		return sample.includes(0);
	} catch {
		return false;
	}
}

export function parseSyntheticShortStat(
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

export function buildInitialCommitScopedFileDiff(
	projectRoot: string,
	file: string,
	shortStat: boolean,
): string {
	const absolutePath = resolve(projectRoot, file);
	if (!existsSync(absolutePath)) {
		return '';
	}

	const labelPath = file.replaceAll('\\', '/');
	const stat = lstatSync(absolutePath);
	if (shortStat) {
		return buildSyntheticShortStat(absolutePath, stat);
	}

	const mode = stat.isSymbolicLink()
		? '120000'
		: stat.mode & 0o111
			? '100755'
			: '100644';

	if (stat.isSymbolicLink()) {
		const linkTarget = readlinkSync(absolutePath);
		return [
			`diff --git a/${labelPath} b/${labelPath}`,
			`new file mode ${mode}`,
			'--- /dev/null',
			`+++ b/${labelPath}`,
			'@@ -0,0 +1 @@',
			`+${linkTarget}`,
		].join('\n');
	}

	if (isProbablyBinaryFile(absolutePath)) {
		return [
			`diff --git a/${labelPath} b/${labelPath}`,
			`new file mode ${mode}`,
			`Binary files /dev/null and b/${labelPath} differ`,
		].join('\n');
	}

	const hunk = buildSyntheticPatchHunk(projectRoot, absolutePath);
	const lines = [
		`diff --git a/${labelPath} b/${labelPath}`,
		`new file mode ${mode}`,
		'--- /dev/null',
		`+++ b/${labelPath}`,
	];
	if (hunk) {
		lines.push(hunk);
	}
	return lines.join('\n');
}
