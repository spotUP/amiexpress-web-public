import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getSystemConfig, updateSystemConfig } from '../../api/client.js';
import { T } from '../../theme/blessed-theme.js';
import { ToggleSwitch, InlineEdit } from '../shared/InlineEdit.js';
import { useRowClick } from '../../hooks/useRowClick.js';
import type { SystemConfig } from '../../api/types.js';

const ITEMS_START_ROW = 7;

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

export function SystemConfigPage() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSystemConfig();
      setConfig(data ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selected = FIELDS[selectedIdx];

  const doSave = useCallback(async (key: string, value: unknown) => {
    setSavingKey(key);
    setSaving(true);
    setStatus(null);
    try {
      await updateSystemConfig({ [key]: value });
      const field = FIELDS.find(f => f.key === key);
      setStatus(`${field?.label ?? key} saved`);
      await load();
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Save failed'}`);
    } finally {
      setSaving(false);
      setSavingKey(null);
    }
  }, [load]);

  const commitEdit = useCallback(() => {
    if (!selected) return;
    const t = selected.type;
    let parsed: unknown = editValue;
    if (t === 'number') {
      const n = parseFloat(editValue);
      parsed = isNaN(n) ? 0 : n;
    } else if (t === 'bool') {
      parsed = /^(1|on|true|yes|y)$/i.test(editValue);
    }
    doSave(selected.key, parsed);
    setMode('list');
  }, [selected, editValue, doSave]);

  const toggleBool = useCallback(() => {
    if (!selected || selected.type !== 'bool') return;
    const cur = (config as any)?.[selected.key];
    doSave(selected.key, !cur);
  }, [selected, config, doSave]);

  useRowClick(FIELDS.length, ITEMS_START_ROW, setSelectedIdx, mode === 'list');

  useInput((input, key) => {
    if (mode === 'edit') {
      if (key.escape) { setMode('list'); return; }
      if (key.return) { commitEdit(); return; }
      if (key.backspace || key.delete) { setEditValue(v => v.slice(0, -1)); return; }
      if (input && !key.ctrl && !key.meta) setEditValue(v => v + input);
      return;
    }

    if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
    if (key.downArrow) setSelectedIdx(i => Math.min(FIELDS.length - 1, i + 1));
    if (key.return && selected && selected.type === 'bool') {
      toggleBool();
    } else if (key.return && selected) {
      const cur = (config as any)?.[selected.key];
      setEditValue(cur === undefined || cur === null ? '' : String(cur));
      setMode('edit');
    }
    if (input === 'r') load();
  });

  if (loading) return <Box><Text color={T.warn}><Spinner type="dots" /></Text><Text> Loading config...</Text></Box>;
  if (error) return <Text color={T.alert}>Error: {error}</Text>;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color={T.accent}>SYSTEM CONFIG</Text>
      </Box>

      {FIELDS.map((f, i) => {
        const isSel = i === selectedIdx;
        const val = (config as any)?.[f.key];
        const masked = typeof val === 'string' && val === '***';
        const isSavingField = saving && savingKey === f.key;
        return (
          <Box key={f.key}>
            <Box flexDirection="row" alignItems="center">
              <Text color={T.ink} bold={isSel} inverse={isSel}>
                {isSel ? '▶ ' : '  '}
              </Text>
              <Text color={T.dim} inverse={isSel}>{f.label.padEnd(22)}</Text>
              {f.type === 'bool' ? (
                <ToggleSwitch value={!!val} disabled={!isSel || saving} />
              ) : (
                <Text color={masked ? T.dim : isSavingField ? T.warn : T.ink} inverse={isSel}>
                  {masked ? '***' : String(val ?? '—')}
                  {isSavingField && <Spinner type="dots" />}
                </Text>
              )}
            </Box>
          </Box>
        );
      })}

      {status && !saving && <Box marginTop={1}><Text color={T.ok}>{status}</Text></Box>}

      {mode === 'edit' && selected && selected.type !== 'bool' && (
        <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor={T.warn} paddingX={1}>
          <Text color={T.accent}>Edit {selected.label}:</Text>
          <Box>
            <Text>{'> '}</Text>
            <Text>{editValue}█</Text>
          </Box>
          <Text dimColor>[enter] save  [esc] cancel</Text>
        </Box>
      )}
    </Box>
  );
}
