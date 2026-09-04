import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import Spinner from 'ink-spinner';
import { getDoors, reloadDoors, updateDoor } from '../../api/client.js';
import { T } from '../../theme/blessed-theme.js';
import { ToggleSwitch } from '../shared/InlineEdit.js';
import { useGridClick } from '../../hooks/useRowClick.js';
import { SIDEBAR_WIDTH } from '../Sidebar.js';
import { ConfirmDialog } from '../shared/ConfirmDialog.js';
import type { DoorInfo } from '../../api/types.js';

const ITEM_WIDTH = 32;
const ITEMS_START_ROW = 7;
const ITEMS_START_COL = SIDEBAR_WIDTH + 2;

function formatItem(d: DoorInfo, isSelected: boolean): string {
  const cursor = isSelected ? '▶ ' : '  ';
  const cmd = (d.door_command ?? String(d.id)).slice(0, 4).padEnd(5);
  const type = `(${(d.door_type ?? '—').slice(0, 5).padEnd(5)})`;
  const name = d.door_name.slice(0, 16).padEnd(17);
  return `${cursor}${cmd}${type} ${name}`;
}

const EDIT_FIELDS = [
  { key: 'enabled',    label: 'Enabled',  type: 'bool' as const },
  { key: 'door_name',  label: 'Name',     type: 'string' as const },
  { key: 'door_command', label: 'Command', type: 'string' as const },
];

export function DoorsTab() {
  const [doors, setDoors] = useState<DoorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editFieldIdx, setEditFieldIdx] = useState(0);
  const [editValues, setEditValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;
  const contentWidth = termWidth - SIDEBAR_WIDTH - 4;
  const cols = Math.max(1, Math.min(4, Math.floor(contentWidth / ITEM_WIDTH)));

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
  const selected = doors[selectedIdx];

  const startEdit = () => {
    if (!selected) return;
    setEditFieldIdx(0);
    setEditValues({
      enabled: selected.enabled,
      door_name: selected.door_name,
      door_command: selected.door_command ?? '',
    });
    setEditing(true);
    setStatus(null);
  };

  const saveValue = async (key: string, val: unknown) => {
    if (!selected) return;
    setSaving(true);
    try {
      await updateDoor(selected!.id, { [key]: val });
      setStatus(`${key} saved`);
      await load();
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Save failed'}`);
    } finally {
      setSaving(false);
    }
  };

  const commitField = () => {
    const field = EDIT_FIELDS[editFieldIdx];
    if (!field || !selected) return;
    const val = editValues[field.key];
    if (field.type === 'bool') {
      saveValue(field.key, val);
    } else {
      const s = String(val ?? '');
      if (s !== (selected as any)[field.key]) {
        saveValue(field.key, s);
      }
    }
  };

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

    if (editing) {
      const field = EDIT_FIELDS[editFieldIdx];
      if (key.escape) { setEditing(false); return; }
      if (field.type === 'bool') {
        if (input === ' ') {
          const newVal = !editValues[field.key];
          setEditValues(v => ({ ...v, [field.key]: newVal }));
          saveValue(field.key, newVal);
          return;
        }
        if (key.return) {
          if (editFieldIdx < EDIT_FIELDS.length - 1) setEditFieldIdx(i => i + 1);
          else setEditing(false);
          return;
        }
      } else {
        if (key.return) {
          commitField();
          if (editFieldIdx < EDIT_FIELDS.length - 1) setEditFieldIdx(i => i + 1);
          else setEditing(false);
          return;
        }
        if (key.backspace || key.delete) {
          setEditValues(v => ({ ...v, [field.key]: String(v[field.key] ?? '').slice(0, -1) }));
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          setEditValues(v => ({ ...v, [field.key]: String(v[field.key] ?? '') + input }));
        }
      }
      return;
    }

    if (key.upArrow) setSelectedIdx(i => (i % rowsPerCol === 0 ? i : i - 1));
    if (key.downArrow) setSelectedIdx(i => {
      if (i + 1 >= doors.length) return i;
      if ((i + 1) % rowsPerCol === 0) return i;
      return i + 1;
    });
    if (key.leftArrow) setSelectedIdx(i => Math.max(0, i - rowsPerCol));
    if (key.rightArrow) setSelectedIdx(i => Math.min(doors.length - 1, i + rowsPerCol));
    if (input === 'e' && selected) startEdit();
    if (input === 'R') setConfirming(true);
    if (input === 'r') load();
  });

  if (loading) return <Box><Text color={T.warn}><Spinner type="dots" /></Text><Text> Loading doors...</Text></Box>;
  if (error) return <Text color={T.alert}>Error: {error}</Text>;

  const enabledCount = doors.filter(d => d.enabled).length;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color={T.accent}>DOORS</Text>
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
                  color={door.enabled ? T.ink : T.dim}
                  bold={isSelected && !editing}
                  inverse={isSelected && !editing}
                >
                  {formatItem(door, isSelected)}
                </Text>
              </Box>
            );
          })}
        </Box>
      ))}

      {editing && selected && (
        <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor={T.warn} paddingX={1}>
          <Text bold color={T.warn}>EDIT: {selected.door_name}</Text>
          {EDIT_FIELDS.map((field, i) => (
            <Box key={field.key} marginTop={i > 0 ? 0 : 0}>
              <Text color={i === editFieldIdx ? T.warn : T.ink}>
                {i === editFieldIdx ? '> ' : '  '}
                {field.label}:{' '}
                {field.type === 'bool' ? (
                  <ToggleSwitch value={!!editValues[field.key]} />
                ) : (
                  <Text color={T.accent}>{String(editValues[field.key] ?? '')}{i === editFieldIdx ? '█' : ''}</Text>
                )}
              </Text>
            </Box>
          ))}
          {saving && <Text color={T.dim}> saving...</Text>}
          <Text dimColor>[enter] next field  [space] toggle  [esc] cancel</Text>
        </Box>
      )}

      {reloading && (
        <Box marginTop={1}>
          <Text color={T.warn}><Spinner type="dots" /></Text>
          <Text> Reloading all doors...</Text>
        </Box>
      )}

      {status && <Box marginTop={1}><Text color={T.ok}>{status}</Text></Box>}

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
