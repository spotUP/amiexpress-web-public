import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { SystemConfigPage } from './pages/SystemConfigPage';
import { NodesPage } from './pages/NodesPage';
import { ConferencesPage } from './pages/ConferencesPage';
import { DoorsPage } from './pages/DoorsPage';
import { GlobalWallPage } from './pages/GlobalWallPage';
import { LanguagesPage } from './pages/LanguagesPage';
import { ProtocolsPage } from './pages/ProtocolsPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { SecurityPage } from './pages/SecurityPage';
import { DrivesPage } from './pages/DrivesPage';
import { ComputersPage } from './pages/ComputersPage';
import { ScreenTypesPage } from './pages/ScreenTypesPage';
import { FileCheckersPage } from './pages/FileCheckersPage';
import { UsersPage } from './pages/UsersPage';
import { ImportExportPage } from './pages/ImportExportPage';
import { DeploymentPage } from './pages/DeploymentPage';
import { LogsPage } from './pages/LogsPage';
import { BatchEditorPage } from './pages/BatchEditorPage';
import { SessionLogsPage } from './pages/SessionLogsPage';
import { HealthCheckPage } from './pages/HealthCheckPage';
import { OperatorChatPage } from './pages/OperatorChatPage';
import { OperatorChatSettingsPage } from './pages/OperatorChatSettingsPage';
import { AmiXnetPage } from './pages/AmiXnetPage';
import { SystemFilesPage } from './pages/SystemFilesPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  // TEMPORARY: Bypass authentication if VITE_BYPASS_AUTH is set
  // This allows emergency access when database is empty and no sysop exists
  // REMOVE THIS AFTER CREATING INITIAL SYSOP USER
  const bypassAuth = import.meta.env.VITE_BYPASS_AUTH === 'true';

  if (bypassAuth) {
    console.warn('[SECURITY] Authentication bypassed via VITE_BYPASS_AUTH - REMOVE THIS IN PRODUCTION');
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bbs-bg">
        <div className="text-bbs-text">Loading...</div>
      </div>
    );
  }

  return (isAuthenticated || bypassAuth) ? <>{children}</> : <Navigate to="/admin/login" />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin/login" replace />} />
      <Route path="/login" element={<Navigate to="/admin/login" replace />} />
      <Route path="/admin/login" element={<LoginPage />} />

      <Route
        path="/admin/*"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="system" replace />} />
        <Route path="system" element={<SystemConfigPage />} />
        <Route path="health" element={<HealthCheckPage />} />
        <Route path="nodes" element={<NodesPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="conferences" element={<ConferencesPage />} />
        <Route path="doors" element={<DoorsPage />} />
        <Route path="globalwall" element={<GlobalWallPage />} />
        <Route path="languages" element={<LanguagesPage />} />
        <Route path="protocols" element={<ProtocolsPage />} />
        <Route path="security" element={<SecurityPage />} />
        <Route path="drives" element={<DrivesPage />} />
        <Route path="computers" element={<ComputersPage />} />
        <Route path="screen-types" element={<ScreenTypesPage />} />
        <Route path="file-checkers" element={<FileCheckersPage />} />
        <Route path="deployment" element={<DeploymentPage />} />
        <Route path="import-export" element={<ImportExportPage />} />
        <Route path="audit" element={<AuditLogPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="session-logs" element={<SessionLogsPage />} />
        <Route path="batches" element={<BatchEditorPage />} />
        <Route path="operator-chat" element={<OperatorChatPage />} />
        <Route path="operator-chat-settings" element={<OperatorChatSettingsPage />} />
        <Route path="amixnet" element={<AmiXnetPage />} />
        <Route path="system-files" element={<SystemFilesPage />} />
        <Route path="*" element={<Navigate to="system" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
