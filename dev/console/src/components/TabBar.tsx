import React, { useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { useMouse, type MouseClick } from '../hooks/useMouse.js';

export const TABS = ['Dashboard', 'Nodes', 'Users', 'Confs', 'Callers', 'Logs', 'Doors', 'System'] as const;
export type TabName = (typeof TABS)[number];

// Tab bar lives directly below the Header (4 rows: border + 2 content rows + border).
// The TabBar itself is 3 rows: top border (5), text (6), bottom border (7).
// Accept clicks anywhere in that 3-row range (1-indexed for SGR mouse).
const TAB_ROW_MIN = 5;
const TAB_ROW_MAX = 7;
const TAB_START_COL = 2; // border (1) + paddingX=1 (1)

function tabRanges(): Array<{ name: TabName; from: number; to: number }> {
  const out: Array<{ name: TabName; from: number; to: number }> = [];
  let col = TAB_START_COL;
  for (let i = 0; i < TABS.length; i++) {
    const label = `[${i + 1}]${TABS[i]}`;
    out.push({ name: TABS[i]!, from: col, to: col + label.length - 1 });
    col += label.length + 1; // marginRight=1
  }
  return out;
}

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

  const onMouse = useCallback((e: MouseClick) => {
    if (e.button !== 0) return;
    if (e.row < TAB_ROW_MIN || e.row > TAB_ROW_MAX) return;
    for (const r of tabRanges()) {
      if (e.col >= r.from && e.col <= r.to) { onChange(r.name); return; }
    }
  }, [onChange]);
  useMouse(onMouse);

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
