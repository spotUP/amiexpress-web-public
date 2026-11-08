import { useState } from 'react';
import { Modal } from '../components/ui/Modal';
import { ConftopSettings } from '../components/ConftopSettings';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit2, Trash2, Plus, X } from 'lucide-react';
import { apiClient } from '../api/client';
import type { ConferenceConfig } from '../types';
import { useNotification } from '../contexts/NotificationContext';
import { formatBytes } from '../lib/format';
import { MoveExistingFiles } from '../components/storage/MoveExistingFiles';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { pathRows, applyPathEdit, resetPathToDerived, rowsToFormFields } from './conference-path-rows';

/**
 * Who a new conference is granted to - sent once with the create, applied to
 * every account's access string. Mirrors ConferenceGrantSchema on the backend.
 */
export type ConferenceGrantChoice =
  | { kind: 'everyone' }
  | { kind: 'sysop' }
  | { kind: 'level'; minLevel: number };

const DEFAULT_GRANT: ConferenceGrantChoice = { kind: 'everyone' };

interface ConferenceFormData {
  conference_id: number;
  name: string;
  ndirs: number;
  /** LOCATION.n - what the file-area paths derive from. Not edited here. */
  location: string;
  dlpath_1: string;
  ulpath_1: string;
  [key: string]: string | number | boolean;
  min_access_level: number;
  max_access_level: number;
  force_newscan: boolean;
  exclude_ftp: boolean;
  /** FTPDIRNAME - the name this conference wears over FTP. */
  ftpdirname: string;
  /** FTP_DIR_DAYS - how far back an FTP listing reaches. */
  ftp_dir_days: number;
  /** NO_FTP_UPLOADS - whether the tooltype is on the icon at all. */
  no_ftp_uploads: boolean;
  /** NO_NEWSCAN - never include this conference in a new-message scan. */
  no_newscan: boolean;
  /** SHOW_NEW_FILES / NO_NEW_FILES - whether a new-files scan reaches it. */
  show_new_files: boolean;
  no_new_files: boolean;
  /** FREEDOWNLOADS (express.e:5010) - downloads here cost no ratio. */
  free_downloads: boolean;
  /** Which name a caller wears here: USERNAME, REALNAME or INTERNETNAME. */
  use_username: boolean;
  use_realname: boolean;
  use_internetname: boolean;
  /** MENU_PROMPT (express.e:5013) - the prompt this conference shows. */
  menu_prompt: string;
  /** CONFDB_SHARED - the conference whose message base this one shares. */
  confdb_shared: number;
  /** What NO_FTP_UPLOADS holds: the refusal an FTP caller reads. */
  no_ftp_uploads_text: string;
  private_conf: boolean;
  read_only: boolean;
}

/** A stable fallback: a fresh array each render invalidates the row model. */
const EMPTY_CONFERENCES: ConferenceConfig[] = [];

export function ConferencesPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError, confirm } = useNotification();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConference, setEditingConference] = useState<ConferenceConfig | null>(null);
  const [grant, setGrant] = useState<ConferenceGrantChoice>(DEFAULT_GRANT);

  /**
   * The drives the board actually has. A directory can only be pointed at a
   * drive that is in Drives.info - offering anything else would write a
   * STORAGEDRIVE.n that usableAreasFor drops, taking the file area with it.
   */
  // The SAME queryKey as Drive Setup, so it must cache the SAME shape: the
  // whole response, with the array picked out by `select`. Caching the bare
  // array here instead made whichever page resolved last win, and Drive Setup
  // then read `.data` off an array and reported "no drives configured".
  const { data: drives = [] } = useQuery({
    queryKey: ['drives'],
    queryFn: () => apiClient.getDrives(),
    staleTime: 60_000,
    select: (response: { data?: unknown }) =>
      (response?.data ?? []) as Array<{
        drive_number: number;
        drive_path: string;
        kind: 'local' | 's3';
      }>,
  });
  const [formData, setFormData] = useState<ConferenceFormData>({
    conference_id: 1,
    name: '',
    ndirs: 1,
    location: '',
    dlpath_1: '',
    ulpath_1: '',
    min_access_level: 0,
    max_access_level: 255,
    force_newscan: false,
    exclude_ftp: false,
    ftpdirname: '',
    ftp_dir_days: 10,
    no_ftp_uploads: false,
    no_newscan: false,
    show_new_files: false,
    no_new_files: false,
    free_downloads: false,
    use_username: false,
    use_realname: false,
    use_internetname: false,
    menu_prompt: '',
    confdb_shared: 0,
    no_ftp_uploads_text: '',
    private_conf: false,
    read_only: false,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['conferences'],
    queryFn: () => apiClient.getConferenceConfigs(),
  });

  /**
   * Conference directories nothing points at.
   *
   * A delete leaves the directory unless the sysop asks for it - the messages
   * posted there and the files uploaded to it are real - so a board collects
   * them, and until now nothing in the admin could see one. LOCATION.n decides:
   * a Conf<n> directory no conference reads is dead weight, whatever its
   * number.
   */
  const orphansQuery = useQuery({
    queryKey: ['conference-orphan-dirs'],
    queryFn: () => apiClient.getOrphanConferenceDirs(),
  });
  const orphans: { dir: string; files: number; bytes: number }[] =
    orphansQuery.data?.data?.orphans ?? [];

  const removeOrphanMutation = useMutation({
    mutationFn: (dir: string) => apiClient.removeOrphanConferenceDir(dir),
    onSuccess: (_res, dir) => {
      showSuccess(`${dir} removed`);
      queryClient.invalidateQueries({ queryKey: ['conference-orphan-dirs'] });
    },
    onError: (error: Error) => showError(`Could not remove it: ${error.message}`),
  });

  const handleRemoveOrphan = async (orphan: { dir: string; files: number; bytes: number }) => {
    // No checkbox here, so confirm answers with a plain boolean.
    const confirmed = await confirm({
      title: `Delete ${orphan.dir}?`,
      message:
        `${orphan.dir} is not read by any conference - LOCATION.n points elsewhere - `
        + `but it still holds ${orphan.files} file${orphan.files === 1 ? '' : 's'} `
        + `(${formatBytes(orphan.bytes)}), including anything ever posted or uploaded there.\n\n`
        + 'This deletes them. There is no backup of a directory this size.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger',
      requireTypedConfirmation: orphan.dir,
    });
    if (confirmed) removeOrphanMutation.mutate(orphan.dir);
  };

  const createMutation = useMutation({
    mutationFn: (conference: ConferenceFormData) => apiClient.createConferenceConfig({ ...conference, grant }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conferences'] });
      showSuccess('Conference created successfully');
      setIsModalOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      showError(`Failed to create conference: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ confNumber, updates }: { confNumber: number; updates: Partial<ConferenceFormData> }) =>
      apiClient.updateConferenceConfig(confNumber, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conferences'] });
      showSuccess('Conference updated successfully');
      setIsModalOpen(false);
      setEditingConference(null);
      resetForm();
    },
    onError: (error: Error) => {
      showError(`Failed to update conference: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ confNumber, removeFiles }: { confNumber: number; removeFiles: boolean }) =>
      apiClient.deleteConferenceConfig(confNumber, removeFiles),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['conferences'] });
      // The server's own sentence, not "deleted successfully": removing a
      // conference from the middle moves every account's access, and may or
      // may not have taken its files. The sysop is entitled to hear which,
      // from the thing that did it.
      showSuccess(response?.message || 'Conference removed');
    },
    onError: (error: Error) => {
      showError(`Failed to delete conference: ${error.message}`);
    },
  });

  const resetForm = () => {
    setGrant(DEFAULT_GRANT);
    setFormData({
      conference_id: 1,
      name: '',
      ndirs: 1,
      location: '',
      dlpath_1: '',
      ulpath_1: '',
      min_access_level: 0,
      max_access_level: 255,
      force_newscan: false,
    exclude_ftp: false,
      ftpdirname: '',
      ftp_dir_days: 10,
    no_ftp_uploads: false,
      no_newscan: false,
      show_new_files: false,
      no_new_files: false,
      free_downloads: false,
      use_username: false,
      use_realname: false,
      use_internetname: false,
      menu_prompt: '',
      confdb_shared: 0,
      no_ftp_uploads_text: '',
      private_conf: false,
      read_only: false,
    });
  };

  /** Escape, the backdrop and the header's close button all end it the same way. */
  const closeModal = () => {
    setIsModalOpen(false);
    setEditingConference(null);
    resetForm();
  };

  const handleAdd = () => {
    resetForm();
    // The number is not a choice. NCONFS is a COUNT and a conference is a
    // POSITION, so a new one goes on the end - typing 7 on a 12-conference
    // board asks for something the format cannot hold, and typing 14 asks the
    // BBS to walk past two conferences that are not there.
    setFormData((current) => ({
      ...current,
      conference_id: conferences.length + 1,
      // A new conference gets the directory its number implies; an existing one
      // keeps whatever LOCATION.n says, which after a renumber is not `Conf<n>`.
      location: `BBS:Conf${conferences.length + 1}/`,
    }));
    setEditingConference(null);
    setIsModalOpen(true);
  };

  const handleEdit = (conf: ConferenceConfig) => {
    setFormData({
      // Seed the per-directory drive choice from what the conference really
      // has. Without this the buttons always read "This server" on open, so a
      // saved STORAGEDRIVE looked like it had not been saved at all.
      ...Object.fromEntries(
        Array.from({ length: 16 }, (_, i) => [
          `storagedrive_${i + 1}`,
          (conf as never as Record<string, number>)[`storagedrive_${i + 1}`] ?? 0,
        ])
      ),
      conference_id: conf.conference_id,
      name: conf.name || '',
      ndirs: conf.ndirs,
      location: conf.location || `BBS:Conf${conf.conference_id}/`,
      dlpath_1: conf.dlpath_1 || '',
      ulpath_1: conf.ulpath_1 || '',
      // Every directory, not just the first: a conference can declare sixteen,
      // and the other fifteen were unreachable from here.
      ...Object.fromEntries(
        Array.from({ length: 16 }, (_, i) => i + 1).flatMap(dir => [
          [`dlpath_${dir}`, (conf as unknown as Record<string, string>)[`dlpath_${dir}`] || ''],
          [`ulpath_${dir}`, (conf as unknown as Record<string, string>)[`ulpath_${dir}`] || ''],
        ]),
      ),
      min_access_level: conf.min_access_level,
      max_access_level: conf.max_access_level,
      force_newscan: conf.force_newscan,
      exclude_ftp: conf.exclude_ftp,
      ftpdirname: conf.ftpdirname ?? '',
      // ftpd.e:1160 - ten days is express's default, and 0 means no bound,
      // so a stored 0 must survive the fallback.
      ftp_dir_days: conf.ftp_dir_days ?? 10,
      no_ftp_uploads: conf.no_ftp_uploads ?? false,
      no_newscan: conf.no_newscan ?? false,
      show_new_files: conf.show_new_files ?? false,
      no_new_files: conf.no_new_files ?? false,
      free_downloads: conf.free_downloads ?? false,
      use_username: conf.use_username ?? false,
      use_realname: conf.use_realname ?? false,
      use_internetname: conf.use_internetname ?? false,
      menu_prompt: conf.menu_prompt ?? '',
      confdb_shared: conf.confdb_shared ?? 0,
      no_ftp_uploads_text: conf.no_ftp_uploads_text ?? '',
      private_conf: conf.private_conf,
      read_only: conf.read_only,
    });
    setEditingConference(conf);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // A following row is sent as its derived value rather than the empty string
    // it may be stored as, so DLPATH.n/ULPATH.n in the icon carry the path the
    // board is actually using - a door reading them directly finds it there.
    const payload = rowsToFormFields(formData as never) as unknown as ConferenceFormData;

    if (editingConference) {
      updateMutation.mutate({ confNumber: editingConference.conference_id, updates: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = async (conf: ConferenceConfig) => {
    const isLast = conf.conference_id === conferences.length;
    const { confirmed, checked: removeFiles } = await confirm({
      title: 'Delete Conference',
      message:
        `Remove conference ${conf.conference_id}${conf.name ? ` (${conf.name})` : ''}?\n\n` +
        (isLast
          ? `It comes off the end of the list, so no other conference moves.\n\n`
          : `Conferences ${conf.conference_id + 1} to ${conferences.length} move down one ` +
            `to close the gap, and every account's conference access moves with ` +
            `them - a user who could reach ${conf.conference_id + 1} will reach it ` +
            `at ${conf.conference_id} afterwards. Read pointers and the Amiga-side ` +
            `conference list move too.\n\n`) +
        `Everything that changes is copied first, under _conf-backups on the board.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger',
      requireTypedConfirmation: String(conf.conference_id),
      checkbox: {
        label: "Delete the conference's files too",
        description:
          'Every message posted there and every file uploaded to it. Left alone otherwise, ' +
          'and the path is reported so you can remove them yourself.',
      },
    });
    if (confirmed) {
      deleteMutation.mutate({ confNumber: conf.conference_id, removeFiles });
    }
  };

  const conferences = data?.data || EMPTY_CONFERENCES;

  const columns: DataTableColumn<ConferenceConfig>[] = [
    {
      id: 'conference_id',
      header: 'Conf',
      value: (conf) => conf.conference_id,
      align: 'right',
      mono: true,
      width: '5rem',
    },
    {
      id: 'name',
      header: 'Name',
      value: (conf) => conf.name || `Conference ${conf.conference_id}`,
      cell: (conf) => (
        <span className="text-content-primary">{conf.name || `Conference ${conf.conference_id}`}</span>
      ),
    },
    {
      id: 'ndirs',
      header: 'Directories',
      value: (conf) => conf.ndirs,
      align: 'right',
      mono: true,
      width: '7rem',
    },
    {
      id: 'dlpath_1',
      header: 'Download path',
      value: (conf) => conf.dlpath_1 ?? '',
      mono: true,
      cell: (conf) => (
        <span className="block max-w-xs truncate text-content-secondary">{conf.dlpath_1 || 'Not set'}</span>
      ),
    },
    {
      id: 'ulpath_1',
      header: 'Upload path',
      value: (conf) => conf.ulpath_1 ?? '',
      mono: true,
      cell: (conf) => (
        <span className="block max-w-xs truncate text-content-secondary">{conf.ulpath_1 || 'Not set'}</span>
      ),
    },
    {
      id: 'access',
      header: 'Access',
      value: (conf) => conf.min_access_level,
      align: 'right',
      mono: true,
      width: '7rem',
      cell: (conf) => (
        <span>{conf.min_access_level}-{conf.max_access_level}</span>
      ),
    },
    {
      id: 'flags',
      header: 'Flags',
      width: '10rem',
      cell: (conf) => (
        <span className="flex flex-wrap gap-1">
          {conf.private_conf && (
            <span className="rounded bg-accent/20 px-1.5 py-0.5 text-xs text-accent">Private</span>
          )}
          {conf.read_only && (
            <span className="rounded bg-surface-3 px-1.5 py-0.5 text-xs text-content-muted">Read only</span>
          )}
          {!conf.private_conf && !conf.read_only && <span className="text-content-muted">-</span>}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <button onClick={handleAdd} className="btn-primary flex items-center space-x-2">
          <Plus size={20} />
          <span>Add Conference</span>
        </button>
      </div>


      {orphans.length > 0 && (
        <section className="mt-6 border border-status-warn/40 rounded p-4 space-y-2">
          <h2 className="text-content-primary">
            {orphans.length} director{orphans.length === 1 ? 'y' : 'ies'} no conference points at
          </h2>
          <p className="text-sm text-content-secondary">
            Left behind when a conference was deleted without its files. The board
            never reads them - a conference's directory is whatever its LOCATION
            says - so they are dead weight until someone looks inside.
          </p>
          <ul className="space-y-1 text-sm">
            {orphans.map((orphan) => (
              <li key={orphan.dir} className="flex items-center gap-3">
                <span className="font-mono text-content-primary">{orphan.dir}</span>
                <span className="text-content-secondary">
                  {orphan.files} file{orphan.files === 1 ? '' : 's'}, {formatBytes(orphan.bytes)}
                </span>
                <button
                  className="btn-small btn-danger"
                  aria-label={`Remove ${orphan.dir}`}
                  onClick={() => handleRemoveOrphan(orphan)}
                  disabled={removeOrphanMutation.isPending}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <DataTable
        columns={columns}
        rows={conferences}
        getRowId={(conf) => String(conf.id)}
        initialSort={[{ id: 'conference_id', desc: false }]}
        isLoading={isLoading}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="No conferences configured. Add conferences to organize messages and files."
        // The row itself opens the editor. The pencil stays: it is what a
        // keyboard reaches, and it says the row is editable at all.
        onRowClick={handleEdit}
        rowActions={(conf) => (
          <>
            <button
              type="button"
              onClick={() => handleEdit(conf)}
              aria-label={`Edit ${conf.name || `conference ${conf.conference_id}`}`}
              className="rounded p-1 text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
            >
              <Edit2 size={14} />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(conf)}
              aria-label={`Delete ${conf.name || `conference ${conf.conference_id}`}`}
              className="rounded p-1 text-content-secondary transition-colors hover:bg-status-danger/20 hover:text-status-danger"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      />

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <Modal
          open={isModalOpen}
          title={editingConference ? 'Edit Conference' : 'Add Conference'}
          onClose={closeModal}
          maxWidth="max-w-2xl"
          showHeader={false}
        >
            <div className="sticky top-0 bg-surface-0 border-b border-border p-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-accent">
                {editingConference ? 'Edit Conference' : 'Add Conference'}
              </h2>
              <button
                onClick={closeModal}
                className="text-content-secondary hover:text-content-primary transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label htmlFor="name" className="label">Conference Name *</label>
                  <input
                    id="name"
                    type="text"
                    maxLength={54}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="input-field w-full"
                    required
                  />
                  <p className="text-xs text-content-secondary mt-1">
                    Written to ConfConfig.info as NAME.{formData.conference_id} - this is the
                    name the BBS shows in the conference list
                  </p>
                </div>

                <div>
                  <label htmlFor="conference_id" className="label">Conference Number</label>
                  <input
                    id="conference_id"
                    type="number"
                    value={formData.conference_id}
                    className="input-field w-full"
                    readOnly
                    aria-readonly="true"
                  />
                  <p className="text-xs text-content-secondary mt-1">
                    {editingConference
                      ? 'A conference is a position on the board and keeps its number.'
                      : `Assigned automatically - a new conference goes on the end, after ${conferences.length}.`}
                  </p>
                </div>

                <div>
                  <label htmlFor="ndirs" className="label">Number of Directories *</label>
                  <input
                    id="ndirs"
                    type="number"
                    min="1"
                    max="16"
                    value={formData.ndirs}
                    onChange={(e) => setFormData({ ...formData, ndirs: parseInt(e.target.value, 10) || 0 })}
                    className="input-field w-full"
                    required
                  />
                  <p className="text-xs text-content-secondary mt-1">Max 16 directories per conference</p>
                </div>

                <div className="md:col-span-2 space-y-3">
                  <p className="text-xs text-content-secondary">
                    File area paths follow{' '}
                    <span className="font-mono">{formData.location || 'this conference'}</span>{' '}
                    until you change one. A changed path is yours and is never rewritten.
                  </p>

                  {pathRows(formData as never).map((row) => (
                    <div key={row.dir} className="space-y-2 border-b border-border pb-3 last:border-0">
                      {/* Which DRIVE this directory's files live on. Local disk
                          is the absence of STORAGEDRIVE.n, so it is a real
                          choice here rather than a blank. A bucket that is not
                          in Drives.info cannot be offered at all, which is the
                          point of driving these buttons off the drive list. */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="label mb-0">Dir {row.dir} lives on</span>
                        <button
                          type="button"
                          onClick={() =>
                            setFormData((current) => ({ ...current, [`storagedrive_${row.dir}`]: 0 } as never))
                          }
                          className={`rounded border px-2 py-0.5 text-xs transition-colors ${
                            !(formData as never as Record<string, number>)[`storagedrive_${row.dir}`]
                              ? 'border-accent bg-accent/10 text-accent'
                              : 'border-border text-content-secondary hover:border-accent/50'
                          }`}
                        >
                          This server
                        </button>
                        {drives.map((drive) => (
                          <button
                            key={drive.drive_number}
                            type="button"
                            onClick={() =>
                              setFormData((current) => ({
                                ...current,
                                [`storagedrive_${row.dir}`]: drive.drive_number,
                              } as never))
                            }
                            className={`rounded border px-2 py-0.5 text-xs transition-colors ${
                              (formData as never as Record<string, number>)[`storagedrive_${row.dir}`] ===
                              drive.drive_number
                                ? 'border-accent bg-accent/10 text-accent'
                                : 'border-border text-content-secondary hover:border-accent/50'
                            }`}
                            title={drive.drive_path}
                          >
                            {drive.kind === 's3' ? drive.drive_path.replace(/^s3:\/\//, '') : drive.drive_path}
                          </button>
                        ))}
                      </div>
                      {/* Saved on a drive and unchanged here: its files still on this
                          server can be moved onto that drive. */}
                      {editingConference &&
                        (editingConference as never as Record<string, number>)[`storagedrive_${row.dir}`] > 0 &&
                        (editingConference as never as Record<string, number>)[`storagedrive_${row.dir}`] ===
                          (formData as never as Record<string, number>)[`storagedrive_${row.dir}`] && (
                          <MoveExistingFiles conference={editingConference.conference_id} dir={row.dir} />
                        )}

                    <div className="grid grid-cols-2 gap-3">
                      {(['download', 'upload'] as const).map((side) => {
                        const cell = row[side];
                        const field = `${side === 'download' ? 'dlpath' : 'ulpath'}_${row.dir}`;
                        return (
                          <div key={side}>
                            {/* The reset control sits BESIDE the label, not inside it:
                                a button within a label steals the label's click and
                                muddies the field's accessible name. */}
                            <div className="flex items-center justify-between">
                              <label htmlFor={field} className="label mb-0">
                                Dir {row.dir} {side === 'download' ? 'download' : 'upload'}
                              </label>
                              {cell.following ? (
                                <span className="text-xs text-content-secondary">follows</span>
                              ) : (
                                <button
                                  type="button"
                                  className="btn-small btn-secondary"
                                  aria-label={`Reset directory ${row.dir} ${side} path to the default`}
                                  onClick={() =>
                                    setFormData((current) =>
                                      resetPathToDerived(current as never, row.dir, side) as never)
                                  }
                                >
                                  custom - reset
                                </button>
                              )}
                            </div>
                            <input
                              id={field}
                              type="text"
                              value={cell.value}
                              onChange={(e) =>
                                setFormData((current) =>
                                  applyPathEdit(current as never, row.dir, side, e.target.value) as never)
                              }
                              className="input-field w-full font-mono"
                            />
                          </div>
                        );
                      })}
                    </div>
                    </div>
                  ))}
                </div>

                {!editingConference && (
                  <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="grant_kind" className="label">Who Gets Access</label>
                      <select
                        id="grant_kind"
                        value={grant.kind}
                        onChange={(e) => {
                          const kind = e.target.value as ConferenceGrantChoice['kind'];
                          setGrant(kind === 'level' ? { kind, minLevel: formData.min_access_level } : { kind });
                        }}
                        className="input-field w-full"
                      >
                        <option value="everyone">Everyone</option>
                        <option value="sysop">Sysop only</option>
                        <option value="level">By access level</option>
                      </select>
                      <p className="text-xs text-content-secondary mt-1">
                        Set once, on every existing account, when the conference is created.
                      </p>
                    </div>
                    {grant.kind === 'level' && (
                      <div>
                        <label htmlFor="grant_min_level" className="label">Lowest Access Level Granted</label>
                        <input
                          id="grant_min_level"
                          type="number"
                          min="0"
                          max="255"
                          value={grant.minLevel}
                          onChange={(e) => setGrant({ kind: 'level', minLevel: parseInt(e.target.value, 10) || 0 })}
                          className="input-field w-full"
                          required
                        />
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label htmlFor="min_access_level" className="label">Min Access Level *</label>
                  <input
                    id="min_access_level"
                    type="number"
                    min="0"
                    max="255"
                    value={formData.min_access_level}
                    onChange={(e) => setFormData({ ...formData, min_access_level: parseInt(e.target.value, 10) || 0 })}
                    className="input-field w-full"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="max_access_level" className="label">Max Access Level *</label>
                  <input
                    id="max_access_level"
                    type="number"
                    min="0"
                    max="255"
                    value={formData.max_access_level}
                    onChange={(e) => setFormData({ ...formData, max_access_level: parseInt(e.target.value, 10) || 0 })}
                    className="input-field w-full"
                    required
                  />
                </div>

                <div className="md:col-span-2 space-y-3">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.force_newscan}
                      onChange={(e) => setFormData({ ...formData, force_newscan: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-accent"
                    />
                    <span className="text-content-primary">Force Newscan</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.exclude_ftp}
                      onChange={(e) => setFormData({ ...formData, exclude_ftp: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-accent"
                    />
                    <span className="text-content-primary">Exclude FTP</span>
                  </label>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="ftpdirname" className="label">FTP Directory Name</label>
                      <input
                        id="ftpdirname"
                        type="text"
                        value={formData.ftpdirname}
                        onChange={(e) => setFormData({ ...formData, ftpdirname: e.target.value })}
                        placeholder={formData.name || 'Conference name'}
                        className="input-field w-full"
                      />
                      <p className="text-sm text-content-secondary mt-1">
                        The name this conference wears over FTP. Empty uses the conference name.
                      </p>
                    </div>

                    <div>
                      <label htmlFor="ftp_dir_days" className="label">FTP Listing Days</label>
                      <input
                        id="ftp_dir_days"
                        type="number"
                        min="0"
                        max="3650"
                        value={formData.ftp_dir_days}
                        onChange={(e) => setFormData({ ...formData, ftp_dir_days: parseInt(e.target.value, 10) || 0 })}
                        className="input-field w-full"
                      />
                      <p className="text-sm text-content-secondary mt-1">
                        How far back an FTP listing reaches. 0 lists everything.
                      </p>
                    </div>
                  </div>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.no_ftp_uploads}
                      onChange={(e) => setFormData({ ...formData, no_ftp_uploads: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-accent"
                    />
                    <span className="text-content-primary">Block FTP Uploads</span>
                  </label>

                  {formData.no_ftp_uploads && (
                    <div>
                      <label htmlFor="no_ftp_uploads_text" className="label">Upload Refusal Message</label>
                      <input
                        id="no_ftp_uploads_text"
                        type="text"
                        value={formData.no_ftp_uploads_text}
                        onChange={(e) => setFormData({ ...formData, no_ftp_uploads_text: e.target.value })}
                        placeholder="Not expecting any uploads"
                        className="input-field w-full"
                      />
                      <p className="text-sm text-content-secondary mt-1">
                        What an FTP caller is told when he tries to upload here.
                      </p>
                    </div>
                  )}


                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.no_newscan}
                      onChange={(e) => setFormData({ ...formData, no_newscan: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-accent"
                    />
                    <span className="text-content-primary">Never New-Scan</span>
                  </label>
                  <p className="text-sm text-content-secondary ml-7 -mt-2">Skip this conference when a caller scans for new messages.</p>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.show_new_files}
                      onChange={(e) => setFormData({ ...formData, show_new_files: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-accent"
                    />
                    <span className="text-content-primary">Show New Files</span>
                  </label>
                  <p className="text-sm text-content-secondary ml-7 -mt-2">Include this conference in a new-files scan.</p>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.no_new_files}
                      onChange={(e) => setFormData({ ...formData, no_new_files: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-accent"
                    />
                    <span className="text-content-primary">Never New-Files Scan</span>
                  </label>
                  <p className="text-sm text-content-secondary ml-7 -mt-2">Skip it when a caller scans for new files.</p>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.free_downloads}
                      onChange={(e) => setFormData({ ...formData, free_downloads: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-accent"
                    />
                    <span className="text-content-primary">Free Downloads</span>
                  </label>
                  <p className="text-sm text-content-secondary ml-7 -mt-2">Downloads here do not count against the caller\u2019s ratio.</p>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.use_username}
                      onChange={(e) => setFormData({ ...formData, use_username: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-accent"
                    />
                    <span className="text-content-primary">Show User Names</span>
                  </label>
                  <p className="text-sm text-content-secondary ml-7 -mt-2">Callers appear here under their user name.</p>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.use_realname}
                      onChange={(e) => setFormData({ ...formData, use_realname: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-accent"
                    />
                    <span className="text-content-primary">Show Real Names</span>
                  </label>
                  <p className="text-sm text-content-secondary ml-7 -mt-2">Callers appear here under their real name.</p>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.use_internetname}
                      onChange={(e) => setFormData({ ...formData, use_internetname: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-accent"
                    />
                    <span className="text-content-primary">Show Internet Names</span>
                  </label>
                  <p className="text-sm text-content-secondary ml-7 -mt-2">Callers appear here under their internet name.</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="menu_prompt" className="label">Menu Prompt</label>
                      <input
                        id="menu_prompt"
                        type="text"
                        value={formData.menu_prompt}
                        onChange={(e) => setFormData({ ...formData, menu_prompt: e.target.value })}
                        className="input-field w-full"
                      />
                      <p className="text-sm text-content-secondary mt-1">
                        The prompt this conference shows in place of the board default.
                      </p>
                    </div>

                    <div>
                      <label htmlFor="confdb_shared" className="label">Shares Message Base With</label>
                      <input
                        id="confdb_shared"
                        type="number"
                        min="0"
                        value={formData.confdb_shared}
                        onChange={(e) => setFormData({ ...formData, confdb_shared: parseInt(e.target.value, 10) || 0 })}
                        className="input-field w-full"
                      />
                      <p className="text-sm text-content-secondary mt-1">
                        Conference number whose messages this one shares. 0 keeps its own.
                      </p>
                    </div>
                  </div>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.private_conf}
                      onChange={(e) => setFormData({ ...formData, private_conf: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-accent"
                    />
                    <span className="text-content-primary">Private Conference</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.read_only}
                      onChange={(e) => setFormData({ ...formData, read_only: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-accent"
                    />
                    <span className="text-content-primary">Read Only</span>
                  </label>
                </div>
              </div>

              {/*
                ConfTop's settings, and only for a conference that already
                exists: they live in an icon in the conference DIRECTORY, so
                there is nothing to write until the directory is there.

                Its own Save, over its own endpoint - see ConftopSettings.
              */}
              {editingConference && (
                <div className="pt-6 border-t border-border">
                  <h3 className="font-semibold text-content-primary">Top uploaders (ConfTop)</h3>
                  <p className="text-sm text-content-secondary mt-1 mb-4">
                    The door that prints this conference's top-uploaders bulletin.
                    Its settings live in the conference's own
                    <span className="mx-1 font-mono">Conftop.info</span>
                    icon, which is the only place the door reads them from.
                  </p>
                  <ConftopSettings conferenceId={editingConference.conference_id} />
                </div>
              )}

              <div className="flex justify-end space-x-4 pt-6 border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingConference(null);
                    resetForm();
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editingConference ? 'Update Conference' : 'Create Conference'}
                </button>
              </div>
            </form>
        </Modal>
      )}
    </div>
  );
}
