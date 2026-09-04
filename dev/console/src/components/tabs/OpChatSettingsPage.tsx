import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getOperatorChatConfig, updateOperatorChatConfig } from '../../api/client.js';
import { T } from '../../theme/blessed-theme.js';
import { ToggleSwitch } from '../shared/InlineEdit.js';
import { useRowClick } from '../../hooks/useRowClick.js';

const ITEMS_START_ROW = 7;

interface Field {
  key: string;
  label: string;
  type: 'string' | 'number' | 'bool' | 'select';
  options?: string[];
}

const FIELDS: Field[] = [
  // General
  { key: 'pageTimeout',     label: 'Page Timeout (s)',     type: 'number' },
  { key: 'pageCooldown',    label: 'Cooldown (s)',         type: 'number' },
  { key: 'maxActivePages',  label: 'Max Active Pages',     type: 'number' },
  // Discord
  { key: 'discordWebhook',  label: 'Discord Webhook',      type: 'string' },
  { key: 'discordUserId',   label: 'Discord User ID',      type: 'string' },
  // AI
  { key: 'aiEnabled',       label: 'AI Bot Enabled',       type: 'bool' },
  { key: 'aiProvider',      label: 'AI Provider',          type: 'select', options: ['openrouter', 'groq', 'gemini', 'rule-based'] },
  { key: 'aiModelName',     label: 'AI Model Name',        type: 'string' },
  { key: 'openRouterApiKey', label: 'OpenRouter API Key',  type: 'string' },
  { key: 'groqApiKey',      label: 'Groq API Key',         type: 'string' },
  { key: 'geminiApiKey',    label: 'Gemini API Key',       type: 'string' },
  { key: 'aiTemperature',   label: 'AI Temperature',       type: 'number' },
  { key: 'aiSystemPrompt',  label: 'AI System Prompt',     type: 'string' },
];

type Mode = 'list' | 'edit';

function fmtVal(val: unknown, field: Field): string {
  if (val === undefined || val === null) return '—';
  if (field.type === 'bool') return val ? 'on' : 'off';
  if (field.type === 'select') return String(val);
  if (field.key.endsWith('ApiKey')) {
    const s = String(val);
    return s ? s.slice(0, 8) + '…' : '(empty)';
  }
  if (field.key === 'aiSystemPrompt') {
    const s = String(val);
    return s.length > 40 ? s.slice(0, 39) + '…' : s || '(default)';
  }
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

  useEffect(() => { load(); }, [load]);

  const selected = FIELDS[selectedIdx];
  const dirty = Object.keys(pending).length > 0;

  useRowClick(FIELDS.length, ITEMS_START_ROW, setSelectedIdx, mode === 'list');

  const doSave = useCallback(async (patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      await updateOperatorChatConfig(patch);
      setStatus('Saved');
      setPending({});
      await load();
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Save failed'}`);
    } finally {
      setSaving(false);
    }
  }, [load]);

  const handleBoolToggle = useCallback(() => {
    if (!selected || selected.type !== 'bool') return;
    const cur = (pending[selected.key] ?? (config as any)?.[selected.key]) as boolean | undefined;
    const newVal = cur === true ? false : true;
    setPending(p => ({ ...p, [selected.key]: newVal }));
    doSave({ [selected.key]: newVal });
  }, [selected, config, pending, doSave]);

  const handleSelectCycle = useCallback(() => {
    if (!selected || selected.type !== 'select' || !selected.options) return;
    const cur = (pending[selected.key] ?? (config as any)?.[selected.key]) as string;
    const idx = selected.options.indexOf(cur);
    const next = selected.options[(idx + 1) % selected.options.length]!;
    setPending(p => ({ ...p, [selected.key]: next }));
    doSave({ [selected.key]: next });
  }, [selected, config, pending, doSave]);

  useInput((input, key) => {
    if (mode === 'edit') {
      if (key.escape) { setMode('list'); return; }
      if (key.return) {
        if (selected) {
          const t = selected.type;
          let parsed: unknown = editValue;
          if (t === 'number') {
            const n = parseFloat(editValue);
            parsed = isNaN(n) ? 0 : n;
          }
          setPending(p => ({ ...p, [selected.key]: parsed }));
          doSave({ [selected.key]: parsed });
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
    if (key.return && selected) {
      if (selected.type === 'bool') { handleBoolToggle(); return; }
      if (selected.type === 'select') { handleSelectCycle(); return; }
      const cur = (pending[selected.key] ?? (config as any)?.[selected.key]);
      setEditValue(cur === undefined || cur === null ? '' : String(cur));
      setMode('edit');
      return;
    }
    if (input === 's' && dirty && !saving) {
      doSave(pending);
    }
    if (input === 'r') load();
    if (input === 'R') setPending({});
  });

  if (loading) return <Box><Text color={T.warn}><Spinner type="dots" /></Text><Text> Loading config...</Text></Box>;
  if (error) return <Text color={T.alert}>Error: {error}</Text>;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color={T.accent}>OPERATOR CHAT SETTINGS</Text>
        <Text dimColor>  ({FIELDS.length} fields, {dirty ? `${Object.keys(pending).length} pending` : 'clean'})</Text>
      </Box>

      {FIELDS.map((f, i) => {
        const isSel = i === selectedIdx;
        const isPending = f.key in pending;
        const val = isPending ? pending[f.key] : (config as any)?.[f.key];
        const masked = f.key.endsWith('ApiKey') || f.key === 'aiSystemPrompt';
        return (
          <Box key={f.key}>
            <Box flexDirection="row" alignItems="center">
              <Text color={T.ink} bold={isSel} inverse={isSel}>
                {isSel ? '▶ ' : '  '}
              </Text>
              <Text color={isPending ? T.warn : T.dim} inverse={isSel}>{f.label.padEnd(24)}</Text>
              {f.type === 'bool' ? (
                <ToggleSwitch value={!!val} disabled={!isSel || saving} />
              ) : f.type === 'select' ? (
                <Text color={isPending ? T.warn : T.ink} inverse={isSel}>
                  {String(val ?? '—')}{isSel ? ' (enter to cycle)' : ''}
                </Text>
              ) : (
                <Text color={masked ? T.dim : isPending ? T.warn : T.ink} inverse={isSel}>
                  {fmtVal(val, f)}
                </Text>
              )}
            </Box>
          </Box>
        );
      })}

      {saving && (
        <Box marginTop={1}>
          <Text color={T.warn}><Spinner type="dots" /></Text>
          <Text> Saving...</Text>
        </Box>
      )}

      {status && <Box marginTop={1}><Text color={T.ok}>{status}</Text></Box>}

      {mode === 'edit' && selected && selected.type === 'string' && (
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