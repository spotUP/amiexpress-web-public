import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getDoors, installDoorArchive } from '../../api/client.js';
import type { DoorInfo } from '../../api/types.js';

const ITEMS_START_ROW = 7;

type Mode = 'list' | 'install';

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

  if (loading) return <Box><Text color="yellow"><Spinner type="dots" /></Text><Text> Loading doors...</Text></Box>;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">INSTALLED DOORS</Text>
        <Text dimColor>  ({doors.length} doors)</Text>
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {doors.map((d, i) => (
        <Box key={`${d.door_name}-${i}`}>
          <Text>{d.door_name ?? '(unnamed)'}</Text>
          {d.door_command && <Text dimColor>  [{d.door_command}]</Text>}
        </Box>
      ))}

      <Box marginTop={2} flexDirection="column">
        <Text bold color="yellow">Install Door Archive</Text>
        <Box marginTop={1} borderStyle="round" borderColor="yellow" padding={1} width={60}>
          <Box flexDirection="column" width={58}>
            <Box>
              <Text>Path: </Text>
              <Text color="cyan">{installPath}</Text>
              {installing && <Text color="yellow"> [installing...]</Text>}
            </Box>
            {status && (
              <Box marginTop={1}>
                <Text color={status.includes('Error') ? 'red' : 'green'}>{status}</Text>
              </Box>
            )}
            <Box marginTop={1}>
              <Text dimColor>[enter] install  [esc] cancel</Text>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>[i]nstall path  [r]efresh  [↑↓] scroll</Text>
      </Box>
    </Box>
  );
}
