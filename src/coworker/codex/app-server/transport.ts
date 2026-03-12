import type { RpcTransport } from '../transport';
import type { ConversationSession } from '../conversation';
import type { CodexObservability } from '../observability';
import type { CoworkerTaskEvent } from '../../types';
import type { InitializeParams, InitializeResponse } from '../protocol';
import type { AskForApproval } from '../protocol/v2';

export function attachCodexTransport(args: {
	transport: RpcTransport;
	session: ConversationSession;
	observability: CodexObservability;
	emitActivity: (
		event: Omit<CoworkerTaskEvent, 'target' | 'timestamp'>,
	) => void;
	handleServerRequest: (
		id: number,
		method: string,
		params: unknown,
	) => Promise<void>;
}): void {
	args.transport.attach(
		(method, params) => {
			args.session.handleNotification(
				method,
				params,
				args.observability,
				args.emitActivity,
			);
		},
		async (id, method, params) => {
			await args.handleServerRequest(id, method, params);
		},
	);
}

export async function initializeCodexSession(args: {
	transport: RpcTransport;
	session: ConversationSession;
	projectPath: string;
	approvalPolicy: AskForApproval;
}): Promise<void> {
	const initializeParams: InitializeParams & { protocolVersion: string } = {
		protocolVersion: '2024-11-05',
		capabilities: {
			experimentalApi: false,
		},
		clientInfo: {
			name: 'oh-my-claude',
			title: null,
			version: '1.0.0',
		},
	};
	await (args.transport.send(
		'initialize',
		initializeParams,
	) as Promise<InitializeResponse>);

	await args.session.checkAuth(args.transport);
	await args.session.initThread(
		args.transport,
		args.projectPath,
		args.approvalPolicy,
	);
}
