import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import {
  getSessions, getSessionLog, saveSessionLog, getSessionStats,
  type SessionInfo, type SessionLog, type SessionStats,
} from '../../api/client.js';
import { T } from '../../theme/blessed-theme.js';
import { useRowClick } from '../../hooks/useRowClick.js';
import { stripAnsi } from '../../utils/strip-ansi.js';

// Content area starts at row 5 (see useRowClick.ts). This page renders
// THREE marginBottom={1} boxes above the list before any items appear:
// title box, optional stats box, and the column-header box - each box's
// content row plus its margin spacer row is 2 rendered rows. So:
//   without stats: title (5-6) + header (7-8)            -> items at 9
//   with stats:    title (5-6) + stats (7-8) + header (9-10) -> items at 11
// A previous fix (7/9) counted the title and stats boxes but missed the
// column-header box that's always present, so it under-shot by 2 in both
// cases - every click landed two rows above the row a caller clicked and
// opened the WRONG session's log immediately (useRowClick fires on any
// click within the content area, not just on an actual row).
const ITEMS_START_ROW_BASE = 9;
const ITEMS_START_ROW_WITH_STATS = 11;

export function SessionLogsPage() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [logFor, setLogFor] = useState<string | null>(null);
  const [logData, setLogData] = useState<SessionLog | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSessions();
      setSessions(data);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const data = await getSessionStats();
      setStats(data);
    } catch {
      // Non-fatal: the session list still loaded.
    }
  }, []);

  useEffect(() => { load(); loadStats(); }, [load, loadStats]);

  const itemsStartRow = stats ? ITEMS_START_ROW_WITH_STATS : ITEMS_START_ROW_BASE;

  useRowClick(sessions.length, itemsStartRow, (idx) => {
    setSelectedIdx(idx);
    const s = sessions[idx];
    if (s) viewLog(s.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, !logFor);

  const selected = sessions[selectedIdx];

  function viewLog(id: string) {
    setLogFor(id);
    setLogLoading(true);
    setLogData(null);
    setStatus(null);
    getSessionLog(id)
      .then(data => setLogData(data))
      .catch((e: Error) => setStatus(`Error: ${e.message}`))
      .finally(() => setLogLoading(false));
  }

  const doSave = useCallback(() => {
    if (!logFor) return;
    setSaving(true);
    setStatus(null);
    saveSessionLog(logFor)
      .then((res) => setStatus(res.filePath ? `Saved to ${res.filePath}` : 'Saved'))
      .catch((e: Error) => setStatus(`Error: ${e.message}`))
      .finally(() => setSaving(false));
  }, [logFor]);

  useInput((input, key) => {
    if (logFor) {
      if (key.escape || input === 'q') { setLogFor(null); setLogData(null); setStatus(null); return; }
      if (input === 's' && logData && !saving) doSave();
      return;
    }
    if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
    if (key.downArrow) setSelectedIdx(i => Math.min(sessions.length - 1, i + 1));
    if (key.return && selected) viewLog(selected.id);
    if (input === 'r') { load(); loadStats(); }
  });

  if (loading) return <Box><Text color={T.warn}><Spinner type="dots" /></Text><Text> Loading sessions...</Text></Box>;
  if (error) return <Text color={T.alert}>Error: {error}</Text>;

  if (logFor) {
    const lines = logData ? stripAnsi(logData.output.join('')).split(/\r?\n/) : [];
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color={T.accent}>SESSION LOG</Text>
          <Text dimColor>
            {'  '}{logData?.username ?? logFor.slice(0, 12)}
            {'  '}({lines.length} lines, ANSI stripped for display — [s]ave for the exact bytes)
          </Text>
        </Box>
        {logLoading && <Box><Text color={T.warn}><Spinner type="dots" /></Text><Text> Loading log...</Text></Box>}
        {!logLoading && !logData && <Text color={T.warn}>Session log not found.</Text>}
        {lines.slice(-40).map((line, i) => (
          <Text key={i} dimColor={i < lines.length - 5}>{line.slice(0, 200)}</Text>
        ))}
        {saving && <Box marginTop={1}><Text color={T.warn}><Spinner type="dots" /></Text><Text> Saving...</Text></Box>}
        {status && <Box marginTop={1}><Text color={status.startsWith('Error') ? T.alert : T.ok}>{status}</Text></Box>}
        <Box marginTop={1}><Text dimColor>[s]ave to file  [esc] back</Text></Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color={T.accent}>SESSION LOGS</Text>
        <Text dimColor>  ({sessions.length} sessions, [enter] view)</Text>
      </Box>

      {stats && (
        <Box marginBottom={1} gap={3}>
          <Text dimColor>Total sessions: <Text color={T.ink}>{stats.totalSessions}</Text></Text>
          <Text dimColor>Total lines: <Text color={T.ink}>{stats.totalLines.toLocaleString()}</Text></Text>
          <Text dimColor>Oldest: <Text color={T.ink}>{stats.oldestSession ? new Date(stats.oldestSession).toLocaleString() : 'N/A'}</Text></Text>
        </Box>
      )}

      <Box marginBottom={1}>
        <Text bold color={T.accent}>{'  USER'.padEnd(18)}{'NODE'.padEnd(7)}{'STARTED'.padEnd(22)}{'STATUS'}</Text>
      </Box>

      {sessions.slice(0, 18).map((s, i) => (
        <Box key={s.id}>
          <Text color={T.ink} bold={i === selectedIdx} inverse={i === selectedIdx}>
            {i === selectedIdx ? '▶ ' : '  '}
            {(s.username ?? '—').slice(0, 16).padEnd(18)}
            {String(s.nodeId ?? '?').padEnd(7)}
            {(s.startedAt ?? '—').slice(0, 19).padEnd(22)}
            {s.active ? 'active' : 'ended'}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
