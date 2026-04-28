import React from 'react';
import { Box, Text } from 'ink';
import type { TabName } from './TabBar.js';

const HINTS: Record<TabName, string> = {
  Dashboard: 'live stats + 24h sparkline  auto-refresh 10s',
  Nodes:     '[k]ick  [c]hat  [↑↓] select',
  Users:     '[e]dit SL  [b]an  [d]el  [/]search  [↑↓] scroll',
  Confs:     '[t]oggle  [h]ealth  [f]ix  [r]efresh  [↑↓] scroll',
  Callers:   '[↑↓] scroll  auto-refresh 30s',
  Logs:      '[b]ackend  [p]review  [d]oor-watcher  [6]8k',
  Doors:     '[r]efresh  [R]eload all doors  [↑↓] scroll',
  System:    '[n]odes  [c]onfig  [s]tart  [x]exit  [v]reserve  [o]sysop  [Q]uiet',
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
