import React from 'react';
import { Box, Text, useInput } from 'ink';

export const TABS = ['Dashboard', 'Nodes', 'Users', 'Confs', 'Callers', 'Logs', 'Doors', 'System'] as const;
export type TabName = (typeof TABS)[number];

interface Props {
  active: TabName;
  onChange: (tab: TabName) => void;
}

export function TabBar({ active, onChange }: Props) {
  useInput((input, key) => {
    const idx = TABS.indexOf(active);
    if (key.leftArrow && idx > 0) onChange(TABS[idx - 1]!);
    if (key.rightArrow && idx < TABS.length - 1) onChange(TABS[idx + 1]!);
    const n = parseInt(input);
    if (n >= 1 && n <= TABS.length) onChange(TABS[n - 1]!);
  });

  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1} flexWrap="wrap">
      {TABS.map((tab, i) => (
        <Box key={tab} marginRight={1}>
          <Text
            color={tab === active ? 'cyan' : 'white'}
            bold={tab === active}
            underline={tab === active}
          >
            [{i + 1}]{tab}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
