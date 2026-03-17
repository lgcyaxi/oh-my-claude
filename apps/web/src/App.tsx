import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import Sidebar from './components/Sidebar';
import DashboardPage from './pages/DashboardPage';
import ModelsPage from './pages/ModelsPage';
import ProvidersPage from './pages/ProvidersPage';
import SwitchPage from './pages/SwitchPage';
import SessionsPage from './pages/SessionsPage';
import ConversationPage from './pages/ConversationPage';
import SettingsPage from './pages/SettingsPage';
import MemoryPage from './pages/MemoryPage';
import CcMemoryPage from './pages/CcMemoryPage';
import PreferencesPage from './pages/PreferencesPage';

export default function App() {
  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="/sessions/:folder/:id" element={<ConversationPage />} />
            <Route path="/memory" element={<MemoryPage />} />
            <Route path="/cc-memory" element={<CcMemoryPage />} />
            <Route path="/models" element={<ModelsPage />} />
            <Route path="/providers" element={<ProvidersPage />} />
            <Route path="/switch" element={<SwitchPage />} />
            <Route path="/preferences" element={<PreferencesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </ToastProvider>
  );
}
