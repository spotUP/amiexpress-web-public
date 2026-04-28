import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getSystemConfig, updateSystemConfig } from '../../api/client.js';
import { useRowClick } from '../../hooks/useRowClick.js';
import type { SystemConfig } from '../../api/types.js';

const ITEMS_START_ROW = 7;

// Fields to surface in the TUI editor. Each entry: [key, label, type].
// Sensitive fields (smtp_password, reg_key) come back as '***' from the
// backend; we exclude them so the user can't accidentally overwrite.
const FIELDS: Array<{ key: string; label: string; type: 'string' | 'number' | 'bool' }> = [
  { key: 'bbs_name',                label: 'BBS Name',           type: 'string' },
  { key: 'sysop_name',              label: 'Sysop Name',         type: 'string' },
  { key: 'max_nodes',               label: 'Max Nodes',          type: 'number' },
  { key: 'telnet_port',             label: 'Telnet Port',        type: 'number' },
  { key: 'ssh_port',                label: 'SSH Port',           type: 'number' },
  { key: 'new_user_sec_level',      label: 'New User SL',        type: 'number' },
  { key: 'new_user_time_limit',     label: 'New User Time',      type: 'number' },
  { key: 'new_user_chat_limit',     label: 'New User Chat',      type: 'number' },
  { key: 'new_user_lines_per_screen', label: 'New User Lines/Scr', type: 'number' },
  { key: 'new_user_expert',         label: 'New User Expert',    type: 'bool' },
  { key: 'new_user_ansi',           label: 'New User ANSI',      type: 'bool' },
  { key: 'new_user_password',       label: 'New User Password',  type: 'string' },
  { key: 'auto_validation_password', label: 'Auto Validate Pwd', type: 'string' },
  { key: 'auto_validation_sec_level', label: 'Auto Validate SL', type: 'number' },
  { key: 'system_password',         label: 'System Password',    type: 'string' },
  { key: 'sysop_email',             label: 'Sysop Email',        type: 'string' },
  { key: 'smtp_host',               label: 'SMTP Host',          type: 'string' },
  { key: 'smtp_port',               label: 'SMTP Port',          type: 'number' },
  { key: 'smtp_username',           label: 'SMTP Username',      type: 'string' },
  { key: 'cors_origins',            label: 'CORS Origins',       type: 'string' },
];

type Mode = 'list' | 'edit';

function fmtVal(val: unknown, type: 'string' | 'number' | 'bool'): string {
  if (val === undefined || val === null) return '—';
  if (type === 'bool') return val ? 'on' : 'off';
  return String(val);
}

export function SystemConfigPage() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
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
      const data = await getSystemConfig();
      setConfig(data ?? null);
      setPending({});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selected = FIELDS[selectedIdx];
  const dirty = Object.keys(pending).length > 0;

  // Allow click to select a field
  useRowClick(FIELDS.length, ITEMS_START_ROW, setSelectedIdx, mode === 'list');

  useInput((input, key) => {
    if (mode === 'edit') {
      if (key.escape) { setMode('list'); return; }
      if (key.return) {
        // commit pending edit
        if (selected) {
          const t = selected.type;
          let parsed: unknown = editValue;
          if (t === 'number') {
            const n = parseFloat(editValue);
            parsed = isNaN(n) ? 0 : n;
          } else if (t === 'bool') {
            parsed = /^(1|on|true|yes|y)$/i.test(editValue);
          }
          setPending(p => ({ ...p, [selected.key]: parsed }));
        }
        setMode('list');
        return;
      }
      if (key.backspace || key.delete) { setEditValue(v => v.slice(0, -1)); return; }
      if (input && !key.ctrl && !key.meta) setEditValue(v => v + input);
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
      updateSystemConfig(pending)
        .then(() => { setStatus('Saved'); setPending({}); load(); })
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
        <Text bold color="cyan">SYSTEM CONFIG</Text>
        <Text dimColor>  ({FIELDS.length} fields, {dirty ? `${Object.keys(pending).length} pending` : 'clean'})</Text>
      </Box>

      {FIELDS.map((f, i) => {
        const isSel = i === selectedIdx;
        const isPending = f.key in pending;
        const val = isPending ? pending[f.key] : (config as any)?.[f.key];
        const masked = typeof val === 'string' && val === '***';
        return (
          <Box key={f.key}>
            <Text color={isSel ? 'cyan' : isPending ? 'yellow' : 'white'} bold={isSel}>
              {isSel ? '▶ ' : '  '}
              {f.label.padEnd(22)}
              {isPending ? '* ' : '  '}
            </Text>
            <Text color={masked ? 'gray' : isPending ? 'yellow' : 'white'}>
              {fmtVal(val, f.type)}
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
