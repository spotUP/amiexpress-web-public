import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Monitor, Edit2, Trash2, Plus, ToggleLeft, ToggleRight } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';

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

  if (isLoading) {
    return <div className="text-bbs-text">Loading screen types...</div>;
  }

  const screenTypes = data?.data || [];

  return (
    <div>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-bbs-accent mb-2">Screen Types</h1>
          <p className="text-bbs-muted">Manage terminal format types (TOOLTYPE_SCREENTYPES)</p>
        </div>
        <button onClick={handleAdd} className="btn-primary flex items-center space-x-2">
          <Plus size={20} />
          <span>Add Screen Type</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {screenTypes.map((screenType: ScreenType) => (
          <div key={screenType.id} className="card">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-bbs-primary rounded">
                  <Monitor className="text-bbs-accent" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-bbs-text">{screenType.screen_title}</h3>
                  <p className="text-xs text-bbs-muted font-mono">{screenType.screen_type}</p>
                </div>
              </div>
              <button
                onClick={() => handleToggle(screenType)}
                className={`flex items-center space-x-1 px-2 py-1 rounded text-xs ${
                  screenType.enabled
                    ? 'bg-green-500/20 text-green-500'
                    : 'bg-bbs-muted/20 text-bbs-muted'
                }`}
                title="Toggle availability"
              >
                {screenType.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                <span>{screenType.enabled ? 'Enabled' : 'Disabled'}</span>
              </button>
            </div>

            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between">
                <span className="text-bbs-muted">Number:</span>
                <span className="text-bbs-text font-mono">{screenType.screen_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-bbs-muted">Type:</span>
                <span className="text-bbs-text font-mono">{screenType.screen_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-bbs-muted">Title:</span>
                <span className="text-bbs-text">{screenType.screen_title}</span>
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => handleEdit(screenType)}
                className="btn-secondary flex-1 flex items-center justify-center space-x-2"
              >
                <Edit2 size={16} />
                <span>Edit</span>
              </button>
              <button
                onClick={() => handleDelete(screenType)}
                className="bg-bbs-accent hover:bg-bbs-accent/90 text-white font-medium py-2 px-4 rounded transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {screenTypes.length === 0 && (
        <div className="card text-center text-bbs-muted">
          No screen types configured. Add screen types to define terminal formats (ANSI, ASCII, etc.).
        </div>
      )}

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
