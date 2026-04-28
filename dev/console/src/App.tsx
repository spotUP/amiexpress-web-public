import React, { useState, useEffect } from 'react';
import { Box, useInput, useApp, useStdout } from 'ink';
import { Header } from './components/Header.js';
import { Sidebar } from './components/Sidebar.js';
import { Footer } from './components/Footer.js';
import { DashboardTab } from './components/tabs/DashboardTab.js';
import { NodesTab } from './components/tabs/NodesTab.js';
import { UsersTab } from './components/tabs/UsersTab.js';
import { ConfsTab } from './components/tabs/ConfsTab.js';
import { CallersTab } from './components/tabs/CallersTab.js';
import { LogsTab } from './components/tabs/LogsTab.js';
import { DoorsTab } from './components/tabs/DoorsTab.js';
import { SystemTab } from './components/tabs/SystemTab.js';
import { SystemConfigPage } from './components/tabs/SystemConfigPage.js';
import { HealthCheckPage } from './components/tabs/HealthCheckPage.js';
import { AuditLogPage } from './components/tabs/AuditLogPage.js';
import { SessionLogsPage } from './components/tabs/SessionLogsPage.js';
import { OperatorChatPage } from './components/tabs/OperatorChatPage.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { DEFAULT_PAGE } from './pages/registry.js';
import { getNodes } from './api/client.js';

interface Props {
  username: string;
}

// Map page id → component. Keep separate from registry.ts to avoid pulling
// every tab module into the registry (which is read by the Sidebar even when
// some pages aren't implemented yet).
const PAGE_COMPONENTS: Record<string, React.FC | undefined> = {
  dashboard:      DashboardTab,
  nodes:          NodesTab,
  users:          UsersTab,
  confs:          ConfsTab,
  callers:        CallersTab,
  logs:           LogsTab,
  doors:          DoorsTab,
  system:         SystemTab,
  // Phase B
  'system-config': SystemConfigPage,
  health:          HealthCheckPage,
  audit:           AuditLogPage,
  sessions:        SessionLogsPage,
  'op-chat':       OperatorChatPage,
};

export function App({ username }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 24;
  const [activePage, setActivePage] = useState<string>(DEFAULT_PAGE);
  const [backendUp, setBackendUp] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useInput((input, key) => {
    if (input === 'q' && !key.ctrl) exit();
    if (input === '?') setShowHelp(s => !s);
    if (key.escape && showHelp) setShowHelp(false);
  });

  useEffect(() => {
    async function checkBackend() {
      try { await getNodes(); setBackendUp(true); }
      catch { setBackendUp(false); }
    }
    checkBackend();
    const id = setInterval(checkBackend, 10_000);
    return () => clearInterval(id);
  }, []);

  const ActiveComponent = PAGE_COMPONENTS[activePage];

  // Layout:
  //   row 1-4         Header (full width)
  //   rows 5..H-3     Sidebar (left ~22 cols) | Content (rest)
  //   rows H-2..H     Footer (full width)
  // Pinning the root box height to termHeight so flexGrow inside the middle
  // row pushes Footer to the actual bottom.
  return (
    <Box flexDirection="column" height={termHeight}>
      <Header username={username} backendUp={backendUp} previewUp={true} watchUp={true} />
      <Box flexDirection="row" flexGrow={1}>
        <Sidebar activePageId={activePage} onSelect={setActivePage} />
        <Box flexGrow={1} flexDirection="column" paddingX={1}>
          {showHelp ? (
            <HelpOverlay activePageId={activePage} onClose={() => setShowHelp(false)} />
          ) : ActiveComponent ? (
            <ActiveComponent />
          ) : (
            <Box paddingY={2}>
              <></>
            </Box>
          )}
        </Box>
      </Box>
      <Footer activePageId={activePage} />
    </Box>
  );
}
