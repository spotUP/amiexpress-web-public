import { useCallback } from 'react';
import { useMouse, type MouseClick } from './useMouse.js';

// Standard tab content layout (assuming the alt-screen buffer mode in index.tsx):
//   rows 1-4   Header (4 rows: border + 2 content + border)
//   rows 5-7   TabBar (3 rows: border + content + border)
//   row  8     <tab's first row of content>
// Each tab decides what ends up at row 8 onward. Pass `startRow` = the
// 1-indexed row where the FIRST clickable item is rendered.
export function useRowClick(
  itemCount: number,
  startRow: number,
  onSelect: (idx: number) => void,
  enabled = true
): void {
  const handler = useCallback((e: MouseClick) => {
    if (!enabled) return;
    if (e.button !== 0) return;
    const idx = e.row - startRow;
    if (idx >= 0 && idx < itemCount) onSelect(idx);
  }, [itemCount, startRow, onSelect, enabled]);
  useMouse(handler);
}

// For grid layouts (e.g. DoorsTab with N columns of items down each column).
//   startRow      first item's screen row (1-indexed)
//   colStartCol   first item's screen column (1-indexed)
//   itemWidth     character width of each item slot
//   rowsPerCol    items per column before wrapping to next column
//   itemCount     total items (so we don't select past the last)
export function useGridClick(
  startRow: number,
  colStartCol: number,
  itemWidth: number,
  rowsPerCol: number,
  itemCount: number,
  onSelect: (idx: number) => void,
  enabled = true,
): void {
  const handler = useCallback((e: MouseClick) => {
    if (!enabled) return;
    if (e.button !== 0) return;
    const rowIdx = e.row - startRow;
    if (rowIdx < 0 || rowIdx >= rowsPerCol) return;
    const colIdx = Math.floor((e.col - colStartCol) / itemWidth);
    if (colIdx < 0) return;
    const idx = colIdx * rowsPerCol + rowIdx;
    if (idx >= 0 && idx < itemCount) onSelect(idx);
  }, [startRow, colStartCol, itemWidth, rowsPerCol, itemCount, onSelect, enabled]);
  useMouse(handler);
}
