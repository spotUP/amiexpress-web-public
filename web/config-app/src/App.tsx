import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { AppShell } from './components/AppShell/AppShell';
import { SkeletonRows } from './components/ui/states';
import { LEGACY_ROUTES } from './routes/legacy-routes';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { ActivityPage } from './pages/ActivityPage';
import { SystemConfigPage } from './pages/SystemConfigPage';
import { DoorsPage } from './pages/DoorsPage';
import { GlobalWallPage } from './pages/GlobalWallPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { SecurityPage } from './pages/SecurityPage';
import { UsersPage } from './pages/UsersPage';
import { LogsPage } from './pages/LogsPage';
import { StatisticsPage } from './pages/StatisticsPage';
import {
  ConferencesWorkspace,
  ConfigFilesWorkspace,
  HealthWorkspace,
  LookupTablesWorkspace,
  NodesWorkspace,
  OperatorChatWorkspace,
} from './pages/workspaces';

/**
 * The heavy leaves. Session Logs pulls in xterm and Import and Export pulls in
 * the upload and validation components; neither belongs in the bundle a sysop
 * downloads to look at the Overview. Operator Chat is lazy as well, inside its
 * own workspace.
 */
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

        {/* Live */}
        <Route path="activity" element={<ActivityPage />} />
        <Route path="nodes" element={<NodesWorkspace />} />
        <Route path="operator-chat" element={<OperatorChatWorkspace />} />

        {/* People */}
        <Route path="users" element={<UsersPage />} />
        <Route path="security" element={<SecurityPage />} />

        {/* Content */}
        <Route path="conferences" element={<ConferencesWorkspace />} />
        <Route path="doors" element={<DoorsPage />} />
        <Route path="globalwall" element={<GlobalWallPage />} />

        {/* System */}
        <Route path="system" element={<SystemConfigPage />} />
        <Route path="config-files" element={<ConfigFilesWorkspace />} />
        <Route path="lookup-tables" element={<LookupTablesWorkspace />} />
        <Route path="health" element={<HealthWorkspace />} />

        {/* Diagnostics */}
        <Route path="statistics" element={<StatisticsPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="session-logs" element={<LazyPage><SessionLogsPage /></LazyPage>} />
        <Route path="audit" element={<AuditLogPage />} />
        <Route path="import-export" element={<LazyPage><ImportExportPage /></LazyPage>} />

        {/*
          Permanent redirects for every destination folded into a tab, from one
          table so the router and the test read the same list.
        */}
        {LEGACY_ROUTES.map((route) => (
          <Route
            key={route.from}
            path={route.from}
            element={<Navigate to={`/admin/${route.to}`} replace />}
          />
        ))}

        {/* An unknown admin path lands on the Overview, not on a form. */}
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
