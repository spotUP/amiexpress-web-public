import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useMouse, useHover, type MouseEvent } from '../hooks/useMouse.js';
import { CATEGORIES, CATEGORY_COLLAPSED, PAGES, type CategoryName, type PageMeta } from '../pages/registry.js';
import { T, CURRENT_THEME, BORDER_STYLE } from '../theme/blessed-theme.js';

export const SIDEBAR_WIDTH = 22;
const SIDEBAR_FIRST_ROW = 4;

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
  focus: boolean;
}

export function Sidebar({ activePageId, onSelect, focus }: Props) {
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

  // useRefs avoid stale closures in useInput (Ink registers the handler once)
  const activePageRef = useRef(activePageId);
  activePageRef.current = activePageId;
  const orderRef = useRef(implementedOrder);
  orderRef.current = implementedOrder;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useInput((input, key) => {
    if (!focus) return;
    const idx = orderRef.current.indexOf(activePageRef.current);
    if (key.upArrow && idx > 0) onSelectRef.current(orderRef.current[idx - 1]!);
    if (key.downArrow && idx >= 0 && idx < orderRef.current.length - 1) onSelectRef.current(orderRef.current[idx + 1]!);
    const n = parseInt(input, 10);
    if (n >= 1 && n <= CATEGORIES.length) {
      const cat = CATEGORIES[n - 1]!;
      const first = PAGES.find(p => p.category === cat && p.implemented);
      if (first) onSelectRef.current(first.id);
    }
  });

  return (
    <Box flexDirection="column" borderStyle={BORDER_STYLE[CURRENT_THEME.border]} borderColor={focus ? T.accent : T.chrome} width={SIDEBAR_WIDTH}>
      {CATEGORIES.map((cat, ci) => {
        const isExpanded = expandedCats.has(cat);
        return (
          <Box key={cat} flexDirection="column">
            <Box paddingX={1}>
              <Text bold color={T.accent} dimColor>
                {isExpanded ? '\u2518' : '\u2510'} [{ci + 1}] {cat.toUpperCase()}
              </Text>
            </Box>
            {isExpanded && PAGES.filter(p => p.category === cat).map(p => {
              const isActive = p.id === activePageId;
              const isHovered = p.id === hoveredPageId;
              const isImplemented = p.implemented;

              let color: string;
              let isBold = false;

              if (isActive) {
                color = T.selectionInk;
              } else if (isHovered) {
                color = T.accent;
                isBold = true;
              } else if (isImplemented) {
                color = T.ink;
              } else {
                color = T.dim;
              }

              return (
                <Box key={p.id} paddingX={1}>
                  <Text
                    color={color}
                    bold={isBold || isActive}
                    inverse={isActive}
                    dimColor={!isImplemented}
                  >
                    {isActive ? '* ' : isHovered ? '> ' : '  '}{p.label}
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