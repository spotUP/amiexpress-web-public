import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit2, Trash2, Plus, X } from 'lucide-react';
import { apiClient } from '../api/client';
import type { ConferenceConfig } from '../types';
import { useNotification } from '../contexts/NotificationContext';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';

interface ConferenceFormData {
  conference_id: number;
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
  const [formData, setFormData] = useState<ConferenceFormData>({
    conference_id: 1,
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

  const { data, isLoading } = useQuery({
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
    mutationFn: (confNumber: number) => apiClient.deleteConferenceConfig(confNumber),
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

  const handleAdd = () => {
    resetForm();
    setEditingConference(null);
    setIsModalOpen(true);
  };

  const handleEdit = (conf: ConferenceConfig) => {
    setFormData({
      conference_id: conf.conference_id,
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
    const confirmed = await confirm({
      title: 'Delete Conference',
      message: `Are you sure you want to delete conference ${conf.conference_id}?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger'
    });
    if (confirmed) {
      deleteMutation.mutate(conf.conference_id);
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

      <DataTable
        columns={columns}
        rows={conferences}
        getRowId={(conf) => String(conf.id)}
        initialSort={[{ id: 'conference_id', desc: false }]}
        isLoading={isLoading}
        emptyMessage="No conferences configured. Add conferences to organize messages and files."
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bbs-bg border-2 border-bbs-accent rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto m-4">
            <div className="sticky top-0 bg-bbs-bg border-b border-bbs-primary p-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-accent">
                {editingConference ? 'Edit Conference' : 'Add Conference'}
              </h2>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingConference(null);
                  resetForm();
                }}
                className="text-bbs-muted hover:text-bbs-text transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
          </div>
        </div>
      )}
    </div>
  );
}
