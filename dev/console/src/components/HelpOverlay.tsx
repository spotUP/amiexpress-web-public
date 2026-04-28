import React, { useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { TabName } from './TabBar.js';

const HELP: Record<TabName, Array<[string, string]>> = {
  Dashboard: [
    ['—', 'Live stats panel — auto-refreshes every 10 s'],
    ['—', 'Sparkline shows calls over the last 24 h'],
  ],
  Nodes: [
    ['↑↓', 'Select a node'],
    ['k',  'Kick the selected user'],
    ['c',  'Open chat to selected node'],
    ['click', 'Click a row to select it'],
  ],
  Users: [
    ['↑↓', 'Scroll users'],
    ['e',  'Edit security level'],
    ['b',  'Ban (set SL=0)'],
    ['d',  'Delete user'],
    ['/',  'Search by username'],
    ['r',  'Refresh from server'],
    ['click', 'Click a row to select it'],
  ],
  Confs: [
    ['↑↓', 'Scroll conferences'],
    ['t',  'Toggle enabled/disabled'],
    ['h',  'Health check'],
    ['f',  'Auto-fix issues'],
    ['r',  'Refresh from server'],
  ],
  Callers: [
    ['—',  'Read-only — auto-refreshes every 30 s'],
  ],
  Logs: [
    ['b',  'Backend log'],
    ['p',  'Preview log'],
    ['6',  '68K door log'],
    ['click', 'Click Backend / Preview / 68K Door at the top to switch'],
  ],
  Doors: [
    ['↑↓←→', 'Navigate the door grid'],
    ['r',  'Refresh from server'],
    ['R',  'Reload all doors (confirmation)'],
    ['click', 'Click any door cell to select'],
  ],
  System: [
    ['n',  'Switch to Nodes panel'],
    ['c',  'Switch to Config panel'],
    ['↑↓', 'Select a node (Nodes panel)'],
    ['s',  'Start the selected node'],
    ['x',  'Exit the selected node'],
    ['v',  'Reserve the selected node'],
    ['o',  'Sysop-login on the selected node'],
    ['Q',  'Toggle quiet mode'],
  ],
};

const GLOBAL: Array<[string, string]> = [
  ['1-8', 'Switch tabs'],
  ['←/→', 'Switch tabs (left/right)'],
  ['?',   'Toggle this help'],
  ['q',   'Quit the console'],
  ['esc', 'Close any dialog/help'],
  ['click', 'Tabs, list rows, and footer hotkeys are all clickable'],
];

interface Props {
  activeTab: TabName;
  onClose: () => void;
}

export function HelpOverlay({ activeTab, onClose }: Props) {
  useInput((_input, key) => {
    // Any keypress closes help, but be specific so we don't double-act on the toggle
    if (key.escape || key.return) onClose();
  });
  // Auto-close on next render of `?` is handled by App owner; we just expose
  // the visual + exit on Esc/Enter.

  const tabKeys = HELP[activeTab];

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} borderStyle="double" borderColor="cyan">
      <Text bold color="cyan">Help — {activeTab}</Text>
      <Box marginTop={1} flexDirection="column">
        {tabKeys.map(([k, desc], i) => (
          <Box key={i}>
            <Box width={10}><Text color="yellow">{k}</Text></Box>
            <Text>{desc}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold color="cyan" dimColor>Global</Text>
        {GLOBAL.map(([k, desc], i) => (
          <Box key={i}>
            <Box width={10}><Text color="yellow">{k}</Text></Box>
            <Text dimColor>{desc}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>[?] or [esc] to close</Text>
      </Box>
    </Box>
  );
}
