import React, { useCallback, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useMouse, type MouseClick } from '../hooks/useMouse.js';
import { CATEGORIES, PAGES, type CategoryName, type PageMeta } from '../pages/registry.js';

export const SIDEBAR_WIDTH = 22;          // total cells the sidebar occupies (including border)
const SIDEBAR_INNER_LEFT_COL = 2;          // cols 1=border; 2..N = content; N+1=border
const SIDEBAR_INNER_RIGHT_COL = SIDEBAR_WIDTH - 2; // exclude border on the right
// Sidebar lives directly under the Header (4 rows). First content row = 5.
const SIDEBAR_FIRST_ROW = 5;
const SIDEBAR_LAST_ROW_OFFSET_FROM_BOTTOM = 3; // 3 footer rows

// Each "rendered row" of the sidebar can be either a category header or a page.
// We compute the in-screen row for each one so click hit-testing is exact.
interface RenderedRow {
  row: number;             // 1-indexed screen row
  kind: 'category' | 'page';
  category: CategoryName;
  page?: PageMeta;
}

export function buildRenderedRows(): RenderedRow[] {
  const rows: RenderedRow[] = [];
  let row = SIDEBAR_FIRST_ROW;
  for (const cat of CATEGORIES) {
    rows.push({ row, kind: 'category', category: cat });
    row++;
    for (const page of PAGES.filter(p => p.category === cat)) {
      rows.push({ row, kind: 'page', category: cat, page });
      row++;
    }
    // blank spacer between categories — eats one row but no entry
    row++;
  }
  return rows;
}

interface Props {
  activePageId: string;
  onSelect: (id: string) => void;
}

export function Sidebar({ activePageId, onSelect }: Props) {
  const rendered = useMemo(buildRenderedRows, []);

  const onMouse = useCallback((e: MouseClick) => {
    if (e.button !== 0) return;
    if (e.col < 1 || e.col > SIDEBAR_WIDTH) return;
    const hit = rendered.find(r => r.row === e.row);
    if (!hit || hit.kind !== 'page' || !hit.page) return;
    if (!hit.page.implemented) return;
    onSelect(hit.page.id);
  }, [rendered, onSelect]);
  useMouse(onMouse);

  // Keyboard: up/down within the implemented page list (skip categories + unimplemented).
  const implementedOrder = useMemo(
    () => rendered.filter(r => r.kind === 'page' && r.page?.implemented).map(r => r.page!.id),
    [rendered],
  );

  useInput((input, key) => {
    const idx = implementedOrder.indexOf(activePageId);
    if (key.upArrow && idx > 0) onSelect(implementedOrder[idx - 1]!);
    if (key.downArrow && idx >= 0 && idx < implementedOrder.length - 1) onSelect(implementedOrder[idx + 1]!);
    // Number keys jump to category first item.
    const n = parseInt(input);
    if (n >= 1 && n <= CATEGORIES.length) {
      const cat = CATEGORIES[n - 1]!;
      const first = PAGES.find(p => p.category === cat && p.implemented);
      if (first) onSelect(first.id);
    }
  });

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" width={SIDEBAR_WIDTH}>
      {CATEGORIES.map((cat, ci) => (
        <Box key={cat} flexDirection="column">
          <Box paddingX={1}>
            <Text bold color="cyan" dimColor>[{ci + 1}] {cat.toUpperCase()}</Text>
          </Box>
          {PAGES.filter(p => p.category === cat).map(p => (
            <Box key={p.id} paddingX={1}>
              <Text
                color={p.id === activePageId ? 'cyan' : (p.implemented ? 'white' : 'gray')}
                bold={p.id === activePageId}
                dimColor={!p.implemented}
              >
                {p.id === activePageId ? '▶ ' : '  '}{p.label}
              </Text>
            </Box>
          ))}
          {ci < CATEGORIES.length - 1 && <Box><Text> </Text></Box>}
        </Box>
      ))}
    </Box>
  );
}

// Used by other components (lists, hotkey hints) to know that any click in the
// sidebar's column range belongs to the sidebar and should be ignored.
export function isInSidebar(col: number): boolean {
  return col >= 1 && col <= SIDEBAR_WIDTH;
}

// Suppress unused warnings in builds that don't reference these directly yet.
void SIDEBAR_INNER_LEFT_COL;
void SIDEBAR_INNER_RIGHT_COL;
void SIDEBAR_LAST_ROW_OFFSET_FROM_BOTTOM;
