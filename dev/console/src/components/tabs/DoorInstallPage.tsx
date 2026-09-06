import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getDoors, installDoorArchive } from '../../api/client.js';
import type { DoorInfo } from '../../api/types.js';
import { T, BlessedBox, BlessedText } from '../../theme/blessed-theme.js';

type Mode = 'list' | 'install';

// One page of the list, matching CrudList's paging so both lists behave the
// same way under the arrow keys. The list is paged, never truncated - with
// 116 doors installed, "... and 101 more" was a dead end.
const PAGE = 20;

export function DoorInstallPage() {
  const [doors, setDoors] = useState<DoorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('list');
  const [installPath, setInstallPath] = useState('');
  const [installing, setInstalling] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [pageStart, setPageStart] = useState(0);

  const loadDoors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDoors();
      setDoors(data);
      setPageStart(0);
      setSelectedIdx(0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load doors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDoors();
  }, [loadDoors]);

  const handleInstall = async () => {
    if (!installPath.trim()) {
      setStatus('Error: Path required');
      return;
    }
    setInstalling(true);
    try {
      const result = await installDoorArchive({ path: installPath });
      setStatus(result.message ?? 'Installed successfully');
      setInstallPath('');
      setMode('list');
      await loadDoors();
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setInstalling(false);
    }
  };

  const visibleDoors = doors.slice(pageStart, pageStart + PAGE);
  const pageCount = Math.max(1, Math.ceil(doors.length / PAGE));
  const pageNumber = Math.floor(pageStart / PAGE) + 1;

  useInput((input, key) => {
    if (mode === 'install') {
      if (key.escape) { setMode('list'); setInstallPath(''); return; }
      if (key.return) { handleInstall(); return; }
      if (key.backspace || key.delete) { setInstallPath(v => v.slice(0, -1)); return; }
      if (input && !key.ctrl && !key.meta) setInstallPath(v => v + input);
      return;
    }
    if (input === 'i') { setMode('install'); return; }
    if (input === 'r') { loadDoors(); return; }

    // Arrows walk the page and roll onto the next one at its edges, exactly
    // as CrudList does.
    if (key.upArrow) {
      if (selectedIdx > 0) setSelectedIdx(i => i - 1);
      else if (pageStart > 0) { setPageStart(p => p - PAGE); setSelectedIdx(PAGE - 1); }
      return;
    }
    if (key.downArrow) {
      if (selectedIdx < visibleDoors.length - 1) setSelectedIdx(i => i + 1);
      else if (pageStart + PAGE < doors.length) { setPageStart(p => p + PAGE); setSelectedIdx(0); }
      return;
    }
    if (key.pageUp) {
      setPageStart(p => Math.max(0, p - PAGE));
      setSelectedIdx(0);
      return;
    }
    if (key.pageDown) {
      setPageStart(p => (p + PAGE < doors.length ? p + PAGE : p));
      setSelectedIdx(0);
      return;
    }
    if (input === 'g') { setPageStart(0); setSelectedIdx(0); return; }
    if (input === 'G') {
      const lastPage = Math.max(0, Math.floor((doors.length - 1) / PAGE) * PAGE);
      setPageStart(lastPage);
      setSelectedIdx(Math.max(0, doors.length - lastPage - 1));
      return;
    }
  });

  if (loading) return <Box><Text color={T.warn}><Spinner type="dots" /></Text><Text> Loading doors...</Text></Box>;



  return (
    <Box flexDirection="column">
      <Box marginBottom={1} flexDirection="row" gap={2}>
        <BlessedText variant="accent" bold>INSTALLED DOORS</BlessedText>
        <BlessedText variant="dim">({doors.length} doors)</BlessedText>
      </Box>

      {error && <BlessedText variant="alert">Error: {error}</BlessedText>}

      {visibleDoors.map((d, i) => (
        <Box key={d.door_name ?? `door-${pageStart + i}`}>
          <Text
            color={i === selectedIdx ? T.selectionInk : undefined}
            inverse={i === selectedIdx}
            bold={i === selectedIdx}
          >
            {d.door_name ?? '(unnamed)'}
          </Text>
          {d.door_command && <BlessedText variant="dim">  [{d.door_command}]</BlessedText>}
        </Box>
      ))}
      {doors.length > PAGE && (
        <Box marginTop={1}>
          <BlessedText variant="dim">
            Showing {pageStart + 1}-{pageStart + visibleDoors.length} of {doors.length}
            {'  -  page '}{pageNumber}/{pageCount}
          </BlessedText>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        {mode === 'install' ? (
          <BlessedBox style="line" label="Install Door" padding={1}>
            <Box flexDirection="row">
              <BlessedText>Path:</BlessedText>
              <Text color={T.accent}>{installPath}</Text>
              {installing && <Text color={T.accent}> [installing...]</Text>}
            </Box>
            {status && (
              <BlessedText variant={status.includes('Error') ? 'alert' : 'ok'}>{status}</BlessedText>
            )}
            <BlessedText variant="dim">[enter] install  [esc] cancel</BlessedText>
          </BlessedBox>
        ) : (
          <Box flexDirection="row" gap={1}>
            <Text color={T.dim}>[up/down] move  [pgup/pgdn] page  [g/G] first/last  [i] install path  [r] refresh</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}