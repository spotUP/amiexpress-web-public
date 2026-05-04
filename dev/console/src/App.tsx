import React, { useState, useEffect } from 'react';
import { Box, useInput, useApp, useStdout, useStdin } from 'ink';
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
import { LanguagesPage } from './components/tabs/LanguagesPage.js';
import { ProtocolsPage } from './components/tabs/ProtocolsPage.js';
import { ComputersPage } from './components/tabs/ComputersPage.js';
import { ScreenTypesPage } from './components/tabs/ScreenTypesPage.js';
import { DrivesPage } from './components/tabs/DrivesPage.js';
import { FileCheckersPage } from './components/tabs/FileCheckersPage.js';
import { SecurityPage } from './components/tabs/SecurityPage.js';
import { DoorInstallPage } from './components/tabs/DoorInstallPage.js';
import { ImportExportPage } from './components/tabs/ImportExportPage.js';
import { BatchEditorPage } from './components/tabs/BatchEditorPage.js';
import { GlobalWallPage } from './components/tabs/GlobalWallPage.js';
import { DeploymentPage } from './components/tabs/DeploymentPage.js';
import { InfoFilesPage } from './components/tabs/InfoFilesPage.js';
import { AmiXnetPage } from './components/tabs/AmiXnetPage.js';
import { OpChatSettingsPage } from './components/tabs/OpChatSettingsPage.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { RestartDialog } from './components/RestartDialog.js';
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
  // Phase C
  languages:       LanguagesPage,
  protocols:       ProtocolsPage,
  computers:       ComputersPage,
  'screen-types':  ScreenTypesPage,
  drives:          DrivesPage,
  'file-checkers': FileCheckersPage,
  security:        SecurityPage,
  // Phase D
  'door-install':  DoorInstallPage,
  'import-export': ImportExportPage,
  'batch-editor':  BatchEditorPage,
  'global-wall':   GlobalWallPage,
  // Phase E
  deployment:       DeploymentPage,
  'info-files':     InfoFilesPage,
  amixnet:          AmiXnetPage,
  'op-chat-settings': OpChatSettingsPage,
};

export function App({ username }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 24;
  const [activePage, setActivePage] = useState<string>(DEFAULT_PAGE);
  const [backendUp, setBackendUp] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showRestart, setShowRestart] = useState(false);
  const { stdin } = useStdin();

  // Ink 4.x's useInput swallows F-keys: parse-keypress sets `name='f2'` for
  // ESC-O-Q / ESC-[12~, but `nonAlphanumericKeys` includes those names and
  // forces `input=''`, while the public `key` shape exposes no f2 flag. So
  // useInput cannot see F2 at all. We attach a raw stdin listener instead
  // and look for the literal escape sequences our terminals emit (xterm /
  // tmux send `OQ`; vt220-style consoles send `[12~`).
  useEffect(() => {
    if (!stdin) return;
    // Don't call setRawMode(true) here. The useInput() hook below already
    // does it via Ink's ref-counted setRawMode, and an unmatched call from
    // here would prevent useInput's cleanup from restoring cooked mode on
    // exit — leaving the user's terminal in raw mode (LF without CR, no
    // line buffering) after the TUI quits.
    const onData = (chunk: Buffer | string) => {
      const s = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      // F2 raw sequences: xterm/tmux ESC-O-Q, vt220 ESC-[12~, linux ESC-[[B.
      // Use includes() so a chunk that bundles other bytes still matches.
      if (s.includes('OQ') || s.includes('[12~') || s.includes('[[B')) {
        setShowRestart(prev => !prev);
      }
    };
    stdin.on('data', onData);
    return () => { stdin.off('data', onData); };
  }, [stdin]);

  useInput((input, key) => {
    // Block other global hotkeys while a modal is open so the modal owns input.
    if (showRestart || showHelp) return;
    if (input === 'q' && !key.ctrl) exit();
    if (input === '?') setShowHelp(s => !s);
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
          {showRestart ? (
            <RestartDialog onClose={() => setShowRestart(false)} />
          ) : showHelp ? (
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
