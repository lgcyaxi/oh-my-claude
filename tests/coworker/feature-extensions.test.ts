import { afterEach, beforeEach, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
	CodexCoworkerRuntime,
	OpenCodeCoworkerRuntime,
	getCodexCoworker,
	resetCodexCoworkers,
	resetOpenCodeCoworkers,
} from '../../src/coworker';
import {
	buildScopedCodexReviewPrompt,
	estimateCodexReviewTimeout,
	estimateCodexScopedPromptTimeout,
	handleCoworkerTool,
	parseGitShortStat,
	recommendCodexReviewTimeout,
} from '../../src/mcp/coworker/index';

const originalFetch = globalThis.fetch;
const originalEnv = {
	OMC_OPENCODE_AGENT: process.env.OMC_OPENCODE_AGENT,
	OMC_OPENCODE_PROVIDER: process.env.OMC_OPENCODE_PROVIDER,
	OMC_OPENCODE_MODEL: process.env.OMC_OPENCODE_MODEL,
	OMC_CODEX_APPROVAL_POLICY: process.env.OMC_CODEX_APPROVAL_POLICY,
	OMC_COWORKER_STATE_DIR: process.env.OMC_COWORKER_STATE_DIR,
};

let testStateDir: string | null = null;

beforeEach(() => {
	testStateDir = mkdtempSync(join(tmpdir(), 'omc-coworker-state-'));
	process.env.OMC_COWORKER_STATE_DIR = testStateDir;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	resetCodexCoworkers();
	resetOpenCodeCoworkers();
	process.env.OMC_OPENCODE_AGENT = originalEnv.OMC_OPENCODE_AGENT;
	process.env.OMC_OPENCODE_PROVIDER = originalEnv.OMC_OPENCODE_PROVIDER;
	process.env.OMC_OPENCODE_MODEL = originalEnv.OMC_OPENCODE_MODEL;
	process.env.OMC_CODEX_APPROVAL_POLICY =
		originalEnv.OMC_CODEX_APPROVAL_POLICY;
	process.env.OMC_COWORKER_STATE_DIR = originalEnv.OMC_COWORKER_STATE_DIR;
	if (testStateDir) {
		rmSync(testStateDir, { recursive: true, force: true });
		testStateDir = null;
	}
});

test('opencode request overrides are sent to the server body', async () => {
	const runtime = new OpenCodeCoworkerRuntime(process.cwd());
	(runtime as any).server = {
		baseUrl: 'http://127.0.0.1:65530',
		status: 'running',
		start: async () => {},
		stop: async () => {},
		subscribe: () => () => {},
		selectTuiSession: async () => true,
		showTuiToast: async () => true,
		executeTuiCommand: async () => true,
	};
	(runtime as any).ensureViewer = () => false;

	const seenBodies: unknown[] = [];
	globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		if (url.endsWith('/session') && init?.method === 'POST') {
			return new Response(JSON.stringify({ id: 'ses_test_123' }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		}
		if (url.endsWith('/agent')) {
			return new Response(
				JSON.stringify([{ name: 'build', mode: 'subagent', native: true }]),
				{ status: 200, headers: { 'content-type': 'application/json' } },
			);
		}
		if (url.endsWith('/provider')) {
			return new Response(
				JSON.stringify({ all: [{ id: 'minimax-cn' }] }),
				{ status: 200, headers: { 'content-type': 'application/json' } },
			);
		}
		if (url.endsWith('/message') && init?.method === 'POST') {
			seenBodies.push(JSON.parse(String(init.body)));
			return new Response(
				JSON.stringify({
					info: {
						id: 'msg_1',
						providerID: 'minimax-cn',
						modelID: 'MiniMax-M2.5',
					},
					parts: [{ type: 'text', text: 'ok' }],
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } },
			);
		}
		throw new Error(`Unexpected fetch: ${url}`);
	}) as typeof fetch;

	const result = await runtime.runTask({
		message: 'hello',
		agent: 'build',
		providerId: 'minimax-cn',
		modelId: 'MiniMax-M2.5',
		meta: { taskType: 'send', customFlag: true },
	});

	expect(result.model).toBe('minimax-cn/MiniMax-M2.5');
	expect(seenBodies).toHaveLength(1);
	expect(seenBodies[0]).toEqual({
		agent: 'build',
		model: { providerID: 'minimax-cn', modelID: 'MiniMax-M2.5' },
		parts: [{ type: 'text', text: 'hello' }],
	});
	expect(result.meta).toMatchObject({
		operation: 'send',
		agent: 'build',
		provider: 'minimax-cn',
		model: 'MiniMax-M2.5',
		taskType: 'send',
		customFlag: true,
	});
	expect(runtime.getStatus().agent).toBe('build');
	expect(runtime.getStatus().provider).toBe('minimax-cn');
	expect(runtime.getStatus().model).toBe('MiniMax-M2.5');
});

test('opencode environment defaults apply when request overrides are absent', async () => {
	process.env.OMC_OPENCODE_AGENT = 'explore';
	process.env.OMC_OPENCODE_PROVIDER = 'zhipuai-coding-plan';
	process.env.OMC_OPENCODE_MODEL = 'glm-5';

	const runtime = new OpenCodeCoworkerRuntime(process.cwd());
	(runtime as any).server = {
		baseUrl: 'http://127.0.0.1:65530',
		status: 'running',
		start: async () => {},
		stop: async () => {},
		subscribe: () => () => {},
		selectTuiSession: async () => true,
		showTuiToast: async () => true,
		executeTuiCommand: async () => true,
	};
	(runtime as any).ensureViewer = () => false;

	let body: any = null;
	globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		if (url.endsWith('/session') && init?.method === 'POST') {
			return new Response(JSON.stringify({ id: 'ses_env_123' }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		}
		if (url.endsWith('/agent')) {
			return new Response(
				JSON.stringify([{ name: 'explore', mode: 'subagent', native: true }]),
				{ status: 200, headers: { 'content-type': 'application/json' } },
			);
		}
		if (url.endsWith('/provider')) {
			return new Response(
				JSON.stringify({ all: [{ id: 'zhipuai-coding-plan' }] }),
				{ status: 200, headers: { 'content-type': 'application/json' } },
			);
		}
		if (url.endsWith('/message') && init?.method === 'POST') {
			body = JSON.parse(String(init.body));
			return new Response(
				JSON.stringify({
					info: {
						id: 'msg_2',
						providerID: 'zhipuai-coding-plan',
						modelID: 'glm-5',
					},
					parts: [{ type: 'text', text: 'ok' }],
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } },
			);
		}
		throw new Error(`Unexpected fetch: ${url}`);
	}) as typeof fetch;

	await runtime.runTask({ message: 'hello env' });
	
	expect(body.agent).toBe('explore');
	expect(body.model).toEqual({
		providerID: 'zhipuai-coding-plan',
		modelID: 'glm-5',
	});
});

test('opencode resolves a unique plugin agent alias from /agent', async () => {
	const runtime = new OpenCodeCoworkerRuntime(process.cwd());
	(runtime as any).server = {
		baseUrl: 'http://127.0.0.1:65530',
		status: 'running',
		start: async () => {},
		stop: async () => {},
		subscribe: () => () => {},
		selectTuiSession: async () => true,
		showTuiToast: async () => true,
		executeTuiCommand: async () => true,
	};
	(runtime as any).ensureViewer = () => false;

	let body: any = null;
	globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		if (url.endsWith('/session') && init?.method === 'POST') {
			return new Response(JSON.stringify({ id: 'ses_atlas_1' }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		}
		if (url.endsWith('/agent')) {
			return new Response(
				JSON.stringify([
					{ name: 'build', mode: 'subagent', native: true },
					{ name: 'Atlas (Plan Executor)', mode: 'subagent', native: false },
				]),
				{ status: 200, headers: { 'content-type': 'application/json' } },
			);
		}
		if (url.endsWith('/message') && init?.method === 'POST') {
			body = JSON.parse(String(init.body));
			return new Response(
				JSON.stringify({
					info: {
						id: 'msg_atlas_1',
						providerID: 'zhipuai-coding-plan',
						modelID: 'glm-5',
					},
					parts: [{ type: 'text', text: 'ok' }],
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } },
			);
		}
		throw new Error(`Unexpected fetch: ${url}`);
	}) as typeof fetch;

	const result = await runtime.runTask({
		message: 'hello plugin',
		agent: 'atlas',
	});

	expect(body.agent).toBe('Atlas (Plan Executor)');
	expect(result.meta).toMatchObject({
		requestedAgent: 'atlas',
		agent: 'Atlas (Plan Executor)',
		agentNative: false,
	});
	expect(runtime.getStatus()).toMatchObject({
		requestedAgent: 'atlas',
		agent: 'Atlas (Plan Executor)',
		agentNative: false,
		provider: 'zhipuai-coding-plan',
		model: 'glm-5',
	});
});

test('opencode rejects ambiguous plugin agent aliases with candidates', async () => {
	const runtime = new OpenCodeCoworkerRuntime(process.cwd());
	(runtime as any).server = {
		baseUrl: 'http://127.0.0.1:65530',
		status: 'running',
		start: async () => {},
		stop: async () => {},
		subscribe: () => () => {},
		selectTuiSession: async () => true,
		showTuiToast: async () => true,
		executeTuiCommand: async () => true,
	};
	(runtime as any).ensureViewer = () => false;

	globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		if (url.endsWith('/session') && init?.method === 'POST') {
			return new Response(JSON.stringify({ id: 'ses_ambiguous_1' }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		}
		if (url.endsWith('/agent')) {
			return new Response(
				JSON.stringify([
					{ name: 'Atlas (Plan Executor)', native: false },
					{ name: 'Atlas Reviewer', native: false },
				]),
				{ status: 200, headers: { 'content-type': 'application/json' } },
			);
		}
		throw new Error(`Unexpected fetch: ${url}`);
	}) as typeof fetch;

	await expect(
		runtime.runTask({ message: 'hello', agent: 'atlas' }),
	).rejects.toThrow(/ambiguous.*Atlas \(Plan Executor\).*Atlas Reviewer/i);
});

test('codex runtime exposes review, diff, fork, and approve helpers', async () => {
	const runtime = new CodexCoworkerRuntime(process.cwd());
	const calls: string[] = [];
	(runtime as any).startSession = async () => 'thread_1';
	(runtime as any).daemon = {
		getModel: () => 'gpt-5.4',
		getSessionId: () => 'thread_1',
		isViewerAvailable: () => true,
		isViewerAttached: () => false,
		getPendingApprovals: () => [
			{ requestId: 42, kind: 'command', summary: 'command approval' },
		],
		runReview: async () => {
			calls.push('review');
			return {
				content: 'reviewed',
				taskId: 'turn_review',
				sessionId: 'thread_1',
				reviewThreadId: 'thread_review',
			};
		},
		getDiff: async () => {
			calls.push('diff');
			return { diff: 'diff --git a b' };
		},
		forkThread: async () => {
			calls.push('fork');
			return {
				thread: { id: 'thread_2' },
				model: 'gpt-5.4',
				modelProvider: 'openai',
				cwd: process.cwd(),
			};
		},
		respondToApproval: async (requestId: number, payload: unknown) => {
			calls.push(`approve:${requestId}:${JSON.stringify(payload)}`);
			return true;
		},
		rollbackThread: async (numTurns: number) => {
			calls.push(`rollback:${numTurns}`);
			return { thread: { id: 'thread_1', turns: [] } };
		},
	};

	const review = await runtime.reviewTask({});
	const diff = await runtime.getDiff();
	const fork = await runtime.forkSession();
	const approval = await runtime.approve({ requestId: '42', decision: 'accept' });
	const revert = await runtime.revert({ numTurns: 2 });

	expect(review.meta).toMatchObject({
		operation: 'review',
		reviewThreadId: 'thread_review',
		reviewTargetType: 'uncommittedChanges',
		delivery: 'inline',
	});
	expect(diff.content).toContain('diff --git');
	expect(diff.meta).toMatchObject({
		operation: 'diff',
		source: 'lastTurnDiff',
	});
	expect(fork.sessionId).toBe('thread_2');
	expect(fork.meta).toMatchObject({
		operation: 'fork',
		cwd: process.cwd(),
	});
	expect(approval.approved).toBe(true);
	expect(approval.meta).toMatchObject({
		operation: 'approve',
		resolvedDecision: 'accept',
	});
	expect(revert.meta).toMatchObject({
		operation: 'rollback',
		numTurns: 2,
	});
	expect(calls).toEqual([
		'review',
		'diff',
		'fork',
		'approve:42:{"decision":"accept"}',
		'rollback:2',
	]);
});

test('codex runtime status exposes the active approval policy', () => {
	const runtime = new CodexCoworkerRuntime(process.cwd());
	(runtime as any).daemon = {
		getStatus: () => 'stopped',
		getSessionId: () => null,
		getModel: () => 'gpt-5.4',
		getApprovalPolicy: () => 'on-request',
		getPendingApprovals: () => [],
		isViewerAvailable: () => false,
		isViewerAttached: () => false,
	};

	expect(runtime.getStatus().approvalPolicy).toBe('on-request');
});

test('codex approval policy rejects removed compatibility aliases', async () => {
	const runtime = new CodexCoworkerRuntime(process.cwd());
	let currentPolicy = 'never';
	let stopped = false;
	(runtime as any).daemon = {
		getStatus: () => 'running',
		getApprovalPolicy: () => currentPolicy,
		setApprovalPolicy: (nextPolicy: string) => {
			currentPolicy = nextPolicy;
		},
		stop: async () => {
			stopped = true;
		},
	};

	await expect((runtime as any).ensureApprovalPolicy('strict')).rejects.toThrow(
		'Unsupported Codex approval policy',
	);

	expect(stopped).toBe(false);
	expect(currentPolicy).toBe('never');
});

test('codex approval policy rejects removed env aliases', async () => {
	process.env.OMC_CODEX_APPROVAL_POLICY = 'manual';
	await expect(async () => new CodexCoworkerRuntime(process.cwd())).toThrow(
		'Unsupported Codex approval policy',
	);
});

test('codex approval policy supports native reject flags', async () => {
	const runtime = new CodexCoworkerRuntime(process.cwd());
	let currentPolicy: unknown = 'never';
	(runtime as any).daemon = {
		getStatus: () => 'stopped',
		getApprovalPolicy: () => currentPolicy,
		getSessionId: () => null,
		getModel: () => 'gpt-5.4',
		getPendingApprovals: () => [],
		isViewerAvailable: () => false,
		isViewerAttached: () => false,
		setApprovalPolicy: (nextPolicy: unknown) => {
			currentPolicy = nextPolicy;
		},
		stop: async () => {},
	};

	await (runtime as any).ensureApprovalPolicy('reject:rules,mcp_elicitations');

	expect(currentPolicy).toEqual({
		reject: {
			sandbox_approval: false,
			rules: true,
			mcp_elicitations: true,
		},
	});
	expect(runtime.getStatus().approvalPolicy).toBe('reject:rules,mcp_elicitations');
});

test('codex approval accepts single-question user input via decision fallback', async () => {
	const runtime = new CodexCoworkerRuntime(process.cwd());
	let payload: unknown = null;
	(runtime as any).daemon = {
		getSessionId: () => 'thread_1',
		getModel: () => 'gpt-5.4',
		isViewerAvailable: () => false,
		isViewerAttached: () => false,
		getPendingApprovals: () => [
			{
				requestId: 7,
				kind: 'user_input',
				summary: 'Pick a branch',
				threadId: 'thread_1',
				turnId: 'turn_1',
				itemId: 'item_1',
				decisionOptions: ['submit'],
				questions: [
					{
						id: 'branch',
						header: 'Branch',
						question: 'Which branch?',
						options: ['main', 'dev'],
						isOther: false,
						isSecret: false,
					},
				],
				params: {},
			},
		],
		respondToApproval: async (_requestId: number, nextPayload: unknown) => {
			payload = nextPayload;
			return true;
		},
	};

	const result = await runtime.approve({
		requestId: '7',
		decision: 'main',
	});

	expect(result.approved).toBe(true);
	expect(result.meta).toMatchObject({
		decision: 'main',
		resolvedDecision: 'submit_answers',
	});
	expect(result.meta?.questions).toEqual([
		{
			id: 'branch',
			header: 'Branch',
			question: 'Which branch?',
			options: ['main', 'dev'],
			isOther: false,
			isSecret: false,
		},
	]);
	expect(payload).toEqual({
		answers: {
			branch: { answers: ['main'] },
		},
	});
});

test('opencode diff, fork, and revert surface execution metadata', async () => {
	const runtime = new OpenCodeCoworkerRuntime(process.cwd());
	(runtime as any).sessionId = 'ses_parent_1';
	(runtime as any).agentName = 'explore';
	(runtime as any).providerId = 'zhipuai-coding-plan';
	(runtime as any).modelId = 'glm-5';
	(runtime as any).server = {
		baseUrl: 'http://127.0.0.1:65530',
		status: 'running',
		start: async () => {},
		stop: async () => {},
		subscribe: () => () => {},
		selectTuiSession: async () => true,
		showTuiToast: async () => true,
		executeTuiCommand: async () => true,
	};

	globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		if (url.includes('/diff')) {
			return new Response(
				JSON.stringify([{ path: 'src/foo.ts', diff: 'diff --git a/src/foo.ts b/src/foo.ts' }]),
				{ status: 200, headers: { 'content-type': 'application/json' } },
			);
		}
		if (url.endsWith('/fork') && init?.method === 'POST') {
			return new Response(JSON.stringify({ id: 'ses_fork_1' }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		}
		if (url.endsWith('/revert') && init?.method === 'POST') {
			return new Response('true', { status: 200 });
		}
		throw new Error(`Unexpected fetch: ${url}`);
	}) as typeof fetch;

	const diff = await runtime.getDiff({ messageId: 'msg_1' });
	const fork = await runtime.forkSession({ messageId: 'msg_1' });
	const revert = await runtime.revert({
		messageId: 'msg_1',
		partId: 'part_1',
	});

	expect(diff.meta).toMatchObject({
		operation: 'diff',
		messageId: 'msg_1',
	});
	expect(fork.meta).toMatchObject({
		operation: 'fork',
		parentSessionId: 'ses_parent_1',
		agent: 'explore',
		provider: 'zhipuai-coding-plan',
		model: 'glm-5',
	});
	expect(revert.meta).toMatchObject({
		operation: 'revert',
		undo: false,
		messageId: 'msg_1',
		partId: 'part_1',
	});
});

test('opencode review forwards scoped paths into the delegated task prompt', async () => {
	const runtime = new OpenCodeCoworkerRuntime(process.cwd());
	let capturedRequest: any = null;
	(runtime as any).runTask = async (request: unknown) => {
		capturedRequest = request;
		return {
			requestId: 'req_review',
			coworker: 'opencode',
			content: 'ok',
			timestamp: new Date(),
			sessionId: 'ses_1',
			taskId: 'task_1',
			model: 'glm-5',
			meta: {},
		};
	};

	await runtime.reviewTask({
		target: { type: 'uncommittedChanges' },
		paths: ['src/mcp/coworker/index.ts', 'src/coworker/opencode/runtime.ts'],
		message: 'Focus on correctness only.',
	});

	expect(capturedRequest.context).toContain('Scoped review paths:');
	expect(capturedRequest.context).toContain('src/mcp/coworker/index.ts');
	expect(capturedRequest.message).toContain(
		'Restrict the review to these paths: src/mcp/coworker/index.ts, src/coworker/opencode/runtime.ts.',
	);
	expect(capturedRequest.meta).toMatchObject({
		taskType: 'review',
		reviewMode: 'scoped-prompt',
	});
});

test('opencode approval normalizes common decision aliases', async () => {
	const runtime = new OpenCodeCoworkerRuntime(process.cwd());
	(runtime as any).sessionId = 'ses_approve_1';
	(runtime as any).pendingPermissions.set('perm_1', {
		sessionId: 'ses_approve_1',
		summary: 'permission needed',
		decisionOptions: ['approve', 'deny'],
		kind: 'write',
		status: 'requested',
		lastEventType: 'permission.requested',
		details: { path: 'src/foo.ts' },
	});
	(runtime as any).server = {
		baseUrl: 'http://127.0.0.1:65530',
		status: 'running',
		start: async () => {},
		stop: async () => {},
		subscribe: () => () => {},
		selectTuiSession: async () => true,
		showTuiToast: async () => true,
		executeTuiCommand: async () => true,
	};

	let body: any = null;
	globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		if (url.includes('/permissions/perm_1') && init?.method === 'POST') {
			body = JSON.parse(String(init.body));
			return new Response('true', { status: 200 });
		}
		throw new Error(`Unexpected fetch: ${url}`);
	}) as typeof fetch;

	const result = await runtime.approve({
		sessionId: 'ses_approve_1',
		permissionId: 'perm_1',
		decision: 'reject',
	});

	expect(result.approved).toBe(true);
	expect(body).toEqual({
		response: 'deny',
		remember: false,
	});
	expect(result.meta).toMatchObject({
		decision: 'reject',
		resolvedDecision: 'deny',
		summary: 'permission needed',
		kind: 'write',
		status: 'requested',
		lastEventType: 'permission.requested',
		decisionOptions: ['approve', 'deny'],
		details: { path: 'src/foo.ts' },
	});
	const activityPath = join(
		process.env.OMC_COWORKER_STATE_DIR!,
		'logs',
		'coworker',
		'opencode.jsonl',
	);
	expect(readFileSync(activityPath, 'utf8')).toContain('"requestId":"perm_1"');
	expect(readFileSync(activityPath, 'utf8')).toContain('"summary":"permission needed"');
});

test('opencode approval rejects unsupported permission decisions', async () => {
	const runtime = new OpenCodeCoworkerRuntime(process.cwd());
	(runtime as any).sessionId = 'ses_approve_2';
	(runtime as any).pendingPermissions.set('perm_2', {
		sessionId: 'ses_approve_2',
		summary: 'permission needed',
		decisionOptions: ['approve', 'deny'],
	});
	(runtime as any).server = {
		baseUrl: 'http://127.0.0.1:65530',
		status: 'running',
		start: async () => {},
		stop: async () => {},
		subscribe: () => () => {},
		selectTuiSession: async () => true,
		showTuiToast: async () => true,
		executeTuiCommand: async () => true,
	};

	await expect(
		runtime.approve({
			sessionId: 'ses_approve_2',
			permissionId: 'perm_2',
			decision: 'allow-for-session',
		}),
	).rejects.toThrow(/not allowed/);
});

test('opencode global permission events surface structured details in status', async () => {
	const runtime = new OpenCodeCoworkerRuntime(process.cwd());
	(runtime as any).capturePermissionEvent(
		'permission.requested',
		{
			id: 'perm_2',
			message: 'Need write access',
			options: ['approve', 'deny'],
			path: 'src/foo.ts',
		},
		'ses_perm_2',
	);

	const pending = runtime.getStatus().pendingApprovals ?? [];
	expect(pending).toHaveLength(1);
	expect(pending[0]).toMatchObject({
		requestId: 'perm_2',
		sessionId: 'ses_perm_2',
		decisionOptions: ['approve', 'deny'],
	});
	expect(pending[0]?.details).toMatchObject({
		path: 'src/foo.ts',
	});
});

test('opencode resolved permission events clear pending approvals', async () => {
	const runtime = new OpenCodeCoworkerRuntime(process.cwd());
	(runtime as any).capturePermissionEvent(
		'permission.requested',
		{
			id: 'perm_3',
			message: 'Need shell access',
			options: ['approve', 'deny'],
		},
		'ses_perm_3',
	);
	expect(runtime.getStatus().pendingApprovals).toHaveLength(1);

	(runtime as any).capturePermissionEvent(
		'permission.resolved',
		{
			id: 'perm_3',
			status: 'approved',
		},
		'ses_perm_3',
	);
	expect(runtime.getStatus().pendingApprovals).toHaveLength(0);
});

test('codex approval can return exec-policy amendment payloads', async () => {
	const runtime = new CodexCoworkerRuntime(process.cwd());
	let payload: unknown = null;
	(runtime as any).daemon = {
		getSessionId: () => 'thread_1',
		getModel: () => 'gpt-5.4',
		isViewerAvailable: () => false,
		isViewerAttached: () => false,
		getPendingApprovals: () => [
			{
				requestId: 9,
				kind: 'command',
				summary: 'command approval',
				threadId: 'thread_1',
				turnId: 'turn_1',
				itemId: 'item_1',
				decisionOptions: ['accept', 'acceptWithExecpolicyAmendment', 'decline'],
				params: {},
			},
		],
		respondToApproval: async (_requestId: number, nextPayload: unknown) => {
			payload = nextPayload;
			return true;
		},
	};

	await runtime.approve({
		requestId: '9',
		decision: 'approve',
		execPolicyAmendment: ['git', 'diff'],
	});

	expect(payload).toEqual({
		decision: {
			acceptWithExecpolicyAmendment: {
				execpolicy_amendment: ['git', 'diff'],
			},
		},
	});
});

test('codex explicit decline wins over amendment payloads', async () => {
	const runtime = new CodexCoworkerRuntime(process.cwd());
	let payload: unknown = null;
	(runtime as any).daemon = {
		getSessionId: () => 'thread_1',
		getModel: () => 'gpt-5.4',
		isViewerAvailable: () => false,
		isViewerAttached: () => false,
		getPendingApprovals: () => [
			{
				requestId: 10,
				kind: 'command',
				summary: 'command approval',
				threadId: 'thread_1',
				turnId: 'turn_1',
				itemId: 'item_1',
				decisionOptions: ['accept', 'decline', 'cancel'],
				params: {},
			},
		],
		respondToApproval: async (_requestId: number, nextPayload: unknown) => {
			payload = nextPayload;
			return true;
		},
	};

	const result = await runtime.approve({
		requestId: '10',
		decision: 'deny',
		execPolicyAmendment: ['git', 'diff'],
	});

	expect(payload).toEqual({ decision: 'decline' });
	expect(result.meta).toMatchObject({
		resolvedDecision: 'decline',
	});
});

test('codex approval rejects amendment decisions that are not allowed', async () => {
	const runtime = new CodexCoworkerRuntime(process.cwd());
	(runtime as any).daemon = {
		getSessionId: () => 'thread_1',
		getModel: () => 'gpt-5.4',
		isViewerAvailable: () => false,
		isViewerAttached: () => false,
		getPendingApprovals: () => [
			{
				requestId: 11,
				kind: 'command',
				summary: 'command approval',
				threadId: 'thread_1',
				turnId: 'turn_1',
				itemId: 'item_1',
				decisionOptions: ['accept', 'decline'],
				params: {},
			},
		],
	};

	await expect(
		runtime.approve({
			requestId: '11',
			decision: 'acceptWithExecpolicyAmendment',
			execPolicyAmendment: ['git', 'diff'],
		}),
	).rejects.toThrow(/not allowed/);
});

test('coworker_task routes to unified status action', async () => {
	const result = await handleCoworkerTool(
		'coworker_task',
		{ action: 'status' },
		{
			getProjectRoot: () => process.cwd(),
			getSessionId: () => undefined,
			getPrefStore: () => {
				throw new Error('unused');
			},
			ensureIndexer: async () => {
				throw new Error('unused');
			},
		},
	);

	expect(result?.isError).not.toBe(true);
	expect(result?.content[0]?.type).toBe('text');
	const textContent =
		result?.content[0] && result.content[0].type === 'text'
			? result.content[0].text
			: '';
	expect(textContent).toContain('coworkers');
});

test('coworker_task rejects removed action aliases', async () => {
	const result = await handleCoworkerTool(
		'coworker_task',
		{ action: 'recentActivity', limit: 1 },
		{
			getProjectRoot: () => process.cwd(),
			getSessionId: () => undefined,
			getPrefStore: () => {
				throw new Error('unused');
			},
			ensureIndexer: async () => {
				throw new Error('unused');
			},
		},
	);

	expect(result?.isError).toBe(true);
	const textContent =
		result?.content[0] && result.content[0].type === 'text'
			? result.content[0].text
			: '';
	expect(textContent).toContain('Unsupported coworker action');
});

test('coworker observability respects an explicit state dir override', async () => {
	const runtime = new OpenCodeCoworkerRuntime(process.cwd());
	(runtime as any).capturePermissionEvent(
		'permission.requested',
		{
			id: 'perm_obs_1',
			message: 'Need write access',
			options: ['approve', 'deny'],
		},
		'ses_obs_1',
	);

	const activityPath = join(
		process.env.OMC_COWORKER_STATE_DIR!,
		'logs',
		'coworker',
		'opencode.jsonl',
	);
	expect(readFileSync(activityPath, 'utf8')).toContain('perm_obs_1');
});

test('coworker review timeout errors retain scoped review metadata', async () => {
	const runtime = getCodexCoworker(process.cwd());
	(runtime as any).runTask = async () => {
		throw new Error('Codex coworker task timed out after 240000ms');
	};

	const result = await handleCoworkerTool(
		'coworker_task',
		{
			action: 'review',
			target: 'codex',
			review_target: 'uncommittedChanges',
			paths: ['src/mcp/coworker/index.ts'],
			timeout_ms: 120000,
		},
		{
			getProjectRoot: () => process.cwd(),
			getSessionId: () => undefined,
			getPrefStore: () => {
				throw new Error('unused');
			},
			ensureIndexer: async () => {
				throw new Error('unused');
			},
		},
	);

	expect(result?.isError).toBe(true);
	const textContent =
		result?.content[0] && result.content[0].type === 'text'
			? result.content[0].text
			: '';
	const payload = JSON.parse(textContent);
	expect(payload.meta.review_mode).toBe('scoped-diff');
	expect(payload.meta.recommended_timeout_ms).toBeGreaterThanOrEqual(240000);
});

test('codex review timeout heuristic scales with diff size and clamps to limits', () => {
	expect(estimateCodexReviewTimeout({ files: 1, linesChanged: 10 })).toBe(135_900);
	expect(estimateCodexReviewTimeout({ files: 5, linesChanged: 2_000 })).toBe(375_000);
	expect(estimateCodexReviewTimeout({ files: 200, linesChanged: 20_000 })).toBe(480_000);
});

test('scoped codex review timeout heuristic scales with prompt size and binary sections', () => {
	expect(
		estimateCodexScopedPromptTimeout({
			files: 1,
			diffLines: 300,
			binarySections: 0,
			characters: 8000,
		}),
	).toBeGreaterThanOrEqual(240_000);
	expect(
		estimateCodexScopedPromptTimeout({
			files: 2,
			diffLines: 2000,
			binarySections: 1,
			characters: 120000,
		}),
	).toBeGreaterThan(300_000);
});

test('recommendCodexReviewTimeout clamps to scoped minimum when git stats are unavailable', () => {
	const tempRoot = mkdtempSync(join(tmpdir(), 'omc-codex-timeout-'));
	try {
		writeFileSync(join(tempRoot, 'file.ts'), 'const x = 1;\n', 'utf8');
		expect(
			recommendCodexReviewTimeout(
				tempRoot,
				{ type: 'custom', instructions: 'Review this file.' },
				120_000,
				['file.ts'],
			),
		).toBe(240_000);
	} finally {
		rmSync(tempRoot, { recursive: true, force: true });
	}
});

test('recommendCodexReviewTimeout applies prompt-aware sizing beyond uncommittedChanges', () => {
	const repoRoot = mkdtempSync(join(tmpdir(), 'omc-codex-repo-'));
	try {
		spawnSync('git', ['init'], { cwd: repoRoot, encoding: 'utf8' });
		spawnSync('git', ['config', 'user.email', 'test@example.com'], {
			cwd: repoRoot,
			encoding: 'utf8',
		});
		spawnSync('git', ['config', 'user.name', 'Test User'], {
			cwd: repoRoot,
			encoding: 'utf8',
		});
		writeFileSync(
			join(repoRoot, 'big.ts'),
			`${'export const value = "base";\n'.repeat(1000)}`,
			'utf8',
		);
		spawnSync('git', ['add', 'big.ts'], {
			cwd: repoRoot,
			encoding: 'utf8',
		});
		spawnSync('git', ['commit', '-m', 'init'], {
			cwd: repoRoot,
			encoding: 'utf8',
		});
		spawnSync('git', ['branch', '-M', 'main'], {
			cwd: repoRoot,
			encoding: 'utf8',
		});
		spawnSync('git', ['checkout', '-b', 'feature'], {
			cwd: repoRoot,
			encoding: 'utf8',
		});
		const largeXLine = `export const value = "${'x'.repeat(600)}";\n`;
		writeFileSync(
			join(repoRoot, 'big.ts'),
			largeXLine.repeat(1000),
			'utf8',
		);
		spawnSync('git', ['add', 'big.ts'], {
			cwd: repoRoot,
			encoding: 'utf8',
		});
		spawnSync('git', ['commit', '-m', 'binary update'], {
			cwd: repoRoot,
			encoding: 'utf8',
		});
		const largeYLine = `export const value = "${'y'.repeat(600)}";\n`;
		writeFileSync(
			join(repoRoot, 'big.ts'),
			largeYLine.repeat(1000),
			'utf8',
		);
		const custom = recommendCodexReviewTimeout(
			repoRoot,
			{ type: 'custom', instructions: 'Review this scoped diff.' },
			120_000,
			['big.ts'],
		);
		const baseBranch = recommendCodexReviewTimeout(
			repoRoot,
			{ type: 'baseBranch', branch: 'main' },
			120_000,
			['big.ts'],
		);
		expect(custom).toBeGreaterThan(240_000);
		expect(baseBranch).toBeGreaterThan(240_000);
	} finally {
		rmSync(repoRoot, { recursive: true, force: true });
	}
});

test('git shortstat parser extracts changed file and line counts', () => {
	expect(parseGitShortStat(' 3 files changed, 25 insertions(+), 7 deletions(-)')).toEqual({
		files: 3,
		linesChanged: 32,
	});
	expect(parseGitShortStat('')).toBeNull();
});

test('scoped codex review prompt includes scope, target, and diff block', () => {
	const prompt = buildScopedCodexReviewPrompt(
		process.cwd(),
		{ type: 'custom', instructions: 'Review only these files for correctness.' },
		['src/mcp/coworker/index.ts'],
		'List findings by severity.',
	);

	expect(prompt).toContain('Restrict the review to these paths: src/mcp/coworker/index.ts');
	expect(prompt).toContain('Review only these files for correctness.');
	expect(prompt).toContain('List findings by severity.');
});

test('scoped codex review on an initial repo preserves staged and unstaged sections without duplicating file counts', () => {
	const repoDir = mkdtempSync(join(tmpdir(), 'omc-codex-initial-repo-'));
	try {
		expect(spawnSync('git', ['init'], { cwd: repoDir, encoding: 'utf8' }).status).toBe(
			0,
		);
		const filePath = join(repoDir, 'src', 'index.ts');
		mkdirSync(join(repoDir, 'src'), { recursive: true });
		writeFileSync(filePath, 'export const value = 1;\n', 'utf8');
		expect(
			spawnSync('git', ['add', 'src/index.ts'], {
				cwd: repoDir,
				encoding: 'utf8',
			}).status,
		).toBe(0);
		writeFileSync(filePath, 'export const value = 2;\n', 'utf8');

		const prompt = buildScopedCodexReviewPrompt(
			repoDir,
			{ type: 'uncommittedChanges' },
			['src/index.ts'],
		);

		expect(prompt.match(/diff --git a\/src\/index\.ts b\/src\/index\.ts/g)?.length).toBe(2);
		expect(prompt).toContain('+export const value = 1;');
		expect(prompt).toContain('-export const value = 1;');
		expect(prompt).toContain('export const value = 2;');
	} finally {
		rmSync(repoDir, { recursive: true, force: true });
	}
});

test('scoped codex review on an initial repo includes empty files and preserves executable mode', () => {
	const repoDir = mkdtempSync(join(tmpdir(), 'omc-codex-empty-repo-'));
	try {
		expect(spawnSync('git', ['init'], { cwd: repoDir, encoding: 'utf8' }).status).toBe(
			0,
		);
		mkdirSync(join(repoDir, 'bin'), { recursive: true });
		mkdirSync(join(repoDir, 'src'), { recursive: true });
		const emptyFile = join(repoDir, 'src', 'empty.ts');
		const execFile = join(repoDir, 'bin', 'run.sh');
		writeFileSync(emptyFile, '', 'utf8');
		writeFileSync(execFile, '#!/bin/sh\necho hi\n', 'utf8');
		chmodSync(execFile, 0o755);
		expect(
			spawnSync('git', ['add', 'src/empty.ts', 'bin/run.sh'], {
				cwd: repoDir,
				encoding: 'utf8',
			}).status,
		).toBe(0);

		const prompt = buildScopedCodexReviewPrompt(
			repoDir,
			{ type: 'uncommittedChanges' },
			['src/empty.ts', 'bin/run.sh'],
		);

		expect(prompt).toContain('diff --git a/src/empty.ts b/src/empty.ts');
		expect(prompt).toContain('new file mode 100644');
		expect(prompt).toContain('diff --git a/bin/run.sh b/bin/run.sh');
		expect(prompt).toContain('new file mode 100755');
	} finally {
		rmSync(repoDir, { recursive: true, force: true });
	}
});

test('scoped codex review on an initial repo keeps staged-then-deleted files visible', () => {
	const repoDir = mkdtempSync(join(tmpdir(), 'omc-codex-deleted-repo-'));
	try {
		expect(spawnSync('git', ['init'], { cwd: repoDir, encoding: 'utf8' }).status).toBe(
			0,
		);
		const filePath = join(repoDir, 'ghost.txt');
		writeFileSync(filePath, 'ghost\n', 'utf8');
		expect(
			spawnSync('git', ['add', 'ghost.txt'], {
				cwd: repoDir,
				encoding: 'utf8',
			}).status,
		).toBe(0);
		rmSync(filePath, { force: true });

		const prompt = buildScopedCodexReviewPrompt(
			repoDir,
			{ type: 'uncommittedChanges' },
			['ghost.txt'],
		);

		expect(prompt).toContain('diff --git a/ghost.txt b/ghost.txt');
		expect(prompt).toContain('new file mode 100644');
		expect(prompt).toContain('deleted file mode 100644');
	} finally {
		rmSync(repoDir, { recursive: true, force: true });
	}
});

test('scoped codex review on an initial repo preserves binary file markers', () => {
	const repoDir = mkdtempSync(join(tmpdir(), 'omc-codex-binary-repo-'));
	try {
		expect(spawnSync('git', ['init'], { cwd: repoDir, encoding: 'utf8' }).status).toBe(
			0,
		);
		const filePath = join(repoDir, 'asset.bin');
		writeFileSync(filePath, Buffer.from([0, 159, 146, 150, 0, 1, 2, 3]));

		const prompt = buildScopedCodexReviewPrompt(
			repoDir,
			{ type: 'uncommittedChanges' },
			['asset.bin'],
		);

		expect(prompt).toContain('diff --git a/asset.bin b/asset.bin');
		expect(prompt).toContain('Binary files /dev/null and b/asset.bin differ');
	} finally {
		rmSync(repoDir, { recursive: true, force: true });
	}
});
