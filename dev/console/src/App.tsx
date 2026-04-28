import React, { useState, useEffect } from 'react';
import { Box, useInput, useApp, useStdout } from 'ink';
import { Header } from './components/Header.js';
import { TabBar, type TabName } from './components/TabBar.js';
import { Footer } from './components/Footer.js';
import { DashboardTab } from './components/tabs/DashboardTab.js';
import { NodesTab } from './components/tabs/NodesTab.js';
import { UsersTab } from './components/tabs/UsersTab.js';
import { ConfsTab } from './components/tabs/ConfsTab.js';
import { CallersTab } from './components/tabs/CallersTab.js';
import { LogsTab } from './components/tabs/LogsTab.js';
import { DoorsTab } from './components/tabs/DoorsTab.js';
import { SystemTab } from './components/tabs/SystemTab.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { getNodes } from './api/client.js';

interface Props {
  username: string;
}

export function App({ username }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 24;
  const [activeTab, setActiveTab] = useState<TabName>('Dashboard');
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

  // Pin the root box to the exact terminal height so flexGrow inside
  // pushes Footer to the very bottom row. Without this, Ink's `height="100%"`
  // collapses to content size and Footer renders just below the tab content
  // — which breaks any click-row math that assumes a fixed bottom location.
  return (
    <Box flexDirection="column" height={termHeight}>
      <Header username={username} backendUp={backendUp} previewUp={true} watchUp={true} />
      <TabBar active={activeTab} onChange={setActiveTab} />
      <Box flexGrow={1} flexDirection="column" paddingX={1}>
        {showHelp ? (
          <HelpOverlay activeTab={activeTab} onClose={() => setShowHelp(false)} />
        ) : (
          <>
            {activeTab === 'Dashboard' && <DashboardTab />}
            {activeTab === 'Nodes'     && <NodesTab />}
            {activeTab === 'Users'     && <UsersTab />}
            {activeTab === 'Confs'     && <ConfsTab />}
            {activeTab === 'Callers'   && <CallersTab />}
            {activeTab === 'Logs'      && <LogsTab />}
            {activeTab === 'Doors'     && <DoorsTab />}
            {activeTab === 'System'    && <SystemTab />}
          </>
        )}
      </Box>
      <Footer activeTab={activeTab} />
    </Box>
  );
}
