import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getAuditLog, type AuditEntry } from '../../api/client.js';
import { useRowClick } from '../../hooks/useRowClick.js';

const ITEMS_START_ROW = 7;
const PAGE_LIMIT = 50;

export function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [filtering, setFiltering] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const load = useCallback(async (tableName?: string) => {
    setLoading(true);
    try {
      const data = await getAuditLog({ tableName, limit: PAGE_LIMIT });
      setEntries(data);
      setError(null);
      setSelectedIdx(0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = entries;

  useRowClick(visible.length, ITEMS_START_ROW, setSelectedIdx, !filtering);

  useInput((input, key) => {
    if (filtering) {
      if (key.escape) { setFiltering(false); setFilter(''); load(); return; }
      if (key.return) { setFiltering(false); load(filter || undefined); return; }
      if (key.backspace || key.delete) { setFilter(f => f.slice(0, -1)); return; }
      if (input && !key.ctrl) setFilter(f => f + input);
      return;
    }
    if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
    if (key.downArrow) setSelectedIdx(i => Math.min(visible.length - 1, i + 1));
    if (input === '/') { setFiltering(true); setFilter(''); }
    if (input === 'r') load(filter || undefined);
    if (input === 'c') { setFilter(''); load(); }
  });

  if (loading && entries.length === 0) {
    return <Box><Text color="yellow"><Spinner type="dots" /></Text><Text> Loading audit log...</Text></Box>;
  }
  if (error) return <Text color="red">Error: {error}</Text>;

  const sel = visible[selectedIdx];

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">AUDIT LOG</Text>
        <Text dimColor>  ({visible.length} entries{filter ? `, table=${filter}` : ''})</Text>
      </Box>

      <Box marginBottom={1}>
        <Text bold color="cyan">{'  TIME'.padEnd(22)}{'TABLE'.padEnd(20)}{'ACTION'.padEnd(10)}{'BY'.padEnd(16)}{'RECORD'}</Text>
      </Box>

      {visible.slice(0, 18).map((e, i) => (
        <Box key={e.id}>
          <Text color={i === selectedIdx ? 'cyan' : 'white'} bold={i === selectedIdx}>
            {i === selectedIdx ? '▶ ' : '  '}
            {(e.timestamp ?? '—').slice(0, 19).padEnd(20)}
            {(e.table_name ?? '—').slice(0, 18).padEnd(20)}
            {(e.action ?? '—').slice(0, 8).padEnd(10)}
            {(e.changed_by ?? '—').slice(0, 14).padEnd(16)}
            {String(e.record_id ?? '—').slice(0, 16)}
          </Text>
        </Box>
      ))}

      {filtering && (
        <Box marginTop={1}>
          <Text color="cyan">Filter by table: {filter}█</Text>
          <Text dimColor>  [enter] apply  [esc] cancel</Text>
        </Box>
      )}

      {!filtering && sel && (
        <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
          <Text bold color="cyan">Selected entry</Text>
          <Text dimColor>before:</Text>
          <Text>{sel.before ? JSON.stringify(sel.before).slice(0, 200) : '(none)'}</Text>
          <Text dimColor>after:</Text>
          <Text>{sel.after ? JSON.stringify(sel.after).slice(0, 200) : '(none)'}</Text>
        </Box>
      )}
    </Box>
  );
}
