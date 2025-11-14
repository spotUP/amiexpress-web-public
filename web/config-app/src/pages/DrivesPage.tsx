import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HardDrive, Edit2, Trash2, Plus, X } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';

interface DriveConfig {
  id: number;
  drive_number: number;
  drive_path: string;
  enabled: boolean;
  description?: string;
  created_at: Date;
  updated_at: Date;
}

interface DriveFormData {
  drive_number: number;
  drive_path: string;
  description: string;
  enabled: boolean;
}

export function DrivesPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError, confirm } = useNotification();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDrive, setEditingDrive] = useState<DriveConfig | null>(null);
  const [formData, setFormData] = useState<DriveFormData>({
    drive_number: 0,
    drive_path: '',
    description: '',
    enabled: true,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['drives'],
    queryFn: () => apiClient.getDrives(),
  });

  const createMutation = useMutation({
    mutationFn: (drive: DriveFormData) => apiClient.createDrive(drive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drives'] });
      showSuccess('Drive created successfully');
      setIsModalOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      showError(`Failed to create drive: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<DriveFormData> }) =>
      apiClient.updateDrive(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drives'] });
      showSuccess('Drive updated successfully');
      setIsModalOpen(false);
      setEditingDrive(null);
      resetForm();
    },
    onError: (error: Error) => {
      showError(`Failed to update drive: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteDrive(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drives'] });
      showSuccess('Drive deleted successfully');
    },
    onError: (error: Error) => {
      showError(`Failed to delete drive: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      drive_number: 0,
      drive_path: '',
      description: '',
      enabled: true,
    });
  };

  const handleAdd = () => {
    resetForm();
    setEditingDrive(null);
    setIsModalOpen(true);
  };

  const handleEdit = (drive: DriveConfig) => {
    setFormData({
      drive_number: drive.drive_number,
      drive_path: drive.drive_path,
      description: drive.description || '',
      enabled: drive.enabled,
    });
    setEditingDrive(drive);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingDrive) {
      updateMutation.mutate({ id: editingDrive.id, updates: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = async (drive: DriveConfig) => {
    const confirmed = await confirm({
      title: 'Delete Drive',
      message: `Are you sure you want to delete drive ${drive.drive_number} (${drive.drive_path})?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger'
    });
    if (confirmed) {
      deleteMutation.mutate(drive.id);
    }
  };

  if (isLoading) {
    return <div className="text-bbs-text">Loading drives...</div>;
  }

  const drives = data?.data || [];

  return (
    <div>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-bbs-accent mb-2">Drives Configuration</h1>
          <p className="text-bbs-muted">Manage BBS drive assignments and paths (TOOLTYPE_DRIVES)</p>
        </div>
        <button onClick={handleAdd} className="btn-primary flex items-center space-x-2">
          <Plus size={20} />
          <span>Add Drive</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {drives.map((drive: DriveConfig) => (
          <div key={drive.id} className="card">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-bbs-primary rounded">
                  <HardDrive className="text-bbs-accent" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-bbs-text">Drive {drive.drive_number}</h3>
                  <p className="text-xs text-bbs-muted font-mono">{drive.drive_path}</p>
                </div>
              </div>
              <div
                className={`px-2 py-1 rounded text-xs ${
                  drive.enabled
                    ? 'bg-green-500/20 text-green-500'
                    : 'bg-bbs-muted/20 text-bbs-muted'
                }`}
              >
                {drive.enabled ? 'Enabled' : 'Disabled'}
              </div>
            </div>

            {drive.description && (
              <p className="text-sm text-bbs-muted mb-4">{drive.description}</p>
            )}

            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between">
                <span className="text-bbs-muted">Drive Number:</span>
                <span className="text-bbs-text font-mono">{drive.drive_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-bbs-muted">Path:</span>
                <span className="text-bbs-text font-mono text-xs">{drive.drive_path}</span>
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => handleEdit(drive)}
                className="btn-secondary flex-1 flex items-center justify-center space-x-2"
              >
                <Edit2 size={16} />
                <span>Edit</span>
              </button>
              <button
                onClick={() => handleDelete(drive)}
                className="bg-bbs-accent hover:bg-bbs-accent/90 text-white font-medium py-2 px-4 rounded transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {drives.length === 0 && (
        <div className="card text-center text-bbs-muted">
          No drives configured. Add drive mappings to define BBS storage locations.
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bbs-bg border-2 border-bbs-accent rounded-lg max-w-md w-full m-4">
            <div className="border-b border-bbs-primary p-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-bbs-accent">
                {editingDrive ? 'Edit Drive' : 'Add Drive'}
              </h2>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingDrive(null);
                  resetForm();
                }}
                className="text-bbs-muted hover:text-bbs-text transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div>
                <label htmlFor="drive_number" className="label">Drive Number *</label>
                <input
                  id="drive_number"
                  type="number"
                  min="0"
                  max="255"
                  value={formData.drive_number}
                  onChange={(e) => setFormData({ ...formData, drive_number: parseInt(e.target.value) })}
                  className="input-field w-full"
                  required
                />
              </div>

              <div>
                <label htmlFor="drive_path" className="label">Drive Path *</label>
                <input
                  id="drive_path"
                  type="text"
                  value={formData.drive_path}
                  onChange={(e) => setFormData({ ...formData, drive_path: e.target.value })}
                  className="input-field w-full font-mono"
                  placeholder="/path/to/drive"
                  required
                />
              </div>

              <div>
                <label htmlFor="description" className="label">Description</label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input-field w-full"
                  rows={3}
                  placeholder="Optional description..."
                />
              </div>

              <div>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                    className="form-checkbox h-5 w-5 text-bbs-accent"
                  />
                  <span className="text-bbs-text">Enabled</span>
                </label>
              </div>

              <div className="flex justify-end space-x-4 pt-6 border-t border-bbs-primary">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingDrive(null);
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
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editingDrive ? 'Update Drive' : 'Create Drive'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
