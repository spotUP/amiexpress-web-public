import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import Spinner from 'ink-spinner';
import { getLogs, getDoorLogFiles, clearLogs, type DoorLogFile } from '../../api/client.js';
import { T } from '../../theme/blessed-theme.js';
import { useMouse, type MouseClick } from '../../hooks/useMouse.js';
import { useTextEntryLock } from '../../hooks/useTextEntryLock.js';
import { ConfirmDialog } from '../shared/ConfirmDialog.js';

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

type Mode = 'view' | 'editing-search' | 'door-log-picker' | 'confirm-clear';

export function LogsTab() {
  const [source, setSource] = useState<LogSource>('backend');
  const [doorLog, setDoorLog] = useState<string | undefined>(undefined);
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | undefined>(undefined);
  // Applied server-side search term (the one actually sent to GET /logs).
  const [search, setSearch] = useState('');
  // In-progress text while typing in the search box, before [enter] applies it.
  const [searchDraft, setSearchDraft] = useState('');
  const [mode, setMode] = useState<Mode>('view');
  // 0 = following the tail. Positive = lines from the bottom we're currently
  // looking at (1 = one line up, etc). Capped to (filtered.length - viewport).
  const [scrollOffset, setScrollOffset] = useState(0);
  const mounted = useRef(true);
  const { stdout } = useStdout();
  const termRows = stdout?.rows ?? 24;

  // Door-log file picker
  const [doorLogFiles, setDoorLogFiles] = useState<DoorLogFile[]>([]);
  const [doorLogIdx, setDoorLogIdx] = useState(0);
  const [doorLogFilesLoading, setDoorLogFilesLoading] = useState(false);

  // Clearing
  const [clearing, setClearing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Search box, the door-log picker, and the clear confirmation all own the
  // keyboard — see dev/console/src/state/text-entry-lock.ts.
  useTextEntryLock(mode !== 'view');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLines([]);
    setScrollOffset(0);  // reset scroll when switching source/search/doorLog

    async function load() {
      try {
        const data = await getLogs(source, 1000, search, doorLog);  // ask for more so scrollback is useful
        if (active && mounted.current) {
          setLines(data.lines ?? []);
          setMessage(data.message);
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
  }, [source, search, doorLog]);

  // The backend already applied `search` server-side; `lines` IS the
  // filtered set now, so there is no separate client-side pass any more.
  const filtered = lines;

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

  const loadDoorLogFiles = useCallback(() => {
    setDoorLogFilesLoading(true);
    getDoorLogFiles()
      .then(files => { setDoorLogFiles(files); setDoorLogIdx(0); })
      .catch((e: Error) => setStatus(`Error: ${e.message}`))
      .finally(() => setDoorLogFilesLoading(false));
  }, []);

  const doClear = useCallback(() => {
    setClearing(true);
    setStatus(null);
    clearLogs(source, doorLog)
      .then((res) => { setStatus(res.message ?? 'Log cleared'); setLines([]); })
      .catch((e: Error) => setStatus(`Error: ${e.message}`))
      .finally(() => setClearing(false));
  }, [source, doorLog]);

  useInput((input, key) => {
    if (mode === 'editing-search') {
      if (key.escape) { setSearchDraft(''); setMode('view'); return; }
      if (key.return) { setSearch(searchDraft); setMode('view'); return; }
      if (key.backspace || key.delete) { setSearchDraft(f => f.slice(0, -1)); return; }
      if (input && !key.ctrl && !key.meta && input.length === 1 && input >= ' ') {
        setSearchDraft(f => f + input);
      }
      return;
    }

    if (mode === 'door-log-picker') {
      if (key.escape) { setMode('view'); return; }
      if (key.upArrow) setDoorLogIdx(i => Math.max(0, i - 1));
      if (key.downArrow) setDoorLogIdx(i => Math.min(doorLogFiles.length - 1, i + 1));
      if (key.return) {
        const picked = doorLogFiles[doorLogIdx];
        setDoorLog(picked ? picked.file : undefined);
        setMode('view');
        return;
      }
      if (input === 'a') { setDoorLog(undefined); setMode('view'); } // "all" — legacy combined log
      return;
    }

    if (mode === 'confirm-clear') return; // ConfirmDialog owns input

    if (input === '/') { setSearchDraft(search); setMode('editing-search'); return; }
    if (input === 'c' && search) { setSearch(''); return; }
    if (input === 'C' && !clearing) { setMode('confirm-clear'); return; }
    if (input === 'L' && source === 'door68k') { setMode('door-log-picker'); loadDoorLogFiles(); return; }
    if (input === 'b') { setSource('backend');  setDoorLog(undefined); setScrollOffset(0); return; }
    if (input === 'p') { setSource('frontend'); setDoorLog(undefined); setScrollOffset(0); return; }
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
      if (e.col >= r.from && e.col <= r.to) { setSource(r.src); setDoorLog(undefined); setScrollOffset(0); return; }
    }
  }, []);
  useMouse(onSwitcherClick);

  if (mode === 'door-log-picker') {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color={T.accent}>68K DOOR LOG FILES</Text>
          {doorLogFilesLoading && <Text color={T.warn}> <Spinner type="dots" /></Text>}
        </Box>
        {doorLogFiles.map((f, i) => (
          <Box key={f.file}>
            <Text color={T.ink} bold={i === doorLogIdx} inverse={i === doorLogIdx}>
              {i === doorLogIdx ? '▶ ' : '  '}
              {f.label.padEnd(30)}
              {(f.size / 1024).toFixed(1).padStart(8)} KB
              {f.modifiedAt ? `  ${f.modifiedAt.slice(0, 19)}` : ''}
            </Text>
          </Box>
        ))}
        {doorLogFiles.length === 0 && !doorLogFilesLoading && <Text dimColor>No door-68k log files found.</Text>}
        <Box marginTop={1}>
          <Text dimColor>[↑↓] select  [enter] view  [a]ll (legacy combined log)  [esc] cancel</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1} gap={3}>
        {(['backend', 'frontend', 'door68k'] as LogSource[]).map(s => (
          <Text key={s} color={s === source ? T.accent : T.ink} bold={s === source} underline={s === source}>
            {SOURCE_LABELS[s]}
          </Text>
        ))}
        {loading && <Text color={T.warn}><Spinner type="dots" /></Text>}
      </Box>

      {source === 'door68k' && (
        <Box>
          <Text dimColor>file: {doorLog ?? 'door-68k.log (legacy)'}  [L] choose a different door log file</Text>
        </Box>
      )}

      {/* Search line — visible while editing or when a search term is applied */}
      {(mode === 'editing-search' || search) && (
        <Box>
          <Text color={T.accent}>{mode === 'editing-search' ? '/' : 'search: '}</Text>
          <Text color={mode === 'editing-search' ? T.ink : T.warn}>
            {mode === 'editing-search' ? searchDraft : search}{mode === 'editing-search' ? '█' : ''}
          </Text>
          {mode === 'editing-search' && <Text dimColor>  [enter] apply (server-side)  [esc] cancel</Text>}
          {mode !== 'editing-search' && search && <Text dimColor>  [c] clear  [/] edit</Text>}
        </Box>
      )}

      {/* Status line — position + follow state + hints */}
      <Box>
        <Text dimColor>
          {filtered.length === 0 ? '0/0' : `${start + 1}-${end}/${filtered.length}`}
          {'  '}{following ? 'tail' : `+${safeOffset}`}
          {!mode.startsWith('editing') && '   [↑↓/PgUp/PgDn] scroll  [g/G] top/tail  [/] search  [C]lear'}
        </Text>
      </Box>

      {error && <Text color={T.alert}>Error: {error}</Text>}
      {!error && message && lines.length === 0 && <Text color={T.warn}>{message}</Text>}

      {mode === 'confirm-clear' && (
        <Box marginTop={1}>
          <ConfirmDialog
            message={
              `Clear the ${SOURCE_LABELS[source]} log${doorLog ? ` (${doorLog})` : ''}? ` +
              'This truncates the file on disk — every line in it is gone, not just what is shown here.'
            }
            onConfirm={() => { setMode('view'); doClear(); }}
            onCancel={() => setMode('view')}
          />
        </Box>
      )}

      {clearing && <Box><Text color={T.warn}><Spinner type="dots" /></Text><Text> Clearing...</Text></Box>}
      {status && <Box><Text color={status.startsWith('Error') ? T.alert : T.ok}>{status}</Text></Box>}

      {/* Render the visible slice. Truncate width to keep one line per entry. */}
      {display.map((line, i) => (
        <Text key={start + i}>{line.slice(0, 200)}</Text>
      ))}
    </Box>
  );
}
