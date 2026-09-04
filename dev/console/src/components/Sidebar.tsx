import React, { useCallback, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useMouse, useHover, type MouseEvent } from '../hooks/useMouse.js';
import { CATEGORIES, CATEGORY_COLLAPSED, PAGES, type CategoryName, type PageMeta } from '../pages/registry.js';
import { THEME, BOX, BORDER_STYLE } from '../theme/blessed-theme.js';

export const SIDEBAR_WIDTH = 22;
const SIDEBAR_INNER_LEFT_COL = 2;
const SIDEBAR_INNER_RIGHT_COL = SIDEBAR_WIDTH - 2;
const SIDEBAR_FIRST_ROW = 5;
const SIDEBAR_LAST_ROW_OFFSET_FROM_BOTTOM = 3;

interface RenderedRow {
  row: number;
  kind: 'category' | 'page';
  category: CategoryName;
  page?: PageMeta;
  expanded: boolean;
}

export function buildRenderedRows(expandedCats: Set<CategoryName>): RenderedRow[] {
  const rows: RenderedRow[] = [];
  let row = SIDEBAR_FIRST_ROW;
  for (const cat of CATEGORIES) {
    const expanded = expandedCats.has(cat);
    rows.push({ row, kind: 'category', category: cat, expanded });
    row++;
    if (expanded) {
      for (const page of PAGES.filter(p => p.category === cat)) {
        rows.push({ row, kind: 'page', category: cat, page, expanded: true });
        row++;
      }
    }
    row++;
  }
  return rows;
}

interface Props {
  activePageId: string;
  onSelect: (id: string) => void;
}

export function Sidebar({ activePageId, onSelect }: Props) {
  const [expandedCats, setExpandedCats] = useState<Set<CategoryName>>(() => {
    const expanded = new Set<CategoryName>();
    for (const cat of CATEGORIES) {
      if (!CATEGORY_COLLAPSED[cat]) expanded.add(cat);
    }
    return expanded;
  });
  const [hoveredPageId, setHoveredPageId] = useState<string | null>(null);

  const rendered = useMemo(() => buildRenderedRows(expandedCats), [expandedCats]);

  const toggleCategory = useCallback((cat: CategoryName) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const onClick = useCallback((e: MouseEvent) => {
    if (e.button !== 0) return;
    if (e.col < 1 || e.col > SIDEBAR_WIDTH) return;
    const hit = rendered.find(r => r.row === e.row);
    if (!hit) return;
    if (hit.kind === 'category') {
      toggleCategory(hit.category);
      return;
    }
    if (hit.kind === 'page' && hit.page) {
      if (!hit.page.implemented) return;
      onSelect(hit.page.id);
    }
  }, [rendered, onSelect, toggleCategory]);

  useMouse(onClick);

  const onHover = useCallback((e: { col: number; row: number }) => {
    if (e.col < 1 || e.col > SIDEBAR_WIDTH) {
      setHoveredPageId(null);
      return;
    }
    const hit = rendered.find(r => r.row === e.row);
    if (!hit || hit.kind !== 'page' || !hit.page) {
      setHoveredPageId(null);
      return;
    }
    setHoveredPageId(hit.page.id);
  }, [rendered]);
  useHover(onHover);

  const implementedOrder = useMemo(
    () => rendered.filter(r => r.kind === 'page' && r.page?.implemented).map(r => r.page!.id),
    [rendered],
  );

  useInput((input, key) => {
    const idx = implementedOrder.indexOf(activePageId);
    if (key.upArrow && idx > 0) onSelect(implementedOrder[idx - 1]!);
    if (key.downArrow && idx >= 0 && idx < implementedOrder.length - 1) onSelect(implementedOrder[idx + 1]!);
    const n = parseInt(input);
    if (n >= 1 && n <= CATEGORIES.length) {
      const cat = CATEGORIES[n - 1]!;
      const first = PAGES.find(p => p.category === cat && p.implemented);
      if (first) onSelect(first.id);
    }
  });

  return (
    <Box flexDirection="column" borderStyle={BORDER_STYLE.single} borderColor={THEME.border.fg} width={SIDEBAR_WIDTH}>
      {CATEGORIES.map((cat, ci) => {
        const isExpanded = expandedCats.has(cat);
        return (
          <Box key={cat} flexDirection="column">
            <Box paddingX={1}>
              <Text bold color={THEME.primary.fg} dimColor>
                {isExpanded ? BOX.single.teeUp : BOX.single.teeDown} [{ci + 1}] {cat.toUpperCase()}
              </Text>
            </Box>
            {isExpanded && PAGES.filter(p => p.category === cat).map(p => {
              const isActive = p.id === activePageId;
              const isHovered = p.id === hoveredPageId;
              const isImplemented = p.implemented;

              let color: string;
              let isBold = false;
              let inverse = false;

              if (isActive) {
                color = THEME.selection.fg;
                inverse = true;
              } else if (isHovered) {
                color = THEME.hover.fg;
                isBold = true;
              } else if (isImplemented) {
                color = 'white';
              } else {
                color = THEME.secondary.fg;
              }

              return (
                <Box key={p.id} paddingX={1}>
                  <Text
                    color={color}
                    bold={isBold}
                    inverse={inverse}
                    dimColor={!isImplemented}
                  >
                    {isActive ? BOX.single.teeRight + ' ' : isHovered ? '○ ' : '  '}{p.label}
                  </Text>
                </Box>
              );
            })}
            {ci < CATEGORIES.length - 1 && <Box><Text> </Text></Box>}
          </Box>
        );
      })}
    </Box>
  );
}

export function isInSidebar(col: number): boolean {
  return col >= 1 && col <= SIDEBAR_WIDTH;
}

void SIDEBAR_INNER_LEFT_COL;
void SIDEBAR_INNER_RIGHT_COL;
void SIDEBAR_LAST_ROW_OFFSET_FROM_BOTTOM;