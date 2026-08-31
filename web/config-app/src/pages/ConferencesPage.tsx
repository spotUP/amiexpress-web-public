import { useState } from 'react';
import { Modal } from '../components/ui/Modal';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit2, Trash2, Plus, X } from 'lucide-react';
import { apiClient } from '../api/client';
import type { ConferenceConfig } from '../types';
import { useNotification } from '../contexts/NotificationContext';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';

interface ConferenceFormData {
  conference_id: number;
  name: string;
  ndirs: number;
  dlpath_1: string;
  ulpath_1: string;
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
  /**
   * Off by default, and read at the moment of the confirm so the dialog can
   * say which of the two things is about to happen. A conference's directory
   * holds every message posted there and every file uploaded to it.
   */
  const [removeFilesOnDelete, setRemoveFilesOnDelete] = useState(false);
  const [formData, setFormData] = useState<ConferenceFormData>({
    conference_id: 1,
    name: '',
    ndirs: 1,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conferences'] });
      showSuccess('Conference deleted successfully');
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
    setEditingConference(null);
    setIsModalOpen(true);
  };

  const handleEdit = (conf: ConferenceConfig) => {
    setFormData({
      conference_id: conf.conference_id,
      name: conf.name || '',
      ndirs: conf.ndirs,
      dlpath_1: conf.dlpath_1 || '',
      ulpath_1: conf.ulpath_1 || '',
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
    if (editingConference) {
      updateMutation.mutate({ confNumber: editingConference.conference_id, updates: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = async (conf: ConferenceConfig) => {
    const isLast = conf.conference_id === conferences.length;
    const confirmed = await confirm({
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
        (removeFilesOnDelete
          ? `Its DIRECTORY WILL BE DELETED: every message posted there and every ` +
            `file uploaded to it goes with it. This cannot be undone from here.\n\n`
          : `Its directory is left alone - every message and upload stays on disk, ` +
            `and the path is reported so you can remove it yourself.\n\n`) +
        `Everything that changes is copied first, under _conf-backups on the board.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger',
      requireTypedConfirmation: String(conf.conference_id),
    });
    if (confirmed) {
      deleteMutation.mutate({
        confNumber: conf.conference_id,
        removeFiles: removeFilesOnDelete,
      });
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

      <label className="flex items-center gap-2 text-sm text-content-secondary">
        <input
          type="checkbox"
          checked={removeFilesOnDelete}
          onChange={(e) => setRemoveFilesOnDelete(e.target.checked)}
          className="form-checkbox h-4 w-4 text-accent"
        />
        <span>
          Delete the conference's files too
          <span className="ml-2 text-content-muted">
            every message posted there and every upload in it, not just the entry
          </span>
        </span>
      </label>

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
            <div className="sticky top-0 bg-bbs-bg border-b border-bbs-primary p-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-accent">
                {editingConference ? 'Edit Conference' : 'Add Conference'}
              </h2>
              <button
                onClick={closeModal}
                className="text-bbs-muted hover:text-bbs-text transition-colors"
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
                  <p className="text-xs text-bbs-muted mt-1">
                    Written to ConfConfig.info as NAME.{formData.conference_id} - this is the
                    name the BBS shows in the conference list
                  </p>
                </div>

                <div>
                  <label htmlFor="conference_id" className="label">Conference ID *</label>
                  <input
                    id="conference_id"
                    type="number"
                    min="1"
                    max="99"
                    value={formData.conference_id}
                    onChange={(e) => setFormData({ ...formData, conference_id: parseInt(e.target.value) })}
                    className="input-field w-full"
                    required
                    disabled={!!editingConference}
                  />
                  <p className="text-xs text-bbs-muted mt-1">Conference number (1-99)</p>
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
                  <p className="text-xs text-bbs-muted mt-1">Max 16 directories per conference</p>
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="dlpath_1" className="label">Download Path</label>
                  <input
                    id="dlpath_1"
                    type="text"
                    value={formData.dlpath_1}
                    onChange={(e) => setFormData({ ...formData, dlpath_1: e.target.value })}
                    className="input-field w-full font-mono"
                    placeholder="/path/to/downloads"
                  />
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="ulpath_1" className="label">Upload Path</label>
                  <input
                    id="ulpath_1"
                    type="text"
                    value={formData.ulpath_1}
                    onChange={(e) => setFormData({ ...formData, ulpath_1: e.target.value })}
                    className="input-field w-full font-mono"
                    placeholder="/path/to/uploads"
                  />
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
                    <span className="text-bbs-text">Force Newscan</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.exclude_ftp}
                      onChange={(e) => setFormData({ ...formData, exclude_ftp: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-accent"
                    />
                    <span className="text-bbs-text">Exclude FTP</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.private_conf}
                      onChange={(e) => setFormData({ ...formData, private_conf: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-accent"
                    />
                    <span className="text-bbs-text">Private Conference</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.read_only}
                      onChange={(e) => setFormData({ ...formData, read_only: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-accent"
                    />
                    <span className="text-bbs-text">Read Only</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end space-x-4 pt-6 border-t border-bbs-primary">
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
