import { useState, useEffect, useCallback } from 'react';
import {
	getMemoryModelConfig,
	setMemoryModel,
	resetMemoryModel,
	getAvailableProviders,
	type MemoryModelConfig,
	type ProviderInfo,
} from '../lib/api';

interface MemoryModelPickerProps {
	controlPort: number;
}

export function MemoryModelPicker({ controlPort }: MemoryModelPickerProps) {
	const [config, setConfig] = useState<MemoryModelConfig | null>(null);
	const [providers, setProviders] = useState<ProviderInfo[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [updating, setUpdating] = useState(false);

	const refresh = useCallback(async () => {
		try {
			const [cfg, provs] = await Promise.all([
				getMemoryModelConfig(controlPort),
				getAvailableProviders(controlPort),
			]);
			setConfig(cfg);
			setProviders(provs);
			setError(null);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Failed to load');
		} finally {
			setLoading(false);
		}
	}, [controlPort]);

	useEffect(() => {
		refresh();
		const interval = setInterval(refresh, 5000);
		return () => clearInterval(interval);
	}, [refresh]);

	const handleSelect = async (provider: string, model: string) => {
		setUpdating(true);
		try {
			const result = await setMemoryModel(controlPort, provider, model);
			setConfig(result);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Failed to set');
		} finally {
			setUpdating(false);
		}
	};

	const handleReset = async () => {
		setUpdating(true);
		try {
			const result = await resetMemoryModel(controlPort);
			setConfig(result);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Failed to reset');
		} finally {
			setUpdating(false);
		}
	};

	if (loading) {
		return (
			<div className='px-3 py-2 text-xs text-gray-500'>
				Loading memory config...
			</div>
		);
	}

	if (error) {
		return (
			<div className='px-3 py-2 text-xs text-red-400'>
				Memory AI: {error}
			</div>
		);
	}

	const sourceLabel =
		config?.source === 'runtime'
			? 'runtime override'
			: config?.source === 'config'
				? 'config file'
				: 'auto (passthrough)';

	const isAuto = !config?.provider;
	const currentDisplay = isAuto
		? 'Auto (Anthropic passthrough)'
		: `${config?.provider} / ${config?.model}`;

	return (
		<div className='border-t border-white/[0.06] px-3 py-2'>
			<div className='flex items-center justify-between mb-2'>
				<span className='text-[11px] font-medium text-gray-400'>
					Memory AI Model
				</span>
				<span className='text-[10px] text-gray-600'>{sourceLabel}</span>
			</div>

			<div className='text-xs text-gray-300 mb-2 px-1 py-1 bg-white/[0.03] rounded'>
				{currentDisplay}
			</div>

			<div className='space-y-1 max-h-40 overflow-y-auto'>
				{/* Auto option */}
				<button
					onClick={handleReset}
					disabled={updating || isAuto}
					className={`w-full text-left text-[11px] px-2 py-1 rounded transition-colors ${
						isAuto
							? 'bg-blue-500/20 text-blue-300'
							: 'text-gray-400 hover:bg-white/5 hover:text-gray-300'
					} disabled:opacity-50`}>
					Auto (passthrough)
				</button>

				{/* Provider/model options */}
				{providers.map((p) =>
					p.models.slice(0, 3).map((m) => {
						const isActive =
							config?.provider === p.name &&
							config?.model === m.id;
						return (
							<button
								key={`${p.name}/${m.id}`}
								onClick={() => handleSelect(p.name, m.id)}
								disabled={updating || isActive}
								className={`w-full text-left text-[11px] px-2 py-1 rounded transition-colors ${
									isActive
										? 'bg-blue-500/20 text-blue-300'
										: 'text-gray-400 hover:bg-white/5 hover:text-gray-300'
								} disabled:opacity-50`}>
								{m.label || m.id}
								<span className='text-gray-600 ml-1'>
									({p.name})
								</span>
							</button>
						);
					}),
				)}
			</div>
		</div>
	);
}
