import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import Sidebar from './components/Sidebar';
import DashboardPage from './pages/DashboardPage';
import ModelsPage from './pages/ModelsPage';
import ProvidersPage from './pages/ProvidersPage';
import SwitchPage from './pages/SwitchPage';

export default function App() {
  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/models" element={<ModelsPage />} />
            <Route path="/providers" element={<ProvidersPage />} />
            <Route path="/switch" element={<SwitchPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </ToastProvider>
  );
}
