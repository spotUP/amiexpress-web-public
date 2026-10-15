/**
 * Admin Roles — the minimum security level required to reach each admin
 * section. A sysop away from a browser could not re-delegate this at all:
 * the TUI shipped no page, no registry entry, and no client methods for
 * /api/admin-permissions (web-vs-tui-admin-gap-audit.md, destination table).
 *
 * Matched against web/config-app/src/pages/AdminRolesPage.tsx: same two
 * calls (getAdminPermissions/setAdminPermissions), same "dirty" gate on
 * save, same reset-to-defaults action using each section's own
 * defaultMinLevel rather than a hardcoded value.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getAdminPermissions, setAdminPermissions, type AdminSectionPerm } from '../../api/client.js';
import { T } from '../../theme/blessed-theme.js';
import { useTextEntryLock } from '../../hooks/useTextEntryLock.js';

type Mode = 'list' | 'edit';

function levelColor(v: number): string {
  if (v >= 255) return T.alert;
  if (v >= 100) return T.warn;
  return T.ok;
}

export function AdminRolesPage() {
  const [sections, setSections] = useState<AdminSectionPerm[]>([]);
  const [perms, setPerms] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [editValue, setEditValue] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminPermissions();
      setSections(data.sections ?? []);
      setPerms(data.perms ?? {});
      setDraft({ ...(data.perms ?? {}) });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load admin permissions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const dirty = JSON.stringify(perms) !== JSON.stringify(draft);
  const selected = sections[selectedIdx];

  // Idle state already reads up/down to move the selection, same reason
  // SecurityPage locks even before entering its own 'edit' mode - see
  // dev/console/src/state/text-entry-lock.ts.
  useTextEntryLock(!loading && !error && sections.length > 0);

  const doSave = useCallback(() => {
    setSaving(true);
    setStatus(null);
    setAdminPermissions(draft)
      .then((res) => {
        setPerms(res.perms);
        setDraft({ ...res.perms });
        setStatus('Saved');
      })
      .catch((e: Error) => setStatus(`Error: ${e.message}`))
      .finally(() => setSaving(false));
  }, [draft]);

  const doReset = useCallback(() => {
    const defaults: Record<string, number> = {};
    for (const s of sections) defaults[s.key] = s.defaultMinLevel;
    setDraft(defaults);
    setStatus('Reset to defaults (not yet saved)');
  }, [sections]);

  useInput((input, key) => {
    if (mode === 'edit') {
      if (key.escape) { setMode('list'); return; }
      if (key.return) {
        const n = parseInt(editValue, 10);
        if (selected && !isNaN(n) && n >= 0 && n <= 255) {
          setDraft(d => ({ ...d, [selected.key]: n }));
        }
        setMode('list');
        return;
      }
      if (key.backspace || key.delete) { setEditValue(v => v.slice(0, -1)); return; }
      if (input && /[0-9]/.test(input)) setEditValue(v => v + input);
      return;
    }

    if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
    if (key.downArrow) setSelectedIdx(i => Math.min(sections.length - 1, i + 1));
    if (key.return && selected) {
      setEditValue(String(draft[selected.key] ?? selected.defaultMinLevel));
      setMode('edit');
    }
    if (input === 's' && dirty && !saving) doSave();
    if (input === 'R' && dirty) doReset();
    if (input === 'r') load();
  });

  if (loading) return <Box><Text color={T.warn}><Spinner type="dots" /></Text><Text> Loading admin permissions...</Text></Box>;
  if (error) {
    return (
      <Box flexDirection="column">
        <Text color={T.alert}>Error: {error}</Text>
        <Text dimColor>[r] retry</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1} flexDirection="column">
        <Text bold color={T.accent}>ADMIN ROLES</Text>
        <Text dimColor>
          Minimum security level required for each admin section. Below the threshold, that
          section is not reachable.
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text bold color={T.accent}>{'  SECTION'.padEnd(28)}{'MIN LEVEL'.padEnd(12)}{'DEFAULT'}</Text>
      </Box>

      {sections.map((s, i) => {
        const val = draft[s.key] ?? s.defaultMinLevel;
        const changed = val !== (perms[s.key] ?? s.defaultMinLevel);
        return (
          <Box key={s.key}>
            <Text color={T.ink} bold={i === selectedIdx} inverse={i === selectedIdx}>
              {i === selectedIdx ? '▶ ' : '  '}
              {s.label.padEnd(26)}
            </Text>
            <Text color={levelColor(val)} bold>
              {(val === 0 ? 'Public' : `SL ${val}`).padEnd(12)}
            </Text>
            <Text dimColor>{String(s.defaultMinLevel)}</Text>
            {changed && <Text color={T.warn}>  *</Text>}
          </Box>
        );
      })}

      {mode === 'edit' && selected && (
        <Box marginTop={1}>
          <Text color={T.accent}>New min level for {selected.label} (0-255): {editValue}█</Text>
          <Text dimColor>  [enter] set  [esc] cancel</Text>
        </Box>
      )}

      {mode === 'list' && (
        <Box marginTop={1}>
          <Text dimColor>
            [enter] edit  [s]ave{dirty ? '*' : ''}  [R]eset to defaults  [r]eload
          </Text>
        </Box>
      )}

      {saving && <Box marginTop={1}><Text color={T.warn}><Spinner type="dots" /></Text><Text> Saving...</Text></Box>}
      {status && <Box marginTop={1}><Text color={status.startsWith('Error') ? T.alert : T.ok}>{status}</Text></Box>}
    </Box>
  );
}
