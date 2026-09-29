/**
 * File lists - the admin file manager (plan thoughts/shared/plans/
 * 2026-09-29-admin-file-manager.md, phase P3).
 *
 * A conference's directories and Hold, as the board lists them: edit a
 * description, move a file to another directory or conference, delete it.
 * Every change goes through the backend's file-list service, the same code
 * FM uses at the BBS prompt. Ticked rows are moved or deleted together.
 * Below the list: where the listings and the folders disagree (files no
 * listing names, which can be purged, and listings with no file).
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
  /** yyyymmdd from the backend, so dates sort across the century. */
  dateValue: number;
  description: string[];
  bytes: BytesAt;
  [key: string]: unknown;
}

interface UnlistedFile {
  folder: string;
  filename: string;
  size: number;
  [key: string]: unknown;
}

interface Mismatches {
  unlisted: UnlistedFile[];
  missing: Array<{ dir: number; filename: string }>;
}

const EMPTY_ENTRIES: FileListEntry[] = [];

/** Newest first ("default sorting should be new to old", sysop 2026-09-29). */
const NEWEST_FIRST = [{ id: 'date', desc: true }];

const unlistedId = (u: UnlistedFile) => `${u.folder}/${u.filename}`;

/**
 * Apply one call per item, in order, and name the ones that failed. A
 * listing is one file on disk, so the calls are not run side by side.
 */
export async function applyEach<T>(items: T[], nameOf: (item: T) => string, apply: (item: T) => Promise<unknown>): Promise<string[]> {
  const failed: string[] = [];
  for (const item of items) {
    try {
      await apply(item);
    } catch (error) {
      failed.push(`${nameOf(item)} (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  return failed;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

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
  const [moving, setMoving] = useState<FileListEntry[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedUnlisted, setSelectedUnlisted] = useState<Set<string>>(new Set());
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

  const changeListing = (next: { conf?: number; dir: number }) => {
    if (next.conf !== undefined) setConf(next.conf);
    setDir(next.dir);
    setSelected(new Set());
    setSelectedUnlisted(new Set());
  };

  /** Report a batch: all done, or which failed and why. */
  const report = (done: string, total: number, failed: string[]) => {
    refresh();
    if (failed.length) showError(`${failed.length} of ${total} failed: ${failed.join(', ')}`);
    else showSuccess(done);
  };

  const moveFiles = useMutation({
    mutationFn: (targets: FileListEntry[]) =>
      applyEach(targets, (e) => e.filename, (e) =>
        apiClient.moveFileListEntry(activeConf as number, dir, e.filename, moveTo.conf, moveTo.dir)),
    onSuccess: (failed, targets) => {
      report(targets.length === 1 ? 'File moved' : `${plural(targets.length, 'file')} moved`, targets.length, failed);
      setMoving(null);
      setSelected(new Set());
    },
  });

  const handleDelete = async (targets: FileListEntry[]) => {
    if (targets.length === 0) return;
    const one = targets.length === 1;
    const confirmed = await confirm({
      title: one ? 'Delete File' : 'Delete Files',
      message: one
        ? `Delete ${targets[0].filename} from ${dirLabel(dir)}? The list entry and the file itself are removed.`
        : `Delete ${plural(targets.length, 'file')} from ${dirLabel(dir)}: ${targets.map((e) => e.filename).join(', ')}. The list entries and the files themselves are removed.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger',
      ...(one ? {} : { requireTypedConfirmation: String(targets.length) }),
    });
    if (!confirmed) return;
    const failed = await applyEach(targets, (e) => e.filename, async (e) => {
      const response = await apiClient.deleteFileListEntry(activeConf as number, dir, e.filename);
      // Out of the list, but the file stayed: say so, it is not a success.
      if (response?.data?.bytesError) throw new Error(`removed from the list, file kept: ${response.data.bytesError}`);
    });
    setSelected(new Set());
    report(one ? 'File deleted' : `${plural(targets.length, 'file')} deleted`, targets.length, failed);
  };

  const handlePurge = async (targets: UnlistedFile[]) => {
    if (targets.length === 0) return;
    const one = targets.length === 1;
    const confirmed = await confirm({
      title: one ? 'Purge File' : 'Purge Files',
      message: `Permanently delete ${one ? targets[0].filename : `${plural(targets.length, 'file')}: ${targets.map((u) => u.filename).join(', ')}`}? No list names ${one ? 'it' : 'them'}, so callers never saw ${one ? 'it' : 'them'}.`,
      confirmText: 'Purge',
      cancelText: 'Cancel',
      type: 'danger',
      ...(one ? {} : { requireTypedConfirmation: String(targets.length) }),
    });
    if (!confirmed) return;
    const failed = await applyEach(targets, (u) => u.filename, (u) =>
      apiClient.deleteUnlistedFile(activeConf as number, u.folder, u.filename));
    setSelectedUnlisted(new Set());
    report(one ? 'File purged' : `${plural(targets.length, 'file')} purged`, targets.length, failed);
  };

  const openEdit = (entry: FileListEntry) => {
    setEditing(entry);
    setDescriptionText(entry.description.join('\n'));
  };

  const openMove = (targets: FileListEntry[]) => {
    if (targets.length === 0) return;
    setMoving(targets);
    setMoveTo({ conf: activeConf ?? 1, dir: dir === -1 ? 1 : dir });
  };

  // The short columns fit their content on one line; the FILE_ID takes the
  // rest ("some columns dont resize to their content", sysop 2026-09-29).
  const fit = 'whitespace-nowrap align-top pt-2';
  const columns = useMemo<DataTableColumn<FileListEntry>[]>(() => [
    { id: 'filename', header: 'File', value: (e) => e.filename, mono: true, cellClassName: fit },
    { id: 'size', header: 'Size', value: (e) => e.size, align: 'right', mono: true, cellClassName: fit },
    { id: 'date', header: 'Date', value: (e) => e.dateValue, cell: (e) => e.date, mono: true, cellClassName: fit },
    { id: 'marker', header: 'Check', value: (e) => MARKER_LABEL[e.marker], cellClassName: fit },
    {
      id: 'bytes',
      header: 'Stored',
      value: (e) => BYTES_LABEL[e.bytes].label,
      cell: (e) => <StatusDot tone={BYTES_LABEL[e.bytes].tone} label={BYTES_LABEL[e.bytes].label} />,
      cellClassName: fit,
    },
    {
      id: 'description',
      header: 'Description',
      value: (e) => e.description.find((l) => l.trim() !== '') ?? '',
      // The whole FILE_ID, in Topaz: the art only lines up in the board's face.
      cell: (e) => <BoardText lines={e.description} />,
      cellClassName: 'w-full align-top py-2',
    },
  ], []);

  const moveTargetDirs = conferences.find((c) => c.conf === moveTo.conf)?.dirs ?? [];
  const chosen = entries.filter((e) => selected.has(e.filename));
  const chosenUnlisted = mismatches.unlisted.filter((u) => selectedUnlisted.has(unlistedId(u)));
  const batchBar = 'mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-accent/40 bg-surface-2 p-3';
  const dangerButton = 'h-control rounded border border-status-danger/40 px-3 text-sm text-status-danger transition-colors hover:bg-status-danger/10';

  return (
    <div>
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="file-lists-conference" className="label">Conference</label>
            <select
              id="file-lists-conference"
              value={activeConf ?? ''}
              onChange={(e) => changeListing({ conf: Number(e.target.value), dir: 1 })}
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
              onChange={(e) => changeListing({ dir: Number(e.target.value) })}
              className="input-field w-full"
            >
              {(activeConference?.dirs ?? []).map((d) => (
                <option key={d.dir} value={d.dir}>{dirLabel(d.dir)} ({d.entries} files)</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {chosen.length > 0 && (
        <div className={batchBar}>
          <span className="text-sm text-content-primary">{plural(chosen.length, 'file')} selected</span>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => openMove(chosen)} className="btn-secondary h-control">Move</button>
            <button type="button" onClick={() => handleDelete(chosen)} className={dangerButton}>Delete</button>
            <button type="button" onClick={() => setSelected(new Set())} className="btn-small btn-secondary">Clear</button>
          </span>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={entries}
        getRowId={(e) => e.filename}
        initialSort={NEWEST_FIRST}
        selectedIds={selected}
        onSelectionChange={setSelected}
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
              onClick={() => openMove([entry])}
              aria-label={`Move ${entry.filename}`}
              className="rounded p-1 text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
            >
              <ArrowRightLeft size={14} />
            </button>
            <button
              type="button"
              onClick={() => handleDelete([entry])}
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
          {chosenUnlisted.length > 0 && (
            <div className={batchBar}>
              <span className="text-sm text-content-primary">{plural(chosenUnlisted.length, 'file')} selected</span>
              <span className="ml-auto flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => handlePurge(chosenUnlisted)} className={dangerButton}>Purge</button>
                <button type="button" onClick={() => setSelectedUnlisted(new Set())} className="btn-small btn-secondary">Clear</button>
              </span>
            </div>
          )}
          <DataTable
            columns={[
              { id: 'filename', header: 'File', value: (u) => u.filename, mono: true },
              { id: 'folder', header: 'Folder', value: (u) => u.folder, mono: true },
              { id: 'size', header: 'Size', value: (u) => u.size, align: 'right', mono: true, width: '7rem' },
            ]}
            rows={mismatches.unlisted}
            getRowId={unlistedId}
            selectedIds={selectedUnlisted}
            onSelectionChange={setSelectedUnlisted}
            rowActions={(u) => (
              <button
                type="button"
                onClick={() => handlePurge([u])}
                aria-label={`Purge ${u.filename}`}
                className="rounded p-1 text-content-secondary transition-colors hover:bg-status-danger/20 hover:text-status-danger"
              >
                <Trash2 size={14} />
              </button>
            )}
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

      <Modal open={moving !== null} title={moving?.length === 1 ? `Move ${moving[0].filename}` : `Move ${plural(moving?.length ?? 0, 'file')}`} onClose={() => setMoving(null)} maxWidth="max-w-lg">
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
            disabled={moveFiles.isPending || (moving !== null && moveTo.conf === activeConf && moveTo.dir === dir)}
            onClick={() => moving && moveFiles.mutate(moving)}
          >
            Move
          </button>
        </div>
      </Modal>
    </div>
  );
}
