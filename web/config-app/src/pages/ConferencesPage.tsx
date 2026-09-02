import { useState } from 'react';
import { Modal } from '../components/ui/Modal';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit2, Trash2, Plus, X } from 'lucide-react';
import { apiClient } from '../api/client';
import type { ConferenceConfig } from '../types';
import { useNotification } from '../contexts/NotificationContext';
import { formatBytes } from '../lib/format';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { pathRows, applyPathEdit, resetPathToDerived, rowsToFormFields } from './conference-path-rows';

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
    mutationFn: (conference: ConferenceFormData) => apiClient.createConferenceConfig(conference),
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
                  className="underline text-status-danger"
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
                    onChange={(e) => setFormData({ ...formData, ndirs: parseInt(e.target.value) })}
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
                    <div key={row.dir} className="grid grid-cols-2 gap-3">
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
                                  className="text-xs underline text-content-secondary"
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
                  ))}
                </div>

                <div>
                  <label htmlFor="min_access_level" className="label">Min Access Level *</label>
                  <input
                    id="min_access_level"
                    type="number"
                    min="0"
                    max="255"
                    value={formData.min_access_level}
                    onChange={(e) => setFormData({ ...formData, min_access_level: parseInt(e.target.value) })}
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
                    onChange={(e) => setFormData({ ...formData, max_access_level: parseInt(e.target.value) })}
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
