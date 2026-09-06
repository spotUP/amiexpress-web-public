import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getAuditLog, type AuditEntry } from '../../api/client.js';
import { T } from '../../theme/blessed-theme.js';
import { useRowClick } from '../../hooks/useRowClick.js';
import { useTextEntryLock } from '../../hooks/useTextEntryLock.js';

const ITEMS_START_ROW = 7;
const PAGE_LIMIT = 50;

type FilterMode = 'none' | 'table' | 'record';

export function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState('');
  const [recordFilter, setRecordFilter] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('none');
  const [filterDraft, setFilterDraft] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);

  const load = useCallback(async (table: string, recordId: string) => {
    setLoading(true);
    try {
      const data = await getAuditLog({ tableName: table || undefined, recordId: recordId || undefined, limit: PAGE_LIMIT });
      setEntries(data);
      setError(null);
      setSelectedIdx(0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(tableFilter, recordFilter); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = entries;

  useRowClick(visible.length, ITEMS_START_ROW, setSelectedIdx, filterMode === 'none');

  // A table-name or record-id filter box collects free text/digits — must
  // not lose keys to the sidebar's arrow-key page cycling or the global
  // 'q'/'?' hotkeys. See dev/console/src/state/text-entry-lock.ts.
  useTextEntryLock(filterMode !== 'none');

  useInput((input, key) => {
    if (filterMode !== 'none') {
      if (key.escape) {
        setFilterMode('none');
        if (filterMode === 'table') { setTableFilter(''); load('', recordFilter); }
        else { setRecordFilter(''); load(tableFilter, ''); }
        return;
      }
      if (key.return) {
        if (filterMode === 'table') { setTableFilter(filterDraft); load(filterDraft, recordFilter); }
        else { setRecordFilter(filterDraft); load(tableFilter, filterDraft); }
        setFilterMode('none');
        return;
      }
      if (key.backspace || key.delete) { setFilterDraft(f => f.slice(0, -1)); return; }
      if (filterMode === 'record') {
        if (input && /[0-9]/.test(input)) setFilterDraft(f => f + input);
        return;
      }
      if (input && !key.ctrl) setFilterDraft(f => f + input);
      return;
    }
    if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
    if (key.downArrow) setSelectedIdx(i => Math.min(visible.length - 1, i + 1));
    if (input === '/') { setFilterMode('table'); setFilterDraft(tableFilter); }
    if (input === '#') { setFilterMode('record'); setFilterDraft(recordFilter); }
    if (input === 'r') load(tableFilter, recordFilter);
    if (input === 'c') { setTableFilter(''); setRecordFilter(''); load('', ''); }
  });

  if (loading && entries.length === 0) {
    return <Box><Text color={T.warn}><Spinner type="dots" /></Text><Text> Loading audit log...</Text></Box>;
  }
  if (error) return <Text color={T.alert}>Error: {error}</Text>;

  const sel = visible[selectedIdx];

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color={T.accent}>AUDIT LOG</Text>
        <Text dimColor>
          {'  '}({visible.length} entries
          {tableFilter ? `, table=${tableFilter}` : ''}
          {recordFilter ? `, record=${recordFilter}` : ''})
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text bold color={T.accent}>{'  TIME'.padEnd(22)}{'TABLE'.padEnd(20)}{'ACTION'.padEnd(10)}{'BY'.padEnd(16)}{'RECORD'}</Text>
      </Box>

      {visible.slice(0, 18).map((e, i) => (
        <Box key={e.id}>
          <Text color={T.ink} bold={i === selectedIdx} inverse={i === selectedIdx}>
            {i === selectedIdx ? '▶ ' : '  '}
            {(e.timestamp ?? '—').slice(0, 19).padEnd(20)}
            {(e.table_name ?? '—').slice(0, 18).padEnd(20)}
            {(e.action ?? '—').slice(0, 8).padEnd(10)}
            {(e.changed_by ?? '—').slice(0, 14).padEnd(16)}
            {String(e.record_id ?? '—').slice(0, 16)}
          </Text>
        </Box>
      ))}

      {filterMode !== 'none' && (
        <Box marginTop={1}>
          <Text color={T.accent}>
            {filterMode === 'table' ? 'Filter by table: ' : 'Filter by record id: '}{filterDraft}█
          </Text>
          <Text dimColor>  [enter] apply  [esc] clear</Text>
        </Box>
      )}

      {filterMode === 'none' && sel && (
        <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor={T.dim} paddingX={1}>
          <Text bold color={T.accent}>Selected entry</Text>
          <Text dimColor>before:</Text>
          <Text>{sel.before ? JSON.stringify(sel.before).slice(0, 200) : '(none)'}</Text>
          <Text dimColor>after:</Text>
          <Text>{sel.after ? JSON.stringify(sel.after).slice(0, 200) : '(none)'}</Text>
        </Box>
      )}
    </Box>
  );
}
