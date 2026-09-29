/**
 * File lists - the admin file manager (plan thoughts/shared/plans/
 * 2026-09-29-admin-file-manager.md, phase P3).
 *
 * A conference's directories and Hold, as the board lists them: edit a
 * description, move a file to another directory or conference, delete it.
 * Every change goes through the backend's file-list service, the same code
 * FM uses at the BBS prompt. Below the list: where the listings and the
 * folders disagree (files no listing names, listings with no file).
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Edit2, Trash2 } from 'lucide-react';

import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { StatusDot } from '../components/ui/StatusDot';
import { BoardText } from '../components/BoardText';
import type { StatusTone } from '../types/ui';

interface ListedConference {
  conf: number;
  name: string;
  dirs: Array<{ dir: number; entries: number }>;
}

type BytesAt = 'disk' | 'pool' | 'missing' | 'unknown';

export interface FileListEntry {
  filename: string;
  marker: 'P' | 'F' | 'N' | 'D';
  size: number;
  date: string;
  description: string[];
  bytes: BytesAt;
  [key: string]: unknown;
}

interface Mismatches {
  unlisted: Array<{ folder: string; filename: string; size: number }>;
  missing: Array<{ dir: number; filename: string }>;
}

const EMPTY_ENTRIES: FileListEntry[] = [];

/** Where the bytes are, in words - a colour is never the only signal. */
const BYTES_LABEL: Record<BytesAt, { tone: StatusTone; label: string }> = {
  disk: { tone: 'ok', label: 'On disk' },
  pool: { tone: 'info', label: 'On the pool' },
  missing: { tone: 'danger', label: 'Missing' },
  unknown: { tone: 'warn', label: 'Pool not answering' },
};

/** express.e's status column: passed, failed, not tested, duplicate. */
const MARKER_LABEL: Record<FileListEntry['marker'], string> = {
  P: 'Passed',
  F: 'Failed',
  N: 'Not tested',
  D: 'Duplicate',
};

export function dirLabel(dir: number): string {
  return dir === -1 ? 'Hold' : `Directory ${dir}`;
}

export function FileListsPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError, confirm } = useNotification();
  const [conf, setConf] = useState<number | null>(null);
  const [dir, setDir] = useState(1);
  const [editing, setEditing] = useState<FileListEntry | null>(null);
  const [descriptionText, setDescriptionText] = useState('');
  const [moving, setMoving] = useState<FileListEntry | null>(null);
  const [moveTo, setMoveTo] = useState<{ conf: number; dir: number }>({ conf: 1, dir: 1 });

  const conferencesQuery = useQuery({
    queryKey: ['file-lists', 'conferences'],
    queryFn: () => apiClient.getFileListConferences(),
  });
  const conferences: ListedConference[] = conferencesQuery.data?.data ?? [];
  const activeConf = conf ?? conferences[0]?.conf ?? null;
  const activeConference = conferences.find((c) => c.conf === activeConf);

  const entriesQuery = useQuery({
    queryKey: ['file-lists', 'entries', activeConf, dir],
    queryFn: () => apiClient.getFileListEntries(activeConf as number, dir),
    enabled: activeConf !== null,
  });
  const entries: FileListEntry[] = entriesQuery.data?.data ?? EMPTY_ENTRIES;

  const mismatchQuery = useQuery({
    queryKey: ['file-lists', 'mismatches', activeConf],
    queryFn: () => apiClient.getFileListMismatches(activeConf as number),
    enabled: activeConf !== null,
  });
  const mismatches: Mismatches = mismatchQuery.data?.data ?? { unlisted: [], missing: [] };

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['file-lists'] });

  const saveDescription = useMutation({
    mutationFn: (entry: FileListEntry) =>
      apiClient.updateFileListDescription(activeConf as number, dir, entry.filename, descriptionText.split('\n')),
    onSuccess: () => {
      refresh();
      showSuccess('Description saved');
      setEditing(null);
    },
    onError: (error: Error) => showError(`Could not save the description: ${error.message}`),
  });

  const moveFile = useMutation({
    mutationFn: (entry: FileListEntry) =>
      apiClient.moveFileListEntry(activeConf as number, dir, entry.filename, moveTo.conf, moveTo.dir),
    onSuccess: () => {
      refresh();
      showSuccess('File moved');
      setMoving(null);
    },
    onError: (error: Error) => showError(`Could not move the file: ${error.message}`),
  });

  const deleteFile = useMutation({
    mutationFn: (entry: FileListEntry) => apiClient.deleteFileListEntry(activeConf as number, dir, entry.filename),
    onSuccess: (response) => {
      refresh();
      if (response?.data?.bytesError) showError(`Removed from the list, but the file could not be deleted: ${response.data.bytesError}`);
      else showSuccess('File deleted');
    },
    onError: (error: Error) => showError(`Could not delete the file: ${error.message}`),
  });

  const handleDelete = async (entry: FileListEntry) => {
    const confirmed = await confirm({
      title: 'Delete File',
      message: `Delete ${entry.filename} from ${dirLabel(dir)}? The list entry and the file itself are removed.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger',
    });
    if (confirmed) deleteFile.mutate(entry);
  };

  const openEdit = (entry: FileListEntry) => {
    setEditing(entry);
    setDescriptionText(entry.description.join('\n'));
  };

  const openMove = (entry: FileListEntry) => {
    setMoving(entry);
    setMoveTo({ conf: activeConf ?? 1, dir: dir === -1 ? 1 : dir });
  };

  const columns = useMemo<DataTableColumn<FileListEntry>[]>(() => [
    { id: 'filename', header: 'File', value: (e) => e.filename, mono: true, width: '12rem' },
    { id: 'size', header: 'Size', value: (e) => e.size, align: 'right', mono: true, width: '7rem' },
    { id: 'date', header: 'Date', value: (e) => e.date, mono: true, width: '7rem' },
    { id: 'marker', header: 'Check', value: (e) => MARKER_LABEL[e.marker], width: '7rem' },
    {
      id: 'bytes',
      header: 'File',
      value: (e) => BYTES_LABEL[e.bytes].label,
      cell: (e) => <StatusDot tone={BYTES_LABEL[e.bytes].tone} label={BYTES_LABEL[e.bytes].label} />,
      width: '10rem',
    },
    {
      id: 'description',
      header: 'Description',
      value: (e) => e.description.find((l) => l.trim() !== '') ?? '',
      // The whole FILE_ID, in Topaz: the art only lines up in the board's face.
      cell: (e) => <BoardText lines={e.description} />,
    },
  ], []);

  const moveTargetDirs = conferences.find((c) => c.conf === moveTo.conf)?.dirs ?? [];

  return (
    <div>
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="file-lists-conference" className="label">Conference</label>
            <select
              id="file-lists-conference"
              value={activeConf ?? ''}
              onChange={(e) => { setConf(Number(e.target.value)); setDir(1); }}
              className="input-field w-full"
            >
              {conferences.map((c) => (
                <option key={c.conf} value={c.conf}>{c.conf}: {c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="file-lists-directory" className="label">Directory</label>
            <select
              id="file-lists-directory"
              value={dir}
              onChange={(e) => setDir(Number(e.target.value))}
              className="input-field w-full"
            >
              {(activeConference?.dirs ?? []).map((d) => (
                <option key={d.dir} value={d.dir}>{dirLabel(d.dir)} ({d.entries} files)</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={entries}
        getRowId={(e) => e.filename}
        isLoading={entriesQuery.isLoading || conferencesQuery.isLoading}
        error={(entriesQuery.error ?? conferencesQuery.error) as Error | null}
        onRetry={() => refresh()}
        emptyMessage={`${dirLabel(dir)} lists no files.`}
        rowActions={(entry) => (
          <>
            <button
              type="button"
              onClick={() => openEdit(entry)}
              aria-label={`Edit the description of ${entry.filename}`}
              className="rounded p-1 text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
            >
              <Edit2 size={14} />
            </button>
            <button
              type="button"
              onClick={() => openMove(entry)}
              aria-label={`Move ${entry.filename}`}
              className="rounded p-1 text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
            >
              <ArrowRightLeft size={14} />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(entry)}
              aria-label={`Delete ${entry.filename}`}
              className="rounded p-1 text-content-secondary transition-colors hover:bg-status-danger/20 hover:text-status-danger"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      />

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold text-content-primary mb-1">Files no list names</h3>
          <p className="text-sm text-content-secondary mb-3">
            In this conference&apos;s folders, but in no directory&apos;s list - callers cannot see or download them.
          </p>
          <DataTable
            columns={[
              { id: 'filename', header: 'File', value: (u) => u.filename, mono: true },
              { id: 'folder', header: 'Folder', value: (u) => u.folder, mono: true },
              { id: 'size', header: 'Size', value: (u) => u.size, align: 'right', mono: true, width: '7rem' },
            ]}
            rows={mismatches.unlisted}
            getRowId={(u) => `${u.folder}/${u.filename}`}
            isLoading={mismatchQuery.isLoading}
            error={mismatchQuery.error as Error | null}
            onRetry={() => refresh()}
            emptyMessage="Every file in the folders is listed."
          />
        </div>
        <div className="card">
          <h3 className="text-lg font-semibold text-content-primary mb-1">Listed with no file</h3>
          <p className="text-sm text-content-secondary mb-3">
            In a list, but the file is on neither this disk nor the pool - callers see it and cannot download it.
          </p>
          <DataTable
            columns={[
              { id: 'filename', header: 'File', value: (m) => m.filename, mono: true },
              { id: 'dir', header: 'Directory', value: (m) => dirLabel(m.dir) },
            ]}
            rows={mismatches.missing}
            getRowId={(m) => `${m.dir}/${m.filename}`}
            isLoading={mismatchQuery.isLoading}
            error={mismatchQuery.error as Error | null}
            onRetry={() => refresh()}
            emptyMessage="Every listed file is there."
          />
        </div>
      </div>

      <Modal open={editing !== null} title={`Description of ${editing?.filename ?? ''}`} onClose={() => setEditing(null)} maxWidth="max-w-2xl">
        <p className="text-sm text-content-secondary mb-2">
          The first line goes beside the file&apos;s size and date; the rest are indented under it, as the board writes them.
        </p>
        <textarea
          aria-label="Description"
          value={descriptionText}
          onChange={(e) => setDescriptionText(e.target.value)}
          rows={12}
          className="input-field w-full font-mono"
        />
        <p className="text-sm text-content-secondary mt-3 mb-1">As callers see it:</p>
        <BoardText lines={descriptionText.split('\n')} className="card" />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={saveDescription.isPending}
            onClick={() => editing && saveDescription.mutate(editing)}
          >
            Save
          </button>
        </div>
      </Modal>

      <Modal open={moving !== null} title={`Move ${moving?.filename ?? ''}`} onClose={() => setMoving(null)} maxWidth="max-w-lg">
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label htmlFor="file-move-conference" className="label">To conference</label>
            <select
              id="file-move-conference"
              value={moveTo.conf}
              onChange={(e) => setMoveTo({ conf: Number(e.target.value), dir: 1 })}
              className="input-field w-full"
            >
              {conferences.map((c) => (
                <option key={c.conf} value={c.conf}>{c.conf}: {c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="file-move-directory" className="label">To directory</label>
            <select
              id="file-move-directory"
              value={moveTo.dir}
              onChange={(e) => setMoveTo({ ...moveTo, dir: Number(e.target.value) })}
              className="input-field w-full"
            >
              {moveTargetDirs.map((d) => (
                <option key={d.dir} value={d.dir}>{dirLabel(d.dir)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => setMoving(null)}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={moveFile.isPending || (moving !== null && moveTo.conf === activeConf && moveTo.dir === dir)}
            onClick={() => moving && moveFile.mutate(moving)}
          >
            Move
          </button>
        </div>
      </Modal>
    </div>
  );
}
