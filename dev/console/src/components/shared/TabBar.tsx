import React, { useMemo, useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { T } from '../../theme/blessed-theme.js';
import { useMouse, useHover, type MouseEvent } from '../../hooks/useMouse.js';
import { SIDEBAR_WIDTH } from '../Sidebar.js';

const CONTENT_COL = SIDEBAR_WIDTH + 2;

export interface TabDef<T extends string> {
  id: T;
  label: string;
  hotkey: string;
}

interface TabBarProps<T extends string> {
  tabs: TabDef<T>[];
  activeTab: T;
  onChange: (tab: T) => void;
  /** Row offset from top of screen where tab row renders (content border + padding). Default 6. */
  row?: number;
  /** Gap between tabs in terminal columns. Default 2. */
  gap?: number;
}

export function TabBar<T extends string>({ tabs, activeTab, onChange, row = 6, gap = 2 }: TabBarProps<T>) {
  const [hovered, setHovered] = useState<T | null>(null);

  const ranges = useMemo(() => {
    const ranges: Array<{ from: number; to: number; id: T }> = [];
    let col = CONTENT_COL;
    tabs.forEach(t => {
      const text = `[${t.hotkey}] ${t.label}`;
      ranges.push({ from: col, to: col + text.length - 1, id: t.id });
      col += text.length + gap;
    });
    return ranges;
  }, [tabs, gap]);

  const onClick = useCallback((e: MouseEvent) => {
    if (e.button !== 0 || e.row !== row) return;
    for (const r of ranges) {
      if (e.col >= r.from && e.col <= r.to) { onChange(r.id); return; }
    }
  }, [row, ranges, onChange]);

  const onHover = useCallback((e: { col: number; row: number }) => {
    if (e.row !== row) { setHovered(null); return; }
    for (const r of ranges) {
      if (e.col >= r.from && e.col <= r.to) { setHovered(r.id); return; }
    }
    setHovered(null);
  }, [row, ranges]);

  useMouse(onClick);
  useHover(onHover);

  return (
    <Box>
      {tabs.map((t, i) => {
        const active = activeTab === t.id;
        const hover = hovered === t.id;
        return (
          <Text key={t.id} bold={active || hover} inverse={active} color={active ? undefined : hover ? T.accent : T.ink}>
            {i > 0 ? '  ' : ''}[{t.hotkey}] {t.label}
          </Text>
        );
      })}
    </Box>
  );
}