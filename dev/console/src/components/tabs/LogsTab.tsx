import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import Spinner from 'ink-spinner';
import { getLogs } from '../../api/client.js';
import { useMouse, type MouseClick } from '../../hooks/useMouse.js';

type LogSource = 'backend' | 'frontend' | 'door68k';

const SOURCE_LABELS: Record<LogSource, string> = {
  backend: 'Backend',
  frontend: 'Preview',
  door68k: '68K Door',
};

// Switcher row: tab content starts at row 5 (sidebar layout, no TabBar).
// Labels: "Backend"(7) + gap(3) + "Preview"(7) + gap(3) + "68K Door"(8).
// Content origin = sidebar(22) + paddingX=1 + 1 = col 24.
const SWITCHER_ROW = 5;
const BASE = 24;
const SWITCHER_RANGES: Array<{ from: number; to: number; src: LogSource }> = [
  { from: BASE,      to: BASE + 6,  src: 'backend' },   // "Backend"
  { from: BASE + 10, to: BASE + 16, src: 'frontend' },  // "Preview"  (gap=3)
  { from: BASE + 20, to: BASE + 27, src: 'door68k' },   // "68K Door"
];

// How much of the tab area we reserve for chrome (switcher + filter line +
// status line). Used when computing the visible-line budget.
const CHROME_ROWS = 4;

export function LogsTab() {
  const [source, setSource] = useState<LogSource>('backend');
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [editingFilter, setEditingFilter] = useState(false);
  // 0 = following the tail. Positive = lines from the bottom we're currently
  // looking at (1 = one line up, etc). Capped to (filtered.length - viewport).
  const [scrollOffset, setScrollOffset] = useState(0);
  const mounted = useRef(true);
  const { stdout } = useStdout();
  const termRows = stdout?.rows ?? 24;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLines([]);
    setScrollOffset(0);  // reset scroll when switching source

    async function load() {
      try {
        const data = await getLogs(source, 1000);  // ask for more so scrollback is useful
        if (active && mounted.current) {
          setLines(data.lines ?? []);
          setError(null);
        }
      } catch (e: unknown) {
        if (active && mounted.current) setError(e instanceof Error ? e.message : 'Failed');
      } finally {
        if (active && mounted.current) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, 5_000);
    return () => { active = false; clearInterval(id); };
  }, [source]);

  // Apply filter. Case-insensitive substring match; empty filter = all lines.
  const filtered = useMemo(() => {
    if (!filter) return lines;
    const needle = filter.toLowerCase();
    return lines.filter(l => l.toLowerCase().includes(needle));
  }, [lines, filter]);

  // The viewport. Header (switcher) + filter line + status line consume
  // CHROME_ROWS; everything else is for log lines. Cap at the actual line
  // count.
  const viewport = Math.max(3, termRows - CHROME_ROWS - 6);

  // Slice the visible window. scrollOffset is anchored from the bottom:
  // offset=0 means "show tail", offset=N means "we're N lines higher".
  const maxOffset = Math.max(0, filtered.length - viewport);
  const safeOffset = Math.min(scrollOffset, maxOffset);
  const end = filtered.length - safeOffset;
  const start = Math.max(0, end - viewport);
  const display = filtered.slice(start, end);
  const following = safeOffset === 0;

  useInput((input, key) => {
    // Filter editing mode owns input
    if (editingFilter) {
      if (key.escape) { setFilter(''); setEditingFilter(false); return; }
      if (key.return) { setEditingFilter(false); return; }
      if (key.backspace || key.delete) { setFilter(f => f.slice(0, -1)); return; }
      if (input && !key.ctrl && !key.meta && input.length === 1 && input >= ' ') {
        setFilter(f => f + input);
      }
      return;
    }

    if (input === '/') { setEditingFilter(true); return; }
    if (input === 'c' && filter) { setFilter(''); return; }
    if (input === 'b') { setSource('backend');  setScrollOffset(0); return; }
    if (input === 'p') { setSource('frontend'); setScrollOffset(0); return; }
    if (input === '6') { setSource('door68k');  setScrollOffset(0); return; }

    // Scrollback
    if (key.upArrow)   { setScrollOffset(o => Math.min(o + 1, maxOffset)); return; }
    if (key.downArrow) { setScrollOffset(o => Math.max(o - 1, 0)); return; }
    if (key.pageUp)    { setScrollOffset(o => Math.min(o + viewport, maxOffset)); return; }
    if (key.pageDown)  { setScrollOffset(o => Math.max(o - viewport, 0)); return; }
    // End / "g" tail-follow
    if (input === 'G' || input === 'g') {
      // 'G' jumps to bottom (follow), 'g' jumps to top
      if (input === 'G') setScrollOffset(0);
      else setScrollOffset(maxOffset);
      return;
    }
  });

  const onSwitcherClick = useCallback((e: MouseClick) => {
    if (e.button !== 0 || e.row !== SWITCHER_ROW) return;
    for (const r of SWITCHER_RANGES) {
      if (e.col >= r.from && e.col <= r.to) { setSource(r.src); setScrollOffset(0); return; }
    }
  }, []);
  useMouse(onSwitcherClick);

  // Status line: position indicator + counts + follow indicator
  const positionLabel = filtered.length === 0
    ? '0/0'
    : `${start + 1}-${end}/${filtered.length}`;
  const followLabel = following ? 'tail' : `+${safeOffset}`;
  const filterLabel = filter ? `filter:"${filter}"` : '';
  const filteredLabel = filter ? ` (filtered ${filtered.length}/${lines.length})` : '';

  return (
    <Box flexDirection="column">
      <Box marginBottom={1} gap={3}>
        {(['backend', 'frontend', 'door68k'] as LogSource[]).map(s => (
          <Text key={s} color={s === source ? 'cyan' : 'white'} bold={s === source} underline={s === source}>
            {SOURCE_LABELS[s]}
          </Text>
        ))}
        {loading && <Text color="yellow"><Spinner type="dots" /></Text>}
      </Box>

      {/* Filter line — visible while editing or when a filter is active */}
      {(editingFilter || filter) && (
        <Box>
          <Text color="cyan">{editingFilter ? '/' : 'filter: '}</Text>
          <Text color={editingFilter ? 'white' : 'yellow'}>
            {filter}{editingFilter ? '█' : ''}
          </Text>
          {editingFilter && <Text dimColor>  [enter] apply  [esc] clear</Text>}
          {!editingFilter && filter && <Text dimColor>  [c] clear  [/] edit</Text>}
        </Box>
      )}

      {/* Status line — position + follow state + hints */}
      <Box>
        <Text dimColor>
          {positionLabel}  {followLabel}{filteredLabel}
          {!editingFilter && '   [↑↓/PgUp/PgDn] scroll  [g/G] top/tail  [/] filter'}
        </Text>
      </Box>

      {error && <Text color="red">Error: {error}</Text>}

      {/* Render the visible slice. Truncate width to keep one line per entry. */}
      {display.map((line, i) => (
        <Text key={start + i}>{line.slice(0, 200)}</Text>
      ))}
    </Box>
  );
}
