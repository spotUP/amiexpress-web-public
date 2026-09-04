import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { AppShell } from './components/AppShell/AppShell';
import { SkeletonRows } from './components/ui/states';
import { LEGACY_ROUTES } from './routes/legacy-routes';
import { hardcodedMinLevel } from './components/AppShell/nav-config';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { ActivityPage } from './pages/ActivityPage';
import { SystemConfigPage } from './pages/SystemConfigPage';
import { DoorsPage } from './pages/DoorsPage';
import { ScreenFilesPage } from './pages/ScreenFilesPage';
import { AdminRolesPage } from './pages/AdminRolesPage';
import { SpriteManagerPage } from './pages/SpriteManagerPage';
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-0 p-5">
        <SkeletonRows rows={8} />
      </div>
    );
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/admin/login" />;
}

/** Route guard that checks the live admin permissions for the current path. */
function SysopRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, secLevel, adminPerms } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-0 p-5">
        <SkeletonRows rows={8} />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/admin/login" />;

  // Extract the path segment after /admin/ to look up live permissions
  const routeKey = location.pathname.replace(/^\/admin\//, '').split('/')[0];
  // Live perms loaded from API (may be empty for non-sysop users who get 403).
  // Fall back to the hardcoded nav-config minLevel when live perms are absent.
  const minLevel = routeKey in adminPerms ? adminPerms[routeKey] : hardcodedMinLevel(routeKey);

  if (secLevel < minLevel) return <Navigate to="/admin/screens" />;
  return <>{children}</>;
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

        {/* Live — sysop-only except Overview */}
        <Route path="activity" element={<SysopRoute><ActivityPage /></SysopRoute>} />
        <Route path="screens" element={<ScreenFilesPage />} />
        <Route path="nodes" element={<SysopRoute><NodesWorkspace /></SysopRoute>} />
        <Route path="operator-chat" element={<SysopRoute><OperatorChatWorkspace /></SysopRoute>} />

        {/* People — sysop-only */}
        <Route path="users" element={<SysopRoute><UsersPage /></SysopRoute>} />
        <Route path="security" element={<SysopRoute><SecurityPage /></SysopRoute>} />
        <Route path="admin-roles" element={<SysopRoute><AdminRolesPage /></SysopRoute>} />

        {/* Content — screens editor accessible at 100+, rest sysop-only */}
        <Route path="conferences" element={<SysopRoute><ConferencesWorkspace /></SysopRoute>} />
        <Route path="doors" element={<SysopRoute><DoorsPage /></SysopRoute>} />
        <Route path="sprite-manager" element={<SysopRoute><SpriteManagerPage /></SysopRoute>} />

        {/* System — sysop-only */}
        <Route path="system" element={<SysopRoute><SystemConfigPage /></SysopRoute>} />
        <Route path="config-files" element={<SysopRoute><ConfigFilesWorkspace /></SysopRoute>} />
        <Route path="lookup-tables" element={<SysopRoute><LookupTablesWorkspace /></SysopRoute>} />
        <Route path="health" element={<SysopRoute><HealthWorkspace /></SysopRoute>} />

        {/* Diagnostics — sysop-only */}
        <Route path="statistics" element={<SysopRoute><StatisticsPage /></SysopRoute>} />
        <Route path="logs" element={<SysopRoute><LogsPage /></SysopRoute>} />
        <Route path="session-logs" element={<SysopRoute><LazyPage><SessionLogsPage /></LazyPage></SysopRoute>} />
        <Route path="audit" element={<SysopRoute><AuditLogPage /></SysopRoute>} />
        <Route path="import-export" element={<SysopRoute><LazyPage><ImportExportPage /></LazyPage></SysopRoute>} />

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
