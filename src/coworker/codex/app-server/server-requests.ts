import type { RpcTransport } from '../transport';
import type { ConversationSession } from '../conversation';
import type { CodexObservability } from '../observability';
import type { CoworkerTaskEvent } from '../../types';

const KNOWN_SERVER_REQUESTS = new Set([
	'item/commandExecution/requestApproval',
	'item/fileChange/requestApproval',
	'item/tool/requestUserInput',
	'execCommandApproval',
	'applyPatchApproval',
]);

export async function handleCodexServerRequest(args: {
	id: number;
	method: string;
	params: unknown;
	transport: RpcTransport | null;
	session: ConversationSession;
	observability: CodexObservability;
	emitActivity: (
		event: Omit<CoworkerTaskEvent, 'target' | 'timestamp'>,
	) => void;
}): Promise<void> {
	if (!KNOWN_SERVER_REQUESTS.has(args.method)) {
		if (args.transport) {
			await args.transport.respondError(
				args.id,
				-32601,
				`Unsupported server request: ${args.method}`,
			);
		}
		return;
	}

	args.session.registerApproval(
		args.id,
		args.method,
		args.params,
		args.observability,
		args.emitActivity,
	);
}
