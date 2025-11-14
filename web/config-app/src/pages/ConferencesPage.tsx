import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Edit2, Trash2, Plus, X } from 'lucide-react';
import { apiClient } from '../api/client';
import type { ConferenceConfig } from '../types';
import { useNotification } from '../contexts/NotificationContext';

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

  if (isLoading) {
    return <div className="text-bbs-text">Loading conference configurations...</div>;
  }

  const conferences = data?.data || [];

  return (
    <div>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-bbs-accent mb-2">Conference Configuration</h1>
          <p className="text-bbs-muted">Manage message and file conference settings</p>
        </div>
        <button onClick={handleAdd} className="btn-primary flex items-center space-x-2">
          <Plus size={20} />
          <span>Add Conference</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {conferences.map((conf: ConferenceConfig) => (
          <div key={conf.id} className="card">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-bbs-primary rounded">
                  <MessageSquare className="text-bbs-accent" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-bbs-text">Conference {conf.conference_id}</h3>
                  <p className="text-xs text-bbs-muted">
                    {conf.ndirs} director{conf.ndirs === 1 ? 'y' : 'ies'} configured
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between">
                <span className="text-bbs-muted">Download Path:</span>
                <span className="text-bbs-text font-mono text-xs">{conf.dlpath_1 || 'Not set'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-bbs-muted">Upload Path:</span>
                <span className="text-bbs-text font-mono text-xs">{conf.ulpath_1 || 'Not set'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-bbs-muted">Access Level:</span>
                <span className="text-bbs-text">{conf.min_access_level}-{conf.max_access_level}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-bbs-muted">Private:</span>
                <span className="text-bbs-text">{conf.private_conf ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-bbs-muted">Read Only:</span>
                <span className="text-bbs-text">{conf.read_only ? 'Yes' : 'No'}</span>
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => handleEdit(conf)}
                className="btn-secondary flex-1 flex items-center justify-center space-x-2"
              >
                <Edit2 size={16} />
                <span>Edit</span>
              </button>
              <button
                onClick={() => handleDelete(conf)}
                className="bg-bbs-accent hover:bg-bbs-accent/90 text-white font-medium py-2 px-4 rounded transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {conferences.length === 0 && (
        <div className="card text-center text-bbs-muted">
          No conferences configured. Add conferences to organize messages and files.
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bbs-bg border-2 border-bbs-accent rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto m-4">
            <div className="sticky top-0 bg-bbs-bg border-b border-bbs-primary p-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-bbs-accent">
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
                      className="form-checkbox h-5 w-5 text-bbs-accent"
                    />
                    <span className="text-bbs-text">Force Newscan</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.exclude_ftp}
                      onChange={(e) => setFormData({ ...formData, exclude_ftp: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-bbs-accent"
                    />
                    <span className="text-bbs-text">Exclude FTP</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.private_conf}
                      onChange={(e) => setFormData({ ...formData, private_conf: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-bbs-accent"
                    />
                    <span className="text-bbs-text">Private Conference</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.read_only}
                      onChange={(e) => setFormData({ ...formData, read_only: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-bbs-accent"
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
