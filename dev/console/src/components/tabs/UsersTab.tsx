import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getUsers, updateUser, deleteUser } from '../../api/client.js';
import { useRowClick } from '../../hooks/useRowClick.js';
import { ConfirmDialog } from '../shared/ConfirmDialog.js';
import type { UserRecord } from '../../api/types.js';

type Mode = 'list' | 'edit-sl' | 'confirm-ban' | 'confirm-delete';

const ITEMS_START_ROW = 10;

function getSecLevel(u: UserRecord): number {
  return u.secLevel ?? u.seclevel ?? 0;
}

export function UsersTab() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [filtered, setFiltered] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [editSlValue, setEditSlValue] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const PAGE = 20;
  const [pageStart, setPageStart] = useState(0);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUsers();
      data.sort((a, b) => a.username.localeCompare(b.username));
      setUsers(data);
      setFiltered(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const visibleUsers = filtered.slice(pageStart, pageStart + PAGE);
  const selected = visibleUsers[selectedIdx];

  // Click a user row to select it (within the current page).
  useRowClick(visibleUsers.length, ITEMS_START_ROW, (idx) => {
    setSelectedIdx(idx);
  }, mode === 'list' && !searching);

  useInput((input, key) => {
    if (searching) {
      if (key.escape) { setSearching(false); setSearchText(''); setFiltered(users); return; }
      if (key.return) { setSearching(false); return; }
      if (key.backspace || key.delete) {
        const next = searchText.slice(0, -1);
        setSearchText(next);
        setFiltered(users.filter(u => u.username.toLowerCase().includes(next.toLowerCase())));
        return;
      }
      if (input && !key.ctrl) {
        const next = searchText + input;
        setSearchText(next);
        setFiltered(users.filter(u => u.username.toLowerCase().includes(next.toLowerCase())));
      }
      return;
    }

    if (mode === 'list') {
      if (key.upArrow) {
        if (selectedIdx > 0) setSelectedIdx(i => i - 1);
        else if (pageStart > 0) { setPageStart(p => p - PAGE); setSelectedIdx(PAGE - 1); }
      }
      if (key.downArrow) {
        if (selectedIdx < visibleUsers.length - 1) setSelectedIdx(i => i + 1);
        else if (pageStart + PAGE < filtered.length) { setPageStart(p => p + PAGE); setSelectedIdx(0); }
      }
      if (input === 'e' && selected) { setEditSlValue(String(getSecLevel(selected))); setMode('edit-sl'); }
      if (input === 'b' && selected) setMode('confirm-ban');
      if (input === 'd' && selected) setMode('confirm-delete');
      if (input === '/') { setSearching(true); setSearchText(''); }
      if (input === 'r') loadUsers();
    } else if (mode === 'edit-sl') {
      if (key.escape) { setMode('list'); return; }
      if (key.return && selected) {
        const sl = parseInt(editSlValue, 10);
        if (!isNaN(sl) && sl >= 0 && sl <= 255) {
          const id = selected.id ?? selected.username;
          updateUser(id, { secLevel: sl })
            .then(() => { setStatus(`SL updated for ${selected.username}`); loadUsers(); setMode('list'); })
            .catch((e: Error) => { setStatus(`Error: ${e.message}`); setMode('list'); });
        }
        return;
      }
      if (key.backspace || key.delete) { setEditSlValue(v => v.slice(0, -1)); return; }
      if (input && /[0-9]/.test(input)) setEditSlValue(v => v + input);
    }
  });

  if (loading) return <Box><Text color="yellow"><Spinner type="dots" /></Text><Text> Loading users...</Text></Box>;
  if (error) return <Text color="red">Error: {error}</Text>;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {'  USER'.padEnd(18)}{'SL'.padEnd(5)}{'CALLS'.padEnd(8)}{'LAST ON'.padEnd(20)}{'LOCATION'}
        </Text>
        <Text dimColor>  ({filtered.length}/{users.length})</Text>
      </Box>

      {visibleUsers.map((u, i) => (
        <Box key={u.username + i}>
          <Text color={i === selectedIdx ? 'cyan' : 'white'} bold={i === selectedIdx}>
            {i === selectedIdx ? '▶ ' : '  '}
            {u.username.padEnd(16)}
            {String(getSecLevel(u)).padEnd(5)}
            {String(u.calls ?? 0).padEnd(8)}
            {(u.lastOn ?? u.lastLogin ?? '—').slice(0, 19).padEnd(20)}
            {(u.location ?? '—').slice(0, 20)}
          </Text>
        </Box>
      ))}

      {searching && (
        <Box marginTop={1}>
          <Text color="cyan">Search: {searchText}█</Text>
          <Text dimColor>  [esc] clear  [enter] done</Text>
        </Box>
      )}

      {status && <Box marginTop={1}><Text color="green">{status}</Text></Box>}

      {mode === 'edit-sl' && selected && (
        <Box marginTop={1} flexDirection="column">
          <Text color="cyan">New SL for {selected.username} (0-255): {editSlValue}█</Text>
          <Text dimColor>[enter] save  [esc] cancel</Text>
        </Box>
      )}

      {mode === 'confirm-ban' && selected && (
        <Box marginTop={1}>
          <ConfirmDialog
            message={`Ban ${selected.username}? (sets SL=0)`}
            onConfirm={() => {
              const id = selected.id ?? selected.username;
              updateUser(id, { secLevel: 0 })
                .then(() => { setStatus(`${selected.username} banned`); loadUsers(); })
                .catch((e: Error) => setStatus(`Error: ${e.message}`));
              setMode('list');
            }}
            onCancel={() => setMode('list')}
          />
        </Box>
      )}

      {mode === 'confirm-delete' && selected && (
        <Box marginTop={1}>
          <ConfirmDialog
            message={`Delete ${selected.username}? This cannot be undone.`}
            onConfirm={() => {
              const id = selected.id ?? selected.username;
              deleteUser(id)
                .then(() => { setStatus(`${selected.username} deleted`); loadUsers(); setSelectedIdx(0); })
                .catch((e: Error) => setStatus(`Error: ${e.message}`));
              setMode('list');
            }}
            onCancel={() => setMode('list')}
          />
        </Box>
      )}
    </Box>
  );
}
