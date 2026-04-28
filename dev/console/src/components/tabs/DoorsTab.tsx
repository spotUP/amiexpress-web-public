import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getDoors, reloadDoors } from '../../api/client.js';
import { ConfirmDialog } from '../shared/ConfirmDialog.js';
import type { DoorInfo } from '../../api/types.js';

export function DoorsTab() {
  const [doors, setDoors] = useState<DoorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDoors();
      setDoors(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useInput((input, key) => {
    if (confirming) return;
    if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
    if (key.downArrow) setSelectedIdx(i => Math.min(doors.length - 1, i + 1));
    if (input === 'R') setConfirming(true);
    if (input === 'r') load();
  });

  if (loading) return <Box><Text color="yellow"><Spinner type="dots" /></Text><Text> Loading doors...</Text></Box>;
  if (error) return <Text color="red">Error: {error}</Text>;

  const enabledCount = doors.filter(d => d.enabled).length;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {'  COMMAND'.padEnd(20)}{'TYPE'.padEnd(10)}{'NAME'.padEnd(30)}{'STATUS'}
        </Text>
        <Text dimColor>  ({enabledCount}/{doors.length} enabled)</Text>
      </Box>

      {doors.map((d, i) => (
        <Box key={String(d.id)}>
          <Text color={i === selectedIdx ? 'cyan' : d.enabled ? 'white' : 'gray'} bold={i === selectedIdx}>
            {i === selectedIdx ? '▶ ' : '  '}
            {(d.door_command ?? String(d.id)).slice(0, 17).padEnd(18)}
            {(d.door_type ?? '—').slice(0, 8).padEnd(10)}
            {d.door_name.slice(0, 28).padEnd(30)}
            {d.enabled ? '' : '(disabled)'}
          </Text>
        </Box>
      ))}

      {reloading && (
        <Box marginTop={1}>
          <Text color="yellow"><Spinner type="dots" /></Text>
          <Text> Reloading all doors...</Text>
        </Box>
      )}

      {status && <Box marginTop={1}><Text color="green">{status}</Text></Box>}

      {confirming && (
        <Box marginTop={1}>
          <ConfirmDialog
            message="Reload all doors? (briefly restarts door watcher)"
            onConfirm={() => {
              setConfirming(false);
              setReloading(true);
              reloadDoors()
                .then(() => setStatus('All doors reloaded'))
                .catch((e: Error) => setStatus(`Error: ${e.message}`))
                .finally(() => { setReloading(false); load(); });
            }}
            onCancel={() => setConfirming(false)}
          />
        </Box>
      )}
    </Box>
  );
}
