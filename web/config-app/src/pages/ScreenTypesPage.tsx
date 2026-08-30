import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit2, Trash2, Plus, ToggleLeft, ToggleRight } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';

/** Stable fallback: a fresh array each render invalidates the row model. */
const EMPTY_SCREEN_TYPES: ScreenType[] = [];

interface ScreenType {
  id: number;
  screen_number: number;
  screen_type: string;
  screen_title: string;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export function ScreenTypesPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError, confirm } = useNotification();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<ScreenType | null>(null);
  const [formData, setFormData] = useState<Omit<ScreenType, 'id' | 'created_at' | 'updated_at'>>({
    screen_number: 1,
    screen_type: '',
    screen_title: '',
    enabled: true,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['screen-types'],
    queryFn: () => apiClient.getScreenTypes(),
  });

  const createMutation = useMutation({
    mutationFn: (payload: Omit<ScreenType, 'id' | 'created_at' | 'updated_at'>) =>
      apiClient.createScreenType(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screen-types'] });
      showSuccess('Screen type created successfully');
      setIsModalOpen(false);
      setEditing(null);
    },
    onError: (error: Error) => showError(`Failed to create screen type: ${error.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<ScreenType> }) =>
      apiClient.updateScreenType(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screen-types'] });
      showSuccess('Screen type updated successfully');
      setIsModalOpen(false);
      setEditing(null);
    },
    onError: (error: Error) => showError(`Failed to update screen type: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteScreenType(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screen-types'] });
      showSuccess('Screen type deleted successfully');
    },
  });

  const handleDelete = async (screenType: ScreenType) => {
    const confirmed = await confirm({
      title: 'Delete Screen Type',
      message: `Are you sure you want to delete screen type "${screenType.screen_title}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger'
    });
    if (confirmed) {
      deleteMutation.mutate(screenType.id);
    }
  };

  const handleAdd = () => {
    const nextNumber = (data?.data?.reduce((max: number, s: ScreenType) => Math.max(max, s.screen_number), 0) || 0) + 1;
    setFormData({
      screen_number: nextNumber,
      screen_type: '',
      screen_title: '',
      enabled: true
    });
    setEditing(null);
    setIsModalOpen(true);
  };

  const handleEdit = (screenType: ScreenType) => {
    setFormData({
      screen_number: screenType.screen_number,
      screen_type: screenType.screen_type,
      screen_title: screenType.screen_title,
      enabled: screenType.enabled
    });
    setEditing(screenType);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      updateMutation.mutate({ id: editing.id, updates: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleToggle = (screenType: ScreenType) => {
    updateMutation.mutate({ id: screenType.id, updates: { enabled: !screenType.enabled } });
  };

  const screenTypes: ScreenType[] = data?.data ?? EMPTY_SCREEN_TYPES;

  const columns: DataTableColumn<ScreenType>[] = [
    {
      id: 'enabled',
      header: 'Status',
      value: (screenType) => (screenType.enabled ? 1 : 0),
      width: '9rem',
      cell: (screenType) => (
        <button
          type="button"
          onClick={() => handleToggle(screenType)}
          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors ${
            screenType.enabled
              ? 'bg-status-ok/20 text-status-ok hover:bg-status-ok/30'
              : 'bg-surface-3 text-content-muted hover:bg-surface-2'
          }`}
        >
          {screenType.enabled ? <ToggleRight size={12} aria-hidden="true" /> : <ToggleLeft size={12} aria-hidden="true" />}
          {screenType.enabled ? 'Enabled' : 'Disabled'}
        </button>
      ),
    },
    {
      id: 'screen_number',
      header: 'Number',
      value: (screenType) => screenType.screen_number,
      align: 'right',
      mono: true,
      width: '6rem',
    },
    {
      id: 'screen_title',
      header: 'Title',
      value: (screenType) => screenType.screen_title,
      cell: (screenType) => <span className="text-content-primary">{screenType.screen_title}</span>,
    },
    {
      id: 'screen_type',
      header: 'Type code',
      value: (screenType) => screenType.screen_type,
      mono: true,
      width: '9rem',
    },
  ];

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <button onClick={handleAdd} className="btn-primary flex items-center space-x-2">
          <Plus size={20} />
          <span>Add Screen Type</span>
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={screenTypes}
        getRowId={(screenType) => String(screenType.id)}
        initialSort={[{ id: 'screen_number', desc: false }]}
        isLoading={isLoading}
        emptyMessage="No screen types configured. These are the terminal formats offered at login - ANSI, ASCII and the rest."
        rowActions={(screenType) => (
          <>
            <button
              type="button"
              onClick={() => handleEdit(screenType)}
              aria-label={`Edit ${screenType.screen_title}`}
              className="rounded p-1 text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
            >
              <Edit2 size={14} />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(screenType)}
              aria-label={`Delete ${screenType.screen_title}`}
              className="rounded p-1 text-content-secondary transition-colors hover:bg-status-danger/20 hover:text-status-danger"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      />

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bbs-surface border border-bbs-primary rounded-lg shadow-xl w-full max-w-lg p-6">
            <h2 className="text-xl font-semibold text-bbs-text mb-4">
              {editing ? 'Edit Screen Type' : 'Add Screen Type'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="screen_title" className="label">Title</label>
                <input
                  id="screen_title"
                  type="text"
                  value={formData.screen_title}
                  onChange={(e) => setFormData({ ...formData, screen_title: e.target.value })}
                  className="input-field w-full"
                  required
                />
              </div>
              <div>
                <label htmlFor="screen_type" className="label">Type Code</label>
                <input
                  id="screen_type"
                  type="text"
                  value={formData.screen_type}
                  onChange={(e) => setFormData({ ...formData, screen_type: e.target.value })}
                  className="input-field w-full"
                  required
                />
              </div>
              <div>
                <label htmlFor="screen_number" className="label">Number</label>
                <input
                  id="screen_number"
                  type="number"
                  value={formData.screen_number}
                  onChange={(e) => setFormData({ ...formData, screen_number: Number(e.target.value) })}
                  className="input-field w-full"
                  min={1}
                />
              </div>
              <div className="flex items-center space-x-3">
                <input
                  id="screen_enabled"
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="screen_enabled" className="text-sm text-bbs-text">
                  Enabled
                </label>
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditing(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editing ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
