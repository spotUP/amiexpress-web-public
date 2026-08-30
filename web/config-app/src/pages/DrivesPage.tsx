import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit2, Trash2, Plus, X } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';

/** A stable fallback: a fresh array each render invalidates the row model. */
const EMPTY_DRIVES: DriveConfig[] = [];

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

  const drives = data?.data || EMPTY_DRIVES;

  const columns: DataTableColumn<DriveConfig>[] = [
    {
      id: 'enabled',
      header: 'Status',
      value: (drive) => (drive.enabled ? 1 : 0),
      width: '8rem',
      cell: (drive) => (
        <span
          className={`inline-flex items-center rounded px-2 py-0.5 text-xs ${
            drive.enabled ? 'bg-status-ok/20 text-status-ok' : 'bg-surface-3 text-content-muted'
          }`}
        >
          {drive.enabled ? 'Enabled' : 'Disabled'}
        </span>
      ),
    },
    {
      id: 'drive_number',
      header: 'Drive',
      value: (drive) => drive.drive_number,
      align: 'right',
      mono: true,
      width: '6rem',
    },
    {
      id: 'drive_path',
      header: 'Path',
      value: (drive) => drive.drive_path,
      mono: true,
      cell: (drive) => (
        <span className="block max-w-md truncate text-content-secondary">{drive.drive_path}</span>
      ),
    },
    {
      id: 'description',
      header: 'Description',
      value: (drive) => drive.description ?? '',
      cell: (drive) => (
        <span className="block max-w-sm truncate text-content-secondary">{drive.description || '-'}</span>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <button onClick={handleAdd} className="btn-primary flex items-center space-x-2">
          <Plus size={20} />
          <span>Add Drive</span>
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={drives}
        getRowId={(drive) => String(drive.id)}
        initialSort={[{ id: 'drive_number', desc: false }]}
        isLoading={isLoading}
        emptyMessage="No drives configured. Add drive mappings to define BBS storage locations."
        rowActions={(drive) => (
          <>
            <button
              type="button"
              onClick={() => handleEdit(drive)}
              aria-label={`Edit drive ${drive.drive_number}`}
              className="rounded p-1 text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
            >
              <Edit2 size={14} />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(drive)}
              aria-label={`Delete drive ${drive.drive_number}`}
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
          <div className="bg-bbs-bg border-2 border-bbs-accent rounded-lg max-w-md w-full m-4">
            <div className="border-b border-bbs-primary p-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-accent">
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
                    className="form-checkbox h-5 w-5 text-accent"
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
