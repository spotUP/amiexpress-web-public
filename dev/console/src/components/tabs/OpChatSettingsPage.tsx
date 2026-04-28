import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getOperatorChatConfig, updateOperatorChatConfig } from '../../api/client.js';
import { useRowClick } from '../../hooks/useRowClick.js';

const ITEMS_START_ROW = 7;

interface Field {
  key: string;
  label: string;
  type: 'string' | 'number';
}

// Backend uses camelCase fields nested under data.
const FIELDS: Field[] = [
  { key: 'pageTimeout',      label: 'Page Timeout (s)',  type: 'number' },
  { key: 'pageCooldown',     label: 'Cooldown (s)',      type: 'number' },
  { key: 'maxActivePages',   label: 'Max Active Pages',  type: 'number' },
  { key: 'discordWebhook',   label: 'Discord Webhook',   type: 'string' },
  { key: 'discordUserId',    label: 'Discord User ID',   type: 'string' },
];

type Mode = 'list' | 'edit';

function fmtVal(val: unknown): string {
  if (val === undefined || val === null) return '—';
  return String(val);
}

export function OpChatSettingsPage() {
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [pending, setPending] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getOperatorChatConfig();
      setConfig(data ?? null);
      setPending({});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = FIELDS[selectedIdx];
  const dirty = Object.keys(pending).length > 0;

  // Allow click to select a field
  useRowClick(FIELDS.length, ITEMS_START_ROW, setSelectedIdx, mode === 'list');

  useInput((input, key) => {
    if (mode === 'edit') {
      if (key.escape) {
        setMode('list');
        return;
      }
      if (key.return) {
        if (selected) {
          let parsed: unknown = editValue;
          if (selected.type === 'number') {
            const n = parseFloat(editValue);
            parsed = isNaN(n) ? 0 : n;
          }
          setPending(p => ({ ...p, [selected.key]: parsed }));
        }
        setMode('list');
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

    if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
    if (key.downArrow) setSelectedIdx(i => Math.min(FIELDS.length - 1, i + 1));
    if (input === 'e' && selected) {
      const cur = (pending[selected.key] ?? (config as any)?.[selected.key]);
      setEditValue(cur === undefined || cur === null ? '' : String(cur));
      setMode('edit');
    }
    if (input === 's' && dirty && !saving) {
      setSaving(true);
      updateOperatorChatConfig(pending)
        .then(() => {
          setStatus('Saved');
          setPending({});
          load();
        })
        .catch((e: Error) => setStatus(`Error: ${e.message}`))
        .finally(() => setSaving(false));
    }
    if (input === 'r') load();
    if (input === 'R') setPending({});
  });

  if (loading) return <Box><Text color="yellow"><Spinner type="dots" /></Text><Text> Loading config...</Text></Box>;
  if (error) return <Text color="red">Error: {error}</Text>;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">OPERATOR CHAT SETTINGS</Text>
        <Text dimColor>  ({FIELDS.length} fields, {dirty ? `${Object.keys(pending).length} pending` : 'clean'})</Text>
      </Box>

      {FIELDS.map((f, i) => {
        const isSel = i === selectedIdx;
        const isPending = f.key in pending;
        const val = isPending ? pending[f.key] : (config as any)?.[f.key];
        return (
          <Box key={f.key}>
            <Text color={isSel ? 'cyan' : isPending ? 'yellow' : 'white'} bold={isSel}>
              {isSel ? '▶ ' : '  '}
              {f.label.padEnd(22)}
              {isPending ? '* ' : '  '}
            </Text>
            <Text color={isPending ? 'yellow' : 'white'}>
              {fmtVal(val)}
            </Text>
          </Box>
        );
      })}

      {saving && (
        <Box marginTop={1}>
          <Text color="yellow"><Spinner type="dots" /></Text>
          <Text> Saving...</Text>
        </Box>
      )}

      {status && <Box marginTop={1}><Text color="green">{status}</Text></Box>}

      {mode === 'edit' && selected && (
        <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text color="cyan">Edit {selected.label} ({selected.type}):</Text>
          <Box>
            <Text>{'> '}</Text>
            <Text>{editValue}█</Text>
          </Box>
          <Text dimColor>[enter] commit  [esc] cancel</Text>
        </Box>
      )}
    </Box>
  );
}
