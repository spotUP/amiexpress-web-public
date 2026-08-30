import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { AppShell } from './components/AppShell/AppShell';
import { SkeletonRows } from './components/ui/states';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { ActivityPage } from './pages/ActivityPage';
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
import { DeploymentPage } from './pages/DeploymentPage';
import { LogsPage } from './pages/LogsPage';
import { BatchEditorPage } from './pages/BatchEditorPage';
import { HealthCheckPage } from './pages/HealthCheckPage';
import { StatisticsPage } from './pages/StatisticsPage';
import { NodeControlPage } from './pages/NodeControlPage';
import { OperatorChatSettingsPage } from './pages/OperatorChatSettingsPage';
import { AmiXnetPage } from './pages/AmiXnetPage';
import { SystemFilesPage } from './pages/SystemFilesPage';
import { InfoEditorPage } from './pages/InfoEditorPage';

/**
 * The heavy leaves. Operator Chat and Session Logs each pull in xterm, and
 * Import and Export pulls in the upload and validation components; none of
 * them belong in the bundle a sysop downloads to look at the Overview.
 */
const OperatorChatPage = lazy(() =>
  import('./pages/OperatorChatPage').then((module) => ({ default: module.OperatorChatPage }))
);
const SessionLogsPage = lazy(() =>
  import('./pages/SessionLogsPage').then((module) => ({ default: module.SessionLogsPage }))
);
const ImportExportPage = lazy(() =>
  import('./pages/ImportExportPage').then((module) => ({ default: module.ImportExportPage }))
);

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<SkeletonRows rows={6} />}>{children}</Suspense>;
}

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
      <div className="min-h-screen bg-surface-0 p-5">
        <SkeletonRows rows={8} />
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
            <AppShell />
          </PrivateRoute>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="system" element={<SystemConfigPage />} />
        <Route path="health" element={<HealthCheckPage />} />
        <Route path="statistics" element={<StatisticsPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="node-control" element={<NodeControlPage />} />
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
        <Route path="import-export" element={<LazyPage><ImportExportPage /></LazyPage>} />
        <Route path="audit" element={<AuditLogPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="session-logs" element={<LazyPage><SessionLogsPage /></LazyPage>} />
        <Route path="batches" element={<BatchEditorPage />} />
        <Route path="operator-chat" element={<LazyPage><OperatorChatPage /></LazyPage>} />
        <Route path="operator-chat-settings" element={<OperatorChatSettingsPage />} />
        <Route path="amixnet" element={<AmiXnetPage />} />
        <Route path="system-files" element={<SystemFilesPage />} />
        <Route path="tooltypes" element={<InfoEditorPage />} />
        {/* An unknown admin path lands on the Overview, not on a form. */}
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
