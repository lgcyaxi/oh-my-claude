import type { ToolContext, CallToolResult } from '../shared/types';
import type {
	Preference,
	PreferenceScope as PrefScope,
	PreferenceTrigger,
	PreferenceContext,
	PreferenceListOptions,
} from '../../shared/preferences';

export async function handlePreferenceTool(
	name: string,
	args: Record<string, unknown>,
	ctx: ToolContext,
): Promise<CallToolResult | undefined> {
	switch (name) {
		case 'add_preference': {
			const { title, content, scope, autoInject, trigger, tags } =
				args as {
					title: string;
					content: string;
					scope?: PrefScope;
					autoInject?: boolean;
					trigger?: PreferenceTrigger;
					tags?: string[];
				};

			if (!title || !content) {
				return {
					content: [
						{
							type: 'text',
							text: 'Error: title and content are required',
						},
					],
					isError: true,
				};
			}

			const store = ctx.getPrefStore();
			const result = store.create({
				title,
				content,
				scope,
				autoInject,
				trigger,
				tags,
			});

			if (!result.success) {
				return {
					content: [{ type: 'text', text: `Error: ${result.error}` }],
					isError: true,
				};
			}

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							created: true,
							id: result.data!.id,
							title: result.data!.title,
							scope: result.data!.scope,
							autoInject: result.data!.autoInject,
						}),
					},
				],
			};
		}

		case 'list_preferences': {
			const { scope, tags, autoInject, limit } =
				args as PreferenceListOptions;

			const store = ctx.getPrefStore();
			const prefs = store.list({ scope, tags, autoInject, limit });

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							count: prefs.length,
							preferences: prefs.map((p) => ({
								id: p.id,
								title: p.title,
								scope: p.scope,
								autoInject: p.autoInject,
								tags: p.tags,
								trigger: p.trigger,
								createdAt: p.createdAt,
								preview:
									p.content.slice(0, 200) +
									(p.content.length > 200 ? '...' : ''),
							})),
						}),
					},
				],
			};
		}

		case 'get_preference': {
			const { id } = args as { id: string };

			if (!id) {
				return {
					content: [{ type: 'text', text: 'Error: id is required' }],
					isError: true,
				};
			}

			const store = ctx.getPrefStore();
			const result = store.resolve(id);

			if (!result.success || !result.data) {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								found: false,
								error: result.error ?? 'Preference not found',
							}),
						},
					],
					isError: true,
				};
			}

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(result.data),
					},
				],
			};
		}

		case 'update_preference': {
			const { id, updates } = args as {
				id: string;
				updates: Partial<
					Pick<
						Preference,
						'title' | 'content' | 'autoInject' | 'trigger' | 'tags'
					>
				>;
			};

			if (!id || !updates) {
				return {
					content: [
						{
							type: 'text',
							text: 'Error: id and updates are required',
						},
					],
					isError: true,
				};
			}

			const store = ctx.getPrefStore();
			const resolved = store.resolve(id);
			if (!resolved.success || !resolved.data) {
				return {
					content: [
						{ type: 'text', text: `Error: ${resolved.error}` },
					],
					isError: true,
				};
			}

			const result = store.update(resolved.data.id, updates);

			if (!result.success) {
				return {
					content: [{ type: 'text', text: `Error: ${result.error}` }],
					isError: true,
				};
			}

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							updated: true,
							id: result.data!.id,
							title: result.data!.title,
							updatedAt: result.data!.updatedAt,
						}),
					},
				],
			};
		}

		case 'delete_preference': {
			const { id } = args as { id: string };

			if (!id) {
				return {
					content: [{ type: 'text', text: 'Error: id is required' }],
					isError: true,
				};
			}

			const store = ctx.getPrefStore();
			const resolved = store.resolve(id);
			if (!resolved.success || !resolved.data) {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								deleted: false,
								error: resolved.error ?? 'Preference not found',
							}),
						},
					],
					isError: true,
				};
			}

			const result = store.delete(resolved.data.id);

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							deleted: result.success,
							...(result.error && { error: result.error }),
						}),
					},
				],
				...(result.success ? {} : { isError: true }),
			};
		}

		case 'match_preferences': {
			const { prompt, category, keywords } = args as PreferenceContext;

			const store = ctx.getPrefStore();
			const matches = store.match({ prompt, category, keywords });

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							count: matches.length,
							matches: matches.map((m) => ({
								id: m.preference.id,
								title: m.preference.title,
								content: m.preference.content,
								score: m.score,
								matchedBy: m.matchedBy,
								matchedTerms: m.matchedTerms,
								tags: m.preference.tags,
							})),
						}),
					},
				],
			};
		}

		case 'preference_stats': {
			const store = ctx.getPrefStore();
			const stats = store.stats();

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(stats),
					},
				],
			};
		}

		default:
			return undefined;
	}
}
