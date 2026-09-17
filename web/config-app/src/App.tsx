import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { AppShell } from './components/AppShell/AppShell';
import { SkeletonRows, EmptyState } from './components/ui/states';
import { LEGACY_ROUTES } from './routes/legacy-routes';
import { routeAccess, routeKeyOf } from './components/AppShell/route-access';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { ActivityPage } from './pages/ActivityPage';
import { SystemConfigPage } from './pages/SystemConfigPage';
import { DoorsPage } from './pages/DoorsPage';
import { AdminRolesPage } from './pages/AdminRolesPage';
import { SpriteManagerPage } from './pages/SpriteManagerPage';
import { BullsInfoPage } from './pages/BullsInfoPage';
import { LoginSequencePage } from './pages/LoginSequencePage';
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
  ScreensWorkspace,
} from './pages/workspaces';
import { ScreenThemesPage } from './pages/ScreenThemesPage';
import { ScreenHealthPage } from './pages/ScreenHealthPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { CoSysopPersonasPage } from './pages/CoSysopPersonasPage';
import { BotPage } from './pages/BotPage';

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

/**
 * Route guard: the live admin permissions, then the compiled-in nav floor.
 *
 * Named for what it does rather than for one level - it has never been
 * sysop-only, and calling it SysopRoute is why `screens`, at level 100, was
 * left out of it. The decision itself lives in `route-access.ts`, pure, so the
 * three outcomes can be tested without a router: allow, redirect, and REFUSE.
 *
 * Refuse is the one this used to lack. Redirecting always sent a refused
 * account to Screens, which is fine until the route being refused IS Screens -
 * then it is a loop. See `a-denied-route-does-not-bounce-forever.test.ts`.
 */
function LevelRoute({ children }: { children: React.ReactNode }) {
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

  const access = routeAccess(routeKeyOf(location.pathname), secLevel, adminPerms);
  if (access.kind === 'allow') return <>{children}</>;
  if (access.kind === 'redirect') return <Navigate to={access.to} />;

  return (
    <div className="min-h-screen bg-surface-0 p-5">
      <EmptyState message={access.reason} />
    </div>
  );
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
        {/* Guarded like every other Live destination: the index is the
            Overview, and a caller below its level lands on Screens instead.
            Unguarded, a level-100 screen editor who typed /admin got the
            Overview's furniture with 403s behind every panel. */}
        <Route index element={<LevelRoute><OverviewPage /></LevelRoute>} />

        {/* Live — sysop-only except Overview */}
        <Route path="activity" element={<LevelRoute><ActivityPage /></LevelRoute>} />
        {/* Screens and themes are one subject and one page; level 100, because
            an artist needs both halves - one names the theme, the other draws
            its screens. */}
        <Route path="screens" element={<LevelRoute><ScreensWorkspace /></LevelRoute>} />
        {/* Themes is a destination of its own: a theme is a SET of screens
            with an owner, a status and a board default - what a sysop
            administers - while /admin/screens is where the art is drawn.
            Nested as a tab it shared one `?tab=` with the studio and could
            not be linked to at all. */}
        <Route path="themes" element={<LevelRoute><ScreenThemesPage /></LevelRoute>} />
        {/* The board's audit, not an artist's view: 1,155 files, what nothing
            reads, what is only codes, what drifted across its copies. It was
            six tabs among eleven on the page an artist opens. */}
        <Route path="screen-health" element={<LevelRoute><ScreenHealthPage /></LevelRoute>} />
        <Route path="nodes" element={<LevelRoute><NodesWorkspace /></LevelRoute>} />
        <Route path="operator-chat" element={<LevelRoute><OperatorChatWorkspace /></LevelRoute>} />
        <Route path="operator-chat/personas" element={<LevelRoute><CoSysopPersonasPage /></LevelRoute>} />
        <Route path="notifications" element={<LevelRoute><NotificationsPage /></LevelRoute>} />

        {/* Bot plugins — one static route per bot (WHIP first). The generic
            BotPage renders from the manifest; uninstalled bots get an empty
            state, and the sidebar hides them, so non-bot sysops see nothing. */}
        <Route path="bots/whip" element={<LevelRoute><BotPage pluginId="whip" /></LevelRoute>} />

        {/* People — sysop-only */}
        <Route path="users" element={<LevelRoute><UsersPage /></LevelRoute>} />
        <Route path="security" element={<LevelRoute><SecurityPage /></LevelRoute>} />
        <Route path="admin-roles" element={<LevelRoute><AdminRolesPage /></LevelRoute>} />

        {/* Content — screens editor accessible at 100+, rest sysop-only */}
        <Route path="conferences" element={<LevelRoute><ConferencesWorkspace /></LevelRoute>} />
        <Route path="doors" element={<LevelRoute><DoorsPage /></LevelRoute>} />
        <Route path="sprite-manager" element={<LevelRoute><SpriteManagerPage /></LevelRoute>} />
        <Route path="login-sequence" element={<LevelRoute><LoginSequencePage /></LevelRoute>} />
        <Route path="bulls" element={<LevelRoute><BullsInfoPage /></LevelRoute>} />

        {/* System — sysop-only */}
        <Route path="system" element={<LevelRoute><SystemConfigPage /></LevelRoute>} />
        <Route path="config-files" element={<LevelRoute><ConfigFilesWorkspace /></LevelRoute>} />
        <Route path="lookup-tables" element={<LevelRoute><LookupTablesWorkspace /></LevelRoute>} />
        <Route path="health" element={<LevelRoute><HealthWorkspace /></LevelRoute>} />

        {/* Diagnostics — sysop-only */}
        <Route path="statistics" element={<LevelRoute><StatisticsPage /></LevelRoute>} />
        <Route path="logs" element={<LevelRoute><LogsPage /></LevelRoute>} />
        <Route path="session-logs" element={<LevelRoute><LazyPage><SessionLogsPage /></LazyPage></LevelRoute>} />
        <Route path="audit" element={<LevelRoute><AuditLogPage /></LevelRoute>} />
        <Route path="import-export" element={<LevelRoute><LazyPage><ImportExportPage /></LazyPage></LevelRoute>} />

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
