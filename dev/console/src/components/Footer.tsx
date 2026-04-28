import React from 'react';
import { Box, Text } from 'ink';
import type { TabName } from './TabBar.js';

const HINTS: Record<TabName, string> = {
  Nodes: '[k]ick  [c]hat  [↑↓] select',
  Users: '[e]dit  [b]an  [d]el  [/]search  [↑↓] scroll',
  Confs: '[t]oggle  [h]ealth  [↑↓] scroll',
  Callers: '[↑↓] scroll  auto-refresh 30s',
  Logs: '[b]ackend  [p]review  [d]oor-watcher  [6]8k',
};

interface Props {
  activeTab: TabName;
}

export function Footer({ activeTab }: Props) {
  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1} justifyContent="space-between">
      <Text dimColor>{HINTS[activeTab]}</Text>
      <Text dimColor>[?]help  [q]quit</Text>
    </Box>
  );
}
