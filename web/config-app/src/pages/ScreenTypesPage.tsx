import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit2, Trash2, Plus, ToggleLeft, ToggleRight } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';
import { DataGrid, type DataGridColumn } from '../components/DataGrid';

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
  const [sortKey, setSortKey] = useState<string>('screen_number');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
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

  const screenTypes = (data?.data || []).sort((a: ScreenType, b: ScreenType) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const aVal = a[sortKey as keyof ScreenType];
    const bVal = b[sortKey as keyof ScreenType];

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return aVal.localeCompare(bVal) * dir;
    }
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return (aVal - bVal) * dir;
    }
    if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
      return (aVal === bVal ? 0 : aVal ? -1 : 1) * dir;
    }
    return 0;
  });

  const columns: DataGridColumn<ScreenType>[] = [
    {
      key: 'enabled',
      header: 'Status',
      sortable: true,
      render: (screenType) => (
        <button
          onClick={() => handleToggle(screenType)}
          className={`flex items-center space-x-1 px-2 py-1 rounded text-xs ${
            screenType.enabled ? 'bg-status-ok/20 text-status-ok' : 'bg-bbs-muted/20 text-bbs-muted'
          }`}
        >
          {screenType.enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
          <span>{screenType.enabled ? 'Enabled' : 'Disabled'}</span>
        </button>
      ),
    },
    {
      key: 'screen_number',
      header: 'Number',
      sortable: true,
      render: (screenType) => <span className="text-bbs-text font-mono">{screenType.screen_number}</span>,
    },
    {
      key: 'screen_title',
      header: 'Title',
      sortable: true,
      render: (screenType) => <span className="text-bbs-text font-semibold">{screenType.screen_title}</span>,
    },
    {
      key: 'screen_type',
      header: 'Type Code',
      sortable: true,
      render: (screenType) => <code className="text-bbs-text bg-bbs-bg px-2 py-0.5 rounded text-xs font-mono">{screenType.screen_type}</code>,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (screenType) => (
        <div className="flex space-x-2 justify-end">
          <button
            onClick={() => handleEdit(screenType)}
            className="btn-secondary px-2 py-1 text-xs flex items-center space-x-1"
          >
            <Edit2 size={14} />
            <span>Edit</span>
          </button>
          <button
            onClick={() => handleDelete(screenType)}
            className="bg-bbs-accent hover:bg-bbs-accent/90 text-content-inverse px-2 py-1 rounded text-xs"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
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

      <DataGrid
        columns={columns}
        rows={screenTypes}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={(key) => {
          setSortKey(key);
          setSortDir(sortKey === key && sortDir === 'asc' ? 'desc' : 'asc');
        }}
        emptyMessage="No screen types configured. Add screen types to define terminal formats (ANSI, ASCII, etc.)."
        getRowKey={(row) => row.id.toString()}
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
