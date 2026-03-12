import { existsSync, lstatSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import {
	buildGitDiffArgs,
	buildInitialCommitScopedFileDiff,
	estimateSyntheticLinesChanged,
	hasGitHead,
	listUntrackedFiles,
	parseSyntheticShortStat,
	readNumStatEntries,
} from './git';
import type { CoworkerReviewTarget } from '../../../coworker/types';

export function readGitDiff(
	projectRoot: string,
	target: CoworkerReviewTarget,
	paths?: string[],
): string {
	if (target.type === 'uncommittedChanges' && paths?.length) {
		return readScopedUncommittedDiff(projectRoot, paths);
	}

	const args = buildGitDiffArgs(target, paths, false);
	if (!args) {
		return '';
	}
	const result = spawnSync('git', args, {
		cwd: projectRoot,
		encoding: 'utf8',
		maxBuffer: 4 * 1024 * 1024,
	});
	if (result.status !== 0) {
		return '';
	}
	return result.stdout.trim();
}

export function readGitShortStat(
	projectRoot: string,
	target: CoworkerReviewTarget,
	paths?: string[],
): string | null {
	if (target.type === 'uncommittedChanges' && paths?.length) {
		const parsed = readScopedUncommittedShortStat(projectRoot, paths);
		if (!parsed) {
			return null;
		}
		return ` ${parsed.files} file${parsed.files === 1 ? '' : 's'} changed${parsed.linesChanged > 0 ? `, ${parsed.linesChanged} insertions/deletions` : ''}`;
	}

	const args = buildGitDiffArgs(target, paths, true);
	if (!args) {
		return null;
	}
	const result = spawnSync('git', args, {
		cwd: projectRoot,
		encoding: 'utf8',
	});
	if (result.status !== 0) {
		return null;
	}

	return result.stdout.trim() || null;
}

function readScopedUncommittedShortStat(
	projectRoot: string,
	paths: string[],
): { files: number; linesChanged: number } | null {
	if (!hasGitHead(projectRoot)) {
		return readInitialCommitScopedShortStat(projectRoot, paths);
	}

	const sections = collectScopedUncommittedSections(projectRoot, paths, true);
	if (sections.length === 0) {
		return null;
	}

	const totals = sections.reduce(
		(acc, section) => {
			const parsed = parseSyntheticShortStat(section.content);
			if (!parsed) {
				return acc;
			}
			acc.files += parsed.files;
			acc.linesChanged += parsed.linesChanged;
			return acc;
		},
		{ files: 0, linesChanged: 0 },
	);

	return totals.files > 0 || totals.linesChanged > 0 ? totals : null;
}

function readScopedUncommittedDiff(
	projectRoot: string,
	paths: string[],
): string {
	return collectScopedUncommittedSections(projectRoot, paths, false)
		.map((section) => section.content.trim())
		.filter(Boolean)
		.join('\n\n')
		.trim();
}

function collectScopedUncommittedSections(
	projectRoot: string,
	paths: string[],
	shortStat: boolean,
): Array<{ source: 'tracked' | 'untracked'; content: string }> {
	if (!hasGitHead(projectRoot)) {
		return collectInitialCommitScopedSections(
			projectRoot,
			paths,
			shortStat,
		);
	}

	const sections: Array<{
		source: 'tracked' | 'untracked';
		content: string;
	}> = [];
	const tracked = readTrackedUncommittedAgainstHead(
		projectRoot,
		paths,
		shortStat,
	);
	if (tracked) {
		sections.push({ source: 'tracked', content: tracked });
	}

	const untrackedFiles = listUntrackedFiles(projectRoot, paths);
	for (const file of untrackedFiles) {
		const diff = buildInitialCommitScopedFileDiff(
			projectRoot,
			file,
			shortStat,
		);
		if (diff) {
			sections.push({ source: 'untracked', content: diff });
		}
	}

	return sections;
}

function readTrackedUncommittedAgainstHead(
	projectRoot: string,
	paths: string[],
	shortStat: boolean,
): string {
	const statFlag = shortStat ? '--shortstat' : '--unified=3';
	const result = spawnSync(
		'git',
		['diff', '--no-ext-diff', statFlag, 'HEAD', '--', ...paths],
		{
			cwd: projectRoot,
			encoding: 'utf8',
			maxBuffer: 4 * 1024 * 1024,
		},
	);
	if (result.status === 0 && result.stdout.trim()) {
		return result.stdout.trim();
	}
	return '';
}

function collectInitialCommitScopedSections(
	projectRoot: string,
	paths: string[],
	shortStat: boolean,
): Array<{ source: 'tracked' | 'untracked'; content: string }> {
	const sections: Array<{
		source: 'tracked' | 'untracked';
		content: string;
	}> = [];

	const stagedTracked = readInitialCommitTrackedDiff(
		projectRoot,
		paths,
		shortStat,
		true,
	);
	if (stagedTracked) {
		sections.push({ source: 'tracked', content: stagedTracked });
	}

	const unstagedTracked = readInitialCommitTrackedDiff(
		projectRoot,
		paths,
		shortStat,
		false,
	);
	if (unstagedTracked) {
		sections.push({ source: 'tracked', content: unstagedTracked });
	}

	const untrackedFiles = listUntrackedFiles(projectRoot, paths);
	for (const file of untrackedFiles) {
		const content = buildInitialCommitScopedFileDiff(
			projectRoot,
			file,
			shortStat,
		);
		if (content) {
			sections.push({ source: 'untracked', content });
		}
	}

	return sections;
}

function readInitialCommitTrackedDiff(
	projectRoot: string,
	paths: string[],
	shortStat: boolean,
	cached: boolean,
): string {
	const args = [
		'diff',
		'--no-ext-diff',
		shortStat ? '--shortstat' : '--binary',
		...(shortStat ? [] : ['--unified=3']),
		...(cached ? ['--cached'] : []),
		'--',
		...paths,
	];
	const result = spawnSync('git', args, {
		cwd: projectRoot,
		encoding: 'utf8',
		maxBuffer: 4 * 1024 * 1024,
	});
	if ((result.status === 0 || result.status === 1) && result.stdout.trim()) {
		return result.stdout.trim();
	}
	return '';
}

function readInitialCommitScopedShortStat(
	projectRoot: string,
	paths: string[],
): { files: number; linesChanged: number } | null {
	const fileStats = new Map<string, number>();
	for (const tracked of [
		readNumStatEntries(projectRoot, [
			'diff',
			'--cached',
			'--numstat',
			'--',
			...paths,
		]),
		readNumStatEntries(projectRoot, ['diff', '--numstat', '--', ...paths]),
	]) {
		for (const entry of tracked) {
			fileStats.set(
				entry.path,
				(fileStats.get(entry.path) ?? 0) + entry.linesChanged,
			);
		}
	}

	for (const file of listUntrackedFiles(projectRoot, paths)) {
		const absolutePath = resolve(projectRoot, file);
		if (!existsSync(absolutePath)) {
			continue;
		}
		const stat = lstatSync(absolutePath);
		fileStats.set(
			file,
			(fileStats.get(file) ?? 0) +
				estimateSyntheticLinesChanged(absolutePath, stat),
		);
	}

	if (fileStats.size === 0) {
		return null;
	}

	return {
		files: fileStats.size,
		linesChanged: [...fileStats.values()].reduce(
			(total, value) => total + value,
			0,
		),
	};
}
