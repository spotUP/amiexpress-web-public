import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import Spinner from 'ink-spinner';
import { getDoors, reloadDoors } from '../../api/client.js';
import { useGridClick } from '../../hooks/useRowClick.js';
import { SIDEBAR_WIDTH } from '../Sidebar.js';
import { ConfirmDialog } from '../shared/ConfirmDialog.js';
import type { DoorInfo } from '../../api/types.js';

const ITEM_WIDTH = 32; // command(4) + type(8) + name(18) + padding(2)
const ITEMS_START_ROW = 7;
const ITEMS_START_COL = SIDEBAR_WIDTH + 2; // sidebar (22) + paddingX=1 (1) + 1 = 24

function formatItem(d: DoorInfo, isSelected: boolean): string {
  const cursor = isSelected ? '▶ ' : '  ';
  const cmd = (d.door_command ?? String(d.id)).slice(0, 4).padEnd(5);
  const type = `(${(d.door_type ?? '—').slice(0, 5).padEnd(5)})`;
  const name = d.door_name.slice(0, 16).padEnd(17);
  return `${cursor}${cmd}${type} ${name}`;
}

export function DoorsTab() {
  const [doors, setDoors] = useState<DoorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);

  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;
  const cols = Math.max(1, Math.min(4, Math.floor(termWidth / ITEM_WIDTH)));

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

  const rowsPerCol = Math.ceil(doors.length / cols);

  useGridClick(
    ITEMS_START_ROW,
    ITEMS_START_COL,
    ITEM_WIDTH,
    rowsPerCol,
    doors.length,
    setSelectedIdx,
    !confirming,
  );

  useInput((input, key) => {
    if (confirming) return;
    if (key.upArrow) {
      setSelectedIdx(i => (i % rowsPerCol === 0 ? i : i - 1));
    }
    if (key.downArrow) {
      setSelectedIdx(i => {
        if (i + 1 >= doors.length) return i;
        if ((i + 1) % rowsPerCol === 0) return i;
        return i + 1;
      });
    }
    if (key.leftArrow) {
      setSelectedIdx(i => Math.max(0, i - rowsPerCol));
    }
    if (key.rightArrow) {
      setSelectedIdx(i => Math.min(doors.length - 1, i + rowsPerCol));
    }
    if (input === 'R') setConfirming(true);
    if (input === 'r') load();
  });

  if (loading) return <Box><Text color="yellow"><Spinner type="dots" /></Text><Text> Loading doors...</Text></Box>;
  if (error) return <Text color="red">Error: {error}</Text>;

  const enabledCount = doors.filter(d => d.enabled).length;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">DOORS</Text>
        <Text dimColor>  ({enabledCount}/{doors.length} enabled, {cols} cols)</Text>
      </Box>

      {Array.from({ length: rowsPerCol }, (_, rowIdx) => (
        <Box key={rowIdx}>
          {Array.from({ length: cols }, (_, colIdx) => {
            const idx = colIdx * rowsPerCol + rowIdx;
            const door = doors[idx];
            if (!door) return <Box key={colIdx} width={ITEM_WIDTH}><Text> </Text></Box>;
            const isSelected = idx === selectedIdx;
            return (
              <Box key={colIdx} width={ITEM_WIDTH}>
                <Text
                  color={isSelected ? 'cyan' : door.enabled ? 'white' : 'gray'}
                  bold={isSelected}
                >
                  {formatItem(door, isSelected)}
                </Text>
              </Box>
            );
          })}
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
