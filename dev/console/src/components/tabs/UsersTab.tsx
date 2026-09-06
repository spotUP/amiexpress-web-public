import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { getUsers, updateUser, deleteUser, createUser } from '../../api/client.js';
import { T } from '../../theme/blessed-theme.js';
import { ToggleSwitch } from '../shared/InlineEdit.js';
import { useRowClick } from '../../hooks/useRowClick.js';
import { ConfirmDialog } from '../shared/ConfirmDialog.js';
import type { UserRecord } from '../../api/types.js';

type Mode = 'list' | 'edit-sl' | 'confirm-ban' | 'confirm-delete' | 'password-form' | 'create-form';

const ITEMS_START_ROW = 7;

function getSecLevel(u: UserRecord): number {
  return u.secLevel ?? u.seclevel ?? 0;
}

type FieldType = 'string' | 'password' | 'number' | 'bool';
interface FormField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
}

// Matches web/config-app/src/pages/UsersPage.tsx:32-50's UserFormData, minus
// the fields that page only USES to build a request (confirmPassword is
// checked against password and never sent — UsersPage.tsx:178).
const PASSWORD_FIELDS: FormField[] = [
  { key: 'password', label: 'New password', type: 'password', required: true },
  { key: 'confirmPassword', label: 'Confirm password', type: 'password', required: true },
];

const CREATE_FIELDS: FormField[] = [
  { key: 'username', label: 'Username', type: 'string', required: true },
  { key: 'password', label: 'Password', type: 'password', required: true },
  { key: 'confirmPassword', label: 'Confirm password', type: 'password', required: true },
  { key: 'realname', label: 'Real name', type: 'string' },
  { key: 'email', label: 'Email', type: 'string' },
  { key: 'location', label: 'Location', type: 'string' },
  { key: 'phone', label: 'Phone', type: 'string' },
  { key: 'secLevel', label: 'Security level (0-255)', type: 'number' },
  { key: 'timeLimit', label: 'Time limit, min (-1=unlimited)', type: 'number' },
  { key: 'expert', label: 'Expert mode', type: 'bool' },
];

function maskValue(field: FormField, raw: string): string {
  return field.type === 'password' ? '*'.repeat(raw.length) : raw;
}

export function UsersTab() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [filtered, setFiltered] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [editSlValue, setEditSlValue] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Password-reset / create-user form state, shared by both flows.
  const [formFieldIdx, setFormFieldIdx] = useState(0);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const PAGE = 20;
  const [pageStart, setPageStart] = useState(0);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUsers();
      data.sort((a, b) => a.username.localeCompare(b.username));
      setUsers(data);
      setFiltered(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const visibleUsers = filtered.slice(pageStart, pageStart + PAGE);
  const selected = visibleUsers[selectedIdx];

  // Click a user row to select it (within the current page).
  useRowClick(visibleUsers.length, ITEMS_START_ROW, (idx) => {
    setSelectedIdx(idx);
  }, mode === 'list' && !searching);

  const startPasswordReset = () => {
    if (!selected) return;
    setFormValues({ password: '', confirmPassword: '' });
    setFormFieldIdx(0);
    setFormError(null);
    setMode('password-form');
  };

  const startCreate = () => {
    setFormValues({
      username: '', password: '', confirmPassword: '',
      realname: '', email: '', location: '', phone: '',
      secLevel: '10', timeLimit: '60', expert: 'false',
    });
    setFormFieldIdx(0);
    setFormError(null);
    setMode('create-form');
  };

  const cancelForm = () => {
    setMode('list');
    setFormValues({});
    setFormFieldIdx(0);
    setFormError(null);
  };

  const submitPasswordReset = () => {
    if (!selected) return;
    // Same rule as UsersPage.tsx:171-174: a typo here locks somebody out of
    // their own account and the sysop is not the one who finds out.
    if (formValues.password !== formValues.confirmPassword) {
      setFormError('The passwords do not match');
      return;
    }
    if (!formValues.password) {
      setFormError('Password is required');
      return;
    }
    setSubmitting(true);
    const id = selected.id ?? selected.username;
    updateUser(id, { password: formValues.password })
      .then(() => { setStatus(`Password reset for ${selected.username}`); cancelForm(); loadUsers(); })
      .catch((e: Error) => setFormError(e.message))
      .finally(() => setSubmitting(false));
  };

  const submitCreate = () => {
    // Mirrors UsersPage.tsx:163-174's validation order.
    if (!formValues.username?.trim()) {
      setFormError('Username is required');
      return;
    }
    if (!formValues.password) {
      setFormError('Password is required for new users');
      return;
    }
    if (formValues.password !== formValues.confirmPassword) {
      setFormError('The passwords do not match');
      return;
    }
    const secLevel = parseInt(formValues.secLevel, 10);
    const timeLimit = parseInt(formValues.timeLimit, 10);
    setSubmitting(true);
    createUser({
      username: formValues.username.trim(),
      password: formValues.password,
      realname: formValues.realname || undefined,
      email: formValues.email || undefined,
      location: formValues.location || undefined,
      phone: formValues.phone || undefined,
      secLevel: Number.isFinite(secLevel) ? secLevel : undefined,
      timeLimit: Number.isFinite(timeLimit) ? timeLimit : undefined,
      expert: formValues.expert === 'true',
    })
      .then(() => { setStatus(`User ${formValues.username.trim()} created`); cancelForm(); loadUsers(); })
      .catch((e: Error) => setFormError(e.message))
      .finally(() => setSubmitting(false));
  };

  useInput((input, key) => {
    if (searching) {
      if (key.escape) { setSearching(false); setSearchText(''); setFiltered(users); return; }
      if (key.return) { setSearching(false); return; }
      if (key.backspace || key.delete) {
        const next = searchText.slice(0, -1);
        setSearchText(next);
        setFiltered(users.filter(u => u.username.toLowerCase().includes(next.toLowerCase())));
        return;
      }
      if (input && !key.ctrl) {
        const next = searchText + input;
        setSearchText(next);
        setFiltered(users.filter(u => u.username.toLowerCase().includes(next.toLowerCase())));
      }
      return;
    }

    if (mode === 'password-form' || mode === 'create-form') {
      if (submitting) return;
      const fields = mode === 'password-form' ? PASSWORD_FIELDS : CREATE_FIELDS;
      const field = fields[formFieldIdx];
      if (key.escape) { cancelForm(); return; }
      if (field.type === 'bool') {
        if (input === ' ') {
          setFormValues(v => ({ ...v, [field.key]: v[field.key] === 'true' ? 'false' : 'true' }));
          setFormError(null);
          return;
        }
      }
      if (key.tab || key.downArrow) {
        setFormFieldIdx(i => Math.min(fields.length - 1, i + 1));
        return;
      }
      if (key.upArrow) {
        setFormFieldIdx(i => Math.max(0, i - 1));
        return;
      }
      if (key.return) {
        if (formFieldIdx < fields.length - 1) {
          setFormFieldIdx(i => i + 1);
        } else {
          mode === 'password-form' ? submitPasswordReset() : submitCreate();
        }
        return;
      }
      if (field.type === 'bool') return;
      if (key.backspace || key.delete) {
        setFormValues(v => ({ ...v, [field.key]: (v[field.key] ?? '').slice(0, -1) }));
        setFormError(null);
        return;
      }
      if (field.type === 'number') {
        if (input && /[-0-9]/.test(input)) {
          setFormValues(v => ({ ...v, [field.key]: (v[field.key] ?? '') + input }));
          setFormError(null);
        }
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setFormValues(v => ({ ...v, [field.key]: (v[field.key] ?? '') + input }));
        setFormError(null);
      }
      return;
    }

    if (mode === 'list') {
      if (key.upArrow) {
        if (selectedIdx > 0) setSelectedIdx(i => i - 1);
        else if (pageStart > 0) { setPageStart(p => p - PAGE); setSelectedIdx(PAGE - 1); }
      }
      if (key.downArrow) {
        if (selectedIdx < visibleUsers.length - 1) setSelectedIdx(i => i + 1);
        else if (pageStart + PAGE < filtered.length) { setPageStart(p => p + PAGE); setSelectedIdx(0); }
      }
      if (input === 'e' && selected) { setEditSlValue(String(getSecLevel(selected))); setMode('edit-sl'); }
      if (input === 'p' && selected) startPasswordReset();
      if (input === 'a') startCreate();
      if (input === 't' && selected) {
        const id = selected.id ?? selected.username;
        const isBanned = getSecLevel(selected) === 0;
        const newSl = isBanned ? 50 : 0;
        updateUser(id, { secLevel: newSl })
          .then(() => { setStatus(isBanned ? `${selected.username} unbanned (SL=50)` : `${selected.username} banned`); loadUsers(); })
          .catch((e: Error) => setStatus(`Error: ${e.message}`));
      }
      if (input === 'b' && selected) setMode('confirm-ban');
      if (input === 'd' && selected) setMode('confirm-delete');
      if (input === '/') { setSearching(true); setSearchText(''); }
      if (input === 'r') loadUsers();
    } else if (mode === 'edit-sl') {
      if (key.escape) { setMode('list'); return; }
      if (key.return && selected) {
        const sl = parseInt(editSlValue, 10);
        if (!isNaN(sl) && sl >= 0 && sl <= 255) {
          const id = selected.id ?? selected.username;
          updateUser(id, { secLevel: sl })
            .then(() => { setStatus(`SL updated for ${selected.username}`); loadUsers(); setMode('list'); })
            .catch((e: Error) => { setStatus(`Error: ${e.message}`); setMode('list'); });
        }
        return;
      }
      if (key.backspace || key.delete) { setEditSlValue(v => v.slice(0, -1)); return; }
      if (input && /[0-9]/.test(input)) setEditSlValue(v => v + input);
    }
  });

  if (loading) return <Box><Text color={T.warn}><Spinner type="dots" /></Text><Text> Loading users...</Text></Box>;
  if (error) return <Text color={T.alert}>Error: {error}</Text>;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color={T.accent}>
          {'  USER'.padEnd(18)}{'SL'.padEnd(5)}{'CALLS'.padEnd(8)}{'LAST ON'.padEnd(20)}{'LOCATION'}
        </Text>
        <Text dimColor>  ({filtered.length}/{users.length})</Text>
      </Box>

      {visibleUsers.map((u, i) => (
        <Box key={u.username + i}>
          <Text color={T.ink} bold={i === selectedIdx} inverse={i === selectedIdx}>
            {i === selectedIdx ? '▶ ' : '  '}
            {u.username.padEnd(16)}
            {String(getSecLevel(u)).padEnd(5)}
            {String(u.calls ?? 0).padEnd(8)}
            {(u.lastOn ?? u.lastLogin ?? '—').slice(0, 19).padEnd(20)}
            {(u.location ?? '—').slice(0, 20)}
          </Text>
        </Box>
      ))}

      {searching && (
        <Box marginTop={1}>
          <Text color={T.accent}>Search: {searchText}█</Text>
          <Text dimColor>  [esc] clear  [enter] done</Text>
        </Box>
      )}

      {status && <Box marginTop={1}><Text color={T.ok}>{status}</Text></Box>}

      {selected && mode === 'list' && (
        <Box marginTop={1} flexDirection="row" gap={2} alignItems="center">
          <Text color={T.dim}>Ban status:</Text>
          <ToggleSwitch value={getSecLevel(selected) > 0} />
          <Text dimColor>[t] toggle  [e] edit SL  [p] reset password  [a]dd user</Text>
        </Box>
      )}
      {!selected && mode === 'list' && (
        <Box marginTop={1}>
          <Text dimColor>[a]dd user</Text>
        </Box>
      )}

      {mode === 'edit-sl' && selected && (
        <Box marginTop={1} flexDirection="column">
          <Text color={T.accent}>New SL for {selected.username} (0-255): {editSlValue}█</Text>
          <Text dimColor>[enter] save  [esc] cancel</Text>
        </Box>
      )}

      {mode === 'confirm-ban' && selected && (
        <Box marginTop={1}>
          <ConfirmDialog
            message={`Ban ${selected.username}? (sets SL=0)`}
            onConfirm={() => {
              const id = selected.id ?? selected.username;
              updateUser(id, { secLevel: 0 })
                .then(() => { setStatus(`${selected.username} banned`); loadUsers(); })
                .catch((e: Error) => setStatus(`Error: ${e.message}`));
              setMode('list');
            }}
            onCancel={() => setMode('list')}
          />
        </Box>
      )}

      {mode === 'confirm-delete' && selected && (
        <Box marginTop={1}>
          <ConfirmDialog
            message={`Delete ${selected.username}? This cannot be undone.`}
            onConfirm={() => {
              const id = selected.id ?? selected.username;
              deleteUser(id)
                .then(() => { setStatus(`${selected.username} deleted`); loadUsers(); setSelectedIdx(0); })
                .catch((e: Error) => setStatus(`Error: ${e.message}`));
              setMode('list');
            }}
            onCancel={() => setMode('list')}
          />
        </Box>
      )}

      {mode === 'password-form' && selected && (
        <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor={T.warn} paddingX={1}>
          <Text bold color={T.warn}>RESET PASSWORD: {selected.username}</Text>
          {PASSWORD_FIELDS.map((field, i) => (
            <Box key={field.key}>
              <Text color={i === formFieldIdx ? T.warn : T.ink}>
                {i === formFieldIdx ? '> ' : '  '}
                {field.label}:{' '}
                <Text color={T.accent}>
                  {maskValue(field, formValues[field.key] ?? '')}{i === formFieldIdx ? '█' : ''}
                </Text>
              </Text>
            </Box>
          ))}
          {submitting && <Text color={T.dim}> saving...</Text>}
          {formError && <Text color={T.alert}>{formError}</Text>}
          <Text dimColor>[enter] next / save  [↑↓] field  [esc] cancel</Text>
        </Box>
      )}

      {mode === 'create-form' && (
        <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor={T.warn} paddingX={1}>
          <Text bold color={T.warn}>ADD USER</Text>
          {CREATE_FIELDS.map((field, i) => (
            <Box key={field.key}>
              <Text color={i === formFieldIdx ? T.warn : T.ink}>
                {i === formFieldIdx ? '> ' : '  '}
                {field.label}:{' '}
                {field.type === 'bool' ? (
                  <ToggleSwitch value={formValues[field.key] === 'true'} />
                ) : (
                  <Text color={T.accent}>
                    {maskValue(field, formValues[field.key] ?? '')}{i === formFieldIdx ? '█' : ''}
                  </Text>
                )}
              </Text>
            </Box>
          ))}
          {submitting && <Text color={T.dim}> creating...</Text>}
          {formError && <Text color={T.alert}>{formError}</Text>}
          <Text dimColor>[enter] next / create  [space] toggle  [↑↓] field  [esc] cancel</Text>
        </Box>
      )}
    </Box>
  );
}
