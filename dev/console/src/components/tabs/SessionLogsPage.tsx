import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getSessions, getSessionLog, type SessionInfo } from '../../api/client.js';
import { useRowClick } from '../../hooks/useRowClick.js';

const ITEMS_START_ROW = 7;

interface LogResult {
  lines?: string[];
  entries?: unknown[];
  [k: string]: unknown;
}

export function SessionLogsPage() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [logFor, setLogFor] = useState<string | null>(null);
  const [logData, setLogData] = useState<LogResult | null>(null);
  const [logLoading, setLogLoading] = useState(false);

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

  useEffect(() => { load(); }, [load]);

  useRowClick(sessions.length, ITEMS_START_ROW, (idx) => {
    setSelectedIdx(idx);
    const s = sessions[idx];
    if (s) viewLog(s.id);
  }, !logFor);

  const selected = sessions[selectedIdx];

  function viewLog(id: string) {
    setLogFor(id);
    setLogLoading(true);
    setLogData(null);
    getSessionLog(id)
      .then(data => setLogData((data ?? {}) as LogResult))
      .catch((e: Error) => setLogData({ lines: [`Error: ${e.message}`] }))
      .finally(() => setLogLoading(false));
  }

  useInput((input, key) => {
    if (logFor) {
      if (key.escape || input === 'q') { setLogFor(null); setLogData(null); }
      return;
    }
    if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
    if (key.downArrow) setSelectedIdx(i => Math.min(sessions.length - 1, i + 1));
    if (key.return && selected) viewLog(selected.id);
    if (input === 'r') load();
  });

  if (loading) return <Box><Text color="yellow"><Spinner type="dots" /></Text><Text> Loading sessions...</Text></Box>;
  if (error) return <Text color="red">Error: {error}</Text>;

  if (logFor) {
    const lines: string[] = Array.isArray(logData?.lines)
      ? logData!.lines!
      : Array.isArray(logData?.entries)
        ? logData!.entries!.map(e => typeof e === 'string' ? e : JSON.stringify(e))
        : [];
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="cyan">SESSION LOG</Text>
          <Text dimColor>  {logFor.slice(0, 12)}…  ({lines.length} lines)  [esc] back</Text>
        </Box>
        {logLoading && <Box><Text color="yellow"><Spinner type="dots" /></Text><Text> Loading log...</Text></Box>}
        {lines.slice(-30).map((line, i) => (
          <Text key={i} dimColor={i < lines.length - 5}>{line.slice(0, 200)}</Text>
        ))}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">SESSION LOGS</Text>
        <Text dimColor>  ({sessions.length} sessions, [enter] view)</Text>
      </Box>

      <Box marginBottom={1}>
        <Text bold color="cyan">{'  USER'.padEnd(18)}{'NODE'.padEnd(7)}{'STARTED'.padEnd(22)}{'STATUS'}</Text>
      </Box>

      {sessions.slice(0, 18).map((s, i) => (
        <Box key={s.id}>
          <Text color={i === selectedIdx ? 'cyan' : 'white'} bold={i === selectedIdx}>
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
