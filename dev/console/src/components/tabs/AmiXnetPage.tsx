import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getInfoFile, updateInfoFile, type InfoTooltype } from '../../api/client.js';
import { useRowClick } from '../../hooks/useRowClick.js';

const ITEMS_START_ROW = 7;
const AMIXNET_PATH = 'AmiXnet.info';

type Mode = 'view' | 'field-edit';

export function AmiXnetPage() {
  const [tooltypes, setTooltypes] = useState<InfoTooltype[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('view');
  const [editValue, setEditValue] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getInfoFile(AMIXNET_PATH);
      if (data) {
        setTooltypes(data.tooltypes ?? []);
        setError(null);
      } else {
        setError('AmiXnet.info not found');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load AmiXnet.info');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Allow click to select a field
  useRowClick(tooltypes.length, ITEMS_START_ROW, setSelectedIdx, mode === 'view');

  useInput((input, key) => {
    if (mode === 'field-edit') {
      if (key.escape) {
        setMode('view');
        return;
      }
      if (key.return) {
        const field = tooltypes[selectedIdx];
        if (field) {
          const updated = [...tooltypes];
          updated[selectedIdx] = { ...field, value: editValue };
          setTooltypes(updated);
        }
        setMode('view');
        return;
      }
      if (key.backspace || key.delete) {
        setEditValue(v => v.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setEditValue(v => v + input);
      }
      return;
    }

    if (mode === 'view') {
      if (key.upArrow) {
        setSelectedIdx(i => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIdx(i => Math.min(tooltypes.length - 1, i + 1));
        return;
      }
      if (input === 'e') {
        const field = tooltypes[selectedIdx];
        if (field) {
          setEditValue(field.value ?? '');
          setMode('field-edit');
        }
        return;
      }
      if (input === 's' && !saving) {
        setSaving(true);
        updateInfoFile(AMIXNET_PATH, tooltypes)
          .then(() => {
            setStatus('Saved');
            load();
          })
          .catch((e: Error) => setStatus(`Error: ${e.message}`))
          .finally(() => setSaving(false));
        return;
      }
      if (input === 'r') load();
    }
  });

  if (loading) return <Box><Text color="yellow"><Spinner type="dots" /></Text><Text> Loading AmiXnet.info...</Text></Box>;
  if (error) return <Text color="red">Error: {error}</Text>;

  if (mode === 'view') {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="cyan">AMIXNET</Text>
          <Text dimColor>  ({tooltypes.length} settings)</Text>
        </Box>

        {tooltypes.length === 0 ? (
          <Text dimColor>No settings found.</Text>
        ) : (
          tooltypes.map((f, i) => (
            <Box key={f.key}>
              <Text color={i === selectedIdx ? 'cyan' : 'white'} bold={i === selectedIdx}>
                {i === selectedIdx ? '▶ ' : '  '}
                {f.key.padEnd(20)}
                {' = '}
              </Text>
              <Text color="white">
                {f.value ?? ''}
              </Text>
            </Box>
          ))
        )}

        {saving && (
          <Box marginTop={1}>
            <Text color="yellow"><Spinner type="dots" /></Text>
            <Text> Saving...</Text>
          </Box>
        )}

        {status && <Box marginTop={1}><Text color="green">{status}</Text></Box>}

        <Box marginTop={2}>
          <Text dimColor>[↑↓] select  [e]dit value  [s]ave  [r]efresh</Text>
        </Box>
      </Box>
    );
  }

  if (mode === 'field-edit') {
    const field = tooltypes[selectedIdx];
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="cyan">EDIT: {field?.key}</Text>
        </Box>

        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginBottom={2}>
          <Text color="cyan">Value ({field?.key}):</Text>
          <Box>
            <Text>{'> '}</Text>
            <Text>{editValue}█</Text>
          </Box>
        </Box>

        <Text dimColor>[enter] commit  [esc] cancel</Text>
      </Box>
    );
  }

  return <Text>Unknown mode</Text>;
}
