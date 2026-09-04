import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getDoors, installDoorArchive } from '../../api/client.js';
import type { DoorInfo } from '../../api/types.js';
import { T, BlessedBox, BlessedText } from '../../theme/blessed-theme.js';

type Mode = 'list' | 'install';

const MAX_DISPLAY_DOORS = 15;

export function DoorInstallPage() {
  const [doors, setDoors] = useState<DoorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('list');
  const [installPath, setInstallPath] = useState('');
  const [installing, setInstalling] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const loadDoors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDoors();
      setDoors(data);
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

  useInput((input, key) => {
    if (mode === 'install') {
      if (key.escape) { setMode('list'); setInstallPath(''); return; }
      if (key.return) { handleInstall(); return; }
      if (key.backspace || key.delete) { setInstallPath(v => v.slice(0, -1)); return; }
      if (input && !key.ctrl && !key.meta) setInstallPath(v => v + input);
      return;
    }
    if (input === 'i') setMode('install');
    if (input === 'r') loadDoors();
  });

  if (loading) return <Box><Text color={T.warn}><Spinner type="dots" /></Text><Text> Loading doors...</Text></Box>;

  const displayDoors = doors.slice(0, MAX_DISPLAY_DOORS);
  const remaining = doors.length - MAX_DISPLAY_DOORS;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1} flexDirection="row" gap={2}>
        <BlessedText variant="accent" bold>INSTALLED DOORS</BlessedText>
        <BlessedText variant="dim">({doors.length} doors)</BlessedText>
      </Box>

      {error && <BlessedText variant="alert">Error: {error}</BlessedText>}

      {displayDoors.map(d => (
        <Box key={d.door_name}>
          <BlessedText>{d.door_name ?? '(unnamed)'}</BlessedText>
          {d.door_command && <BlessedText variant="dim">  [{d.door_command}]</BlessedText>}
        </Box>
      ))}
      {remaining > 0 && <BlessedText variant="dim">... and {remaining} more</BlessedText>}

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
            <Text color={T.dim}>[i] install path  [r] refresh</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}