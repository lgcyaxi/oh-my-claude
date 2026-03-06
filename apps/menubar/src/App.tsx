import { useState, useEffect } from 'react';
import { useSessions } from './hooks/useSessions';
import { useSwitch } from './hooks/useSwitch';
import { SessionList } from './components/SessionList';
import { MemoryModelPicker } from './components/MemoryModelPicker';
import { getVersion } from './lib/api';

function App() {
	const { sessions, loading, refresh } = useSessions(2000);
	const { doSwitch, doRevert, switching } = useSwitch(refresh);
	const [version, setVersion] = useState<string>('');

	useEffect(() => {
		getVersion()
			.then(setVersion)
			.catch(() => {});
	}, []);

	return (
		<div className='h-screen flex flex-col'>
			{/* Header */}
			<div className='px-4 py-3 border-b border-white/[0.06] flex items-center justify-between shrink-0'>
				<div>
					<h1 className='text-sm font-semibold text-gray-100'>
						oh-my-claude
						{version && (
							<span className='ml-1.5 text-[10px] font-normal text-gray-500'>
								{version}
							</span>
						)}
					</h1>
					<p className='text-[10px] text-gray-500 mt-0.5'>
						{sessions.length} session
						{sessions.length !== 1 ? 's' : ''} active
					</p>
				</div>
				<button
					onClick={refresh}
					className='text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded hover:bg-white/5'>
					Refresh
				</button>
			</div>

			{/* Session list */}
			<div className='flex-1 overflow-y-auto px-3 py-2'>
				{loading ? (
					<div className='flex items-center justify-center py-12 text-gray-500 text-sm'>
						Loading...
					</div>
				) : (
					<SessionList
						sessions={sessions}
						switching={switching}
						onSwitch={(controlPort, sessionId, provider, model) =>
							doSwitch(controlPort, sessionId, provider, model)
						}
						onRevert={(controlPort, sessionId) =>
							doRevert(controlPort, sessionId)
						}
					/>
				)}
			</div>

			{/* Memory AI Model Picker — uses first session's control port */}
			{sessions.length > 0 && (
				<MemoryModelPicker controlPort={sessions[0].controlPort} />
			)}

			{/* Footer */}
			<div className='px-4 py-2 border-t border-white/[0.06] text-[10px] text-gray-600 shrink-0'>
				Live model switching via proxy control API
			</div>
		</div>
	);
}

export default App;
