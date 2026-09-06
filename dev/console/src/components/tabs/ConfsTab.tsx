import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import {
  getConferences, updateConference, getConferenceHealth, fixConference,
  createConference, deleteConference, getOrphanConferenceDirs, removeOrphanConferenceDir,
  type OrphanConferenceDir,
} from '../../api/client.js';
import { T } from '../../theme/blessed-theme.js';
import { ToggleSwitch } from '../shared/InlineEdit.js';
import { ConfirmDialog } from '../shared/ConfirmDialog.js';
import { useRowClick } from '../../hooks/useRowClick.js';
import { useTextEntryLock } from '../../hooks/useTextEntryLock.js';
import type { ConferenceConfig, ConferenceHealth } from '../../api/types.js';

type Mode =
  | 'list' | 'health-result' | 'fix-result'
  | 'create-form'
  | 'confirm-delete-files' | 'confirm-delete'
  | 'orphans';

const ITEMS_START_ROW = 7;

type CreateFieldType = 'string' | 'number' | 'bool';
interface CreateField {
  key: string;
  label: string;
  type: CreateFieldType;
}

// Mirrors ConferencesPage.tsx's handleAdd()/resetForm() defaults. conference_id
// is NOT one of these — the backend only accepts count+1 (see client.ts's
// createConference doc), so it's computed and shown, never typed.
const CREATE_FIELDS: CreateField[] = [
  { key: 'name',              label: 'Name',                type: 'string' },
  { key: 'ndirs',             label: 'File areas (ndirs)',  type: 'number' },
  { key: 'min_access_level',  label: 'Min access level',    type: 'number' },
  { key: 'max_access_level',  label: 'Max access level',    type: 'number' },
  { key: 'force_newscan',     label: 'Force newscan',       type: 'bool'   },
  { key: 'exclude_ftp',       label: 'Exclude FTP',         type: 'bool'   },
  { key: 'private_conf',      label: 'Private',             type: 'bool'   },
  { key: 'read_only',         label: 'Read only',           type: 'bool'   },
];

export function ConfsTab() {
  const [confs, setConfs] = useState<ConferenceConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [healthResult, setHealthResult] = useState<ConferenceHealth | null>(null);
  const [fixResult, setFixResult] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Create form
  const [formFieldIdx, setFormFieldIdx] = useState(0);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Delete flow: target captured by VALUE the moment 'd' is pressed, so a
  // reload mid-confirmation can't retarget the delete (same defect class
  // DoorsTab's delete fixed in wave 1).
  const [deleteTarget, setDeleteTarget] = useState<ConferenceConfig | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Orphan directories
  const [orphans, setOrphans] = useState<OrphanConferenceDir[]>([]);
  const [orphanIdx, setOrphanIdx] = useState(0);
  const [orphanDeleteTarget, setOrphanDeleteTarget] = useState<OrphanConferenceDir | null>(null);
  const [orphanBusy, setOrphanBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getConferences();
      setConfs(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOrphans = useCallback(async () => {
    try {
      const data = await getOrphanConferenceDirs();
      setOrphans(data.orphans ?? []);
    } catch {
      // Non-fatal: the main conference list still loaded fine.
    }
  }, []);

  useEffect(() => { load(); loadOrphans(); }, [load, loadOrphans]);

  const selected = confs[selectedIdx];

  // A form, a create flow, or a delete confirmation owns the keyboard — see
  // dev/console/src/state/text-entry-lock.ts. The idle list only uses
  // up/down/t/h/f/r, none of which collide with global hotkeys, so it does
  // not need the lock (unlike SecurityPage, which uses left/right too).
  useTextEntryLock(mode !== 'list' && mode !== 'health-result' && mode !== 'fix-result');

  useRowClick(confs.length, ITEMS_START_ROW, setSelectedIdx, mode === 'list');

  const startCreate = () => {
    setFormValues({
      name: '', ndirs: '1', min_access_level: '0', max_access_level: '255',
      force_newscan: 'false', exclude_ftp: 'false', private_conf: 'false', read_only: 'false',
    });
    setFormFieldIdx(0);
    setFormError(null);
    setMode('create-form');
  };

  const cancelCreate = () => {
    setMode('list');
    setFormValues({});
    setFormFieldIdx(0);
    setFormError(null);
  };

  const nextConferenceId = confs.length + 1;

  const submitCreate = () => {
    const ndirs = parseInt(formValues.ndirs, 10);
    const minLvl = parseInt(formValues.min_access_level, 10);
    const maxLvl = parseInt(formValues.max_access_level, 10);
    setSubmitting(true);
    createConference({
      conference_id: nextConferenceId,
      name: formValues.name.trim() || undefined,
      ndirs: Number.isFinite(ndirs) ? ndirs : undefined,
      min_access_level: Number.isFinite(minLvl) ? minLvl : undefined,
      max_access_level: Number.isFinite(maxLvl) ? maxLvl : undefined,
      force_newscan: formValues.force_newscan === 'true',
      exclude_ftp: formValues.exclude_ftp === 'true',
      private_conf: formValues.private_conf === 'true',
      read_only: formValues.read_only === 'true',
    })
      .then((res) => {
        setStatus(res.message ?? `Conference ${nextConferenceId} created`);
        cancelCreate();
        load();
      })
      .catch((e: Error) => setFormError(e.message))
      .finally(() => setSubmitting(false));
  };

  const submitDelete = (withFiles: boolean) => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleting(true);
    deleteConference(target.conference_id, withFiles)
      .then((res) => {
        setStatus(res.message ?? 'Conference removed');
        setDeleteTarget(null);
        setSelectedIdx(0);
        load();
      })
      .catch((e: Error) => setStatus(`Error: ${e.message}`))
      .finally(() => setDeleting(false));
  };

  const submitRemoveOrphan = () => {
    if (!orphanDeleteTarget) return;
    const target = orphanDeleteTarget;
    setOrphanBusy(true);
    removeOrphanConferenceDir(target.dir)
      .then((res) => {
        setStatus(res.message ?? `${target.dir} removed`);
        setOrphanDeleteTarget(null);
        loadOrphans();
      })
      .catch((e: Error) => setStatus(`Error: ${e.message}`))
      .finally(() => setOrphanBusy(false));
  };

  useInput((input, key) => {
    if (mode === 'health-result' || mode === 'fix-result') {
      if (key.escape || input === 'q') { setMode('list'); setHealthResult(null); setFixResult(null); }
      return;
    }

    if (mode === 'create-form') {
      // Escape works even mid-submit — the same rule wave 1 applied to the
      // Users password/create form (client.ts's request() also carries its
      // own 15s timeout as a backstop).
      if (key.escape) { cancelCreate(); return; }
      if (submitting) return;
      const field = CREATE_FIELDS[formFieldIdx];
      if (field.type === 'bool') {
        if (input === ' ') {
          setFormValues(v => ({ ...v, [field.key]: v[field.key] === 'true' ? 'false' : 'true' }));
          return;
        }
      }
      if (key.tab || key.downArrow) { setFormFieldIdx(i => Math.min(CREATE_FIELDS.length - 1, i + 1)); return; }
      if (key.upArrow) { setFormFieldIdx(i => Math.max(0, i - 1)); return; }
      if (key.return) {
        if (formFieldIdx < CREATE_FIELDS.length - 1) setFormFieldIdx(i => i + 1);
        else submitCreate();
        return;
      }
      if (field.type === 'bool') return;
      if (key.backspace || key.delete) {
        setFormValues(v => ({ ...v, [field.key]: (v[field.key] ?? '').slice(0, -1) }));
        return;
      }
      if (field.type === 'number') {
        if (input && /[0-9]/.test(input)) setFormValues(v => ({ ...v, [field.key]: (v[field.key] ?? '') + input }));
        return;
      }
      if (input && !key.ctrl && !key.meta) setFormValues(v => ({ ...v, [field.key]: (v[field.key] ?? '') + input }));
      return;
    }

    if (mode === 'confirm-delete-files' || mode === 'confirm-delete') return; // ConfirmDialog owns input

    if (mode === 'orphans') {
      if (orphanDeleteTarget) return; // its own ConfirmDialog owns input
      if (key.escape || input === 'q') { setMode('list'); return; }
      if (key.upArrow) setOrphanIdx(i => Math.max(0, i - 1));
      if (key.downArrow) setOrphanIdx(i => Math.min(orphans.length - 1, i + 1));
      if (input === 'x' && orphans[orphanIdx]) setOrphanDeleteTarget(orphans[orphanIdx]);
      if (input === 'r') loadOrphans();
      return;
    }

    // mode === 'list'
    if (key.upArrow) setSelectedIdx(i => Math.max(0, i - 1));
    if (key.downArrow) setSelectedIdx(i => Math.min(confs.length - 1, i + 1));

    if (input === 't' && selected && !actionLoading) {
      const currentEnabled = (selected as any).enabled !== false;
      setActionLoading(true);
      updateConference(selected.conference_id, { enabled: !currentEnabled })
        .then(() => {
          setStatus(`Conf ${selected.conference_id} ${currentEnabled ? 'disabled' : 'enabled'}`);
          load();
        })
        .catch((e: Error) => setStatus(`Error: ${e.message}`))
        .finally(() => setActionLoading(false));
    }

    if (input === 'h' && selected && !actionLoading) {
      setActionLoading(true);
      getConferenceHealth(selected.conference_id)
        .then(result => {
          setHealthResult(result ?? null);
          setMode('health-result');
        })
        .catch((e: Error) => setStatus(`Error: ${e.message}`))
        .finally(() => setActionLoading(false));
    }

    if (input === 'f' && selected && !actionLoading) {
      setActionLoading(true);
      fixConference(selected.conference_id)
        .then(result => {
          setFixResult(result.message ?? 'Auto-fix complete');
          setMode('fix-result');
          load();
        })
        .catch((e: Error) => setStatus(`Error: ${e.message}`))
        .finally(() => setActionLoading(false));
    }

    if (input === 'a') startCreate();
    if (input === 'd' && selected) { setDeleteTarget(selected); setMode('confirm-delete'); }
    if (input === 'o' && orphans.length > 0) { setOrphanIdx(0); setMode('orphans'); }
    if (input === 'r') { load(); loadOrphans(); }
  });

  if (loading) return <Box><Text color={T.warn}><Spinner type="dots" /></Text><Text> Loading...</Text></Box>;
  if (error) return <Text color={T.alert}>Error: {error}</Text>;

  if (mode === 'health-result' && healthResult) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={healthResult.healthy ? T.ok : T.warn} padding={1}>
        <Text bold color={healthResult.healthy ? T.ok : T.warn}>
          Conf {healthResult.conferenceId}: {healthResult.name}
        </Text>
        <Text color={healthResult.healthy ? T.ok : T.alert}>
          {healthResult.healthy ? 'Healthy' : 'Issues found'}
        </Text>
        {healthResult.issues.map((issue, i) => (
          <Text key={i} color={T.warn}>  - {issue}</Text>
        ))}
        {healthResult.fixable && <Text dimColor>  Press [f] to auto-fix</Text>}
        <Box marginTop={1}><Text dimColor>[esc] back</Text></Box>
      </Box>
    );
  }

  if (mode === 'fix-result') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={T.ok} padding={1}>
        <Text bold color={T.ok}>Auto-fix complete</Text>
        <Text>{fixResult}</Text>
        <Box marginTop={1}><Text dimColor>[esc] back</Text></Box>
      </Box>
    );
  }

  if (mode === 'orphans') {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1} flexDirection="column">
          <Text bold color={T.warn}>ORPHAN CONFERENCE DIRECTORIES</Text>
          <Text dimColor>
            No conference's LOCATION.n points at these — the directory (and everything
            posted or uploaded to it) is still on disk.
          </Text>
        </Box>
        {orphans.map((o, i) => (
          <Box key={o.dir}>
            <Text color={T.ink} bold={i === orphanIdx} inverse={i === orphanIdx}>
              {i === orphanIdx ? '▶ ' : '  '}
              {o.dir.padEnd(24)}
              {String(o.files).padStart(5)} file{o.files === 1 ? '' : 's'}
              {'  '}{(o.bytes / 1024).toFixed(1)} KB
            </Text>
          </Box>
        ))}
        {orphans.length === 0 && <Text dimColor>No orphan directories.</Text>}

        {orphanBusy && (
          <Box marginTop={1}><Text color={T.warn}><Spinner type="dots" /></Text><Text> Working...</Text></Box>
        )}
        {orphanDeleteTarget && (
          <Box marginTop={1}>
            <ConfirmDialog
              message={
                `${orphanDeleteTarget.dir} holds ${orphanDeleteTarget.files} file(s) ` +
                `(${(orphanDeleteTarget.bytes / 1024).toFixed(1)} KB), including anything ever ` +
                'posted or uploaded there. This deletes them permanently.'
              }
              requireTypedConfirmation={orphanDeleteTarget.dir}
              onConfirm={submitRemoveOrphan}
              onCancel={() => setOrphanDeleteTarget(null)}
            />
          </Box>
        )}
        {status && <Box marginTop={1}><Text color={T.ok}>{status}</Text></Box>}
        <Box marginTop={1}><Text dimColor>[x] delete  [r]efresh  [esc] back</Text></Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color={T.accent}>
          {'  #'.padEnd(6)}{'NAME'.padEnd(30)}{'DIRS'.padEnd(6)}{'STATUS'}
        </Text>
      </Box>

      {confs.map((c, i) => {
        const enabled = (c as any).enabled !== false;
        return (
          <Box key={c.id}>
            <Text color={enabled ? T.ink : T.dim} bold={i === selectedIdx} inverse={i === selectedIdx}>
              {i === selectedIdx ? '▶ ' : '  '}
              {String(c.conference_id).padEnd(4)}
              {c.name.slice(0, 28).padEnd(30)}
              {String(c.ndirs).padEnd(6)}
              {enabled ? '' : '(disabled)'}
            </Text>
          </Box>
        );
      })}

      {actionLoading && (
        <Box marginTop={1}>
          <Text color={T.warn}><Spinner type="dots" /></Text>
          <Text> Working...</Text>
        </Box>
      )}

      {orphans.length > 0 && (
        <Box marginTop={1}>
          <Text color={T.warn}>
            {orphans.length} orphan director{orphans.length === 1 ? 'y' : 'ies'} no conference points at — press [o] to review
          </Text>
        </Box>
      )}

      {status && <Box marginTop={1}><Text color={T.ok}>{status}</Text></Box>}

      {mode === 'create-form' && (
        <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor={T.warn} paddingX={1}>
          <Text bold color={T.warn}>NEW CONFERENCE #{nextConferenceId}</Text>
          {CREATE_FIELDS.map((field, i) => (
            <Box key={field.key}>
              <Text color={i === formFieldIdx ? T.warn : T.ink}>
                {i === formFieldIdx ? '> ' : '  '}
                {field.label}:{' '}
                {field.type === 'bool' ? (
                  <ToggleSwitch value={formValues[field.key] === 'true'} />
                ) : (
                  <Text color={T.accent}>
                    {formValues[field.key] ?? ''}{i === formFieldIdx ? '█' : ''}
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

      {mode === 'confirm-delete' && deleteTarget && (
        <Box marginTop={1}>
          <ConfirmDialog
            message={
              `Remove conference ${deleteTarget.conference_id}${deleteTarget.name ? ` (${deleteTarget.name})` : ''}? ` +
              (deleteTarget.conference_id === confs.length
                ? 'It comes off the end of the list, so no other conference moves.'
                : `Conferences ${deleteTarget.conference_id + 1}-${confs.length} move down one, and every ` +
                  'account\'s conference access moves with them.')
            }
            requireTypedConfirmation={String(deleteTarget.conference_id)}
            onConfirm={() => setMode('confirm-delete-files')}
            onCancel={() => { setDeleteTarget(null); setMode('list'); }}
          />
        </Box>
      )}

      {mode === 'confirm-delete-files' && deleteTarget && (
        <Box marginTop={1}>
          <ConfirmDialog
            message={
              `Also delete conference ${deleteTarget.conference_id}'s files — every message posted and file ` +
              'uploaded there? Left on disk otherwise, and the path is reported so you can remove them yourself.'
            }
            onConfirm={() => submitDelete(true)}
            onCancel={() => submitDelete(false)}
          />
        </Box>
      )}

      {deleting && (
        <Box marginTop={1}><Text color={T.warn}><Spinner type="dots" /></Text><Text> Deleting conference...</Text></Box>
      )}

      {mode === 'list' && (
        <Box marginTop={1}>
          <Text dimColor>
            [a]dd  [d]elete  [t]oggle  [h]ealth  [f]ix{orphans.length > 0 ? '  [o]rphans' : ''}  [r]efresh
          </Text>
        </Box>
      )}
    </Box>
  );
}
