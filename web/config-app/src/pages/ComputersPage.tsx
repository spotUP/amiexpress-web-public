import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit2, Trash2, Plus, ToggleLeft, ToggleRight } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';

/** A stable fallback: a fresh array each render invalidates the row model. */
const EMPTY_COMPUTERS: ComputerType[] = [];

interface ComputerType {
  id: number;
  computer_number: number;
  computer_name: string;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export function ComputersPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError, confirm } = useNotification();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<ComputerType | null>(null);
  const [formData, setFormData] = useState<Omit<ComputerType, 'id' | 'created_at' | 'updated_at'>>({
    computer_number: 1,
    computer_name: '',
    enabled: true,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['computers'],
    queryFn: () => apiClient.getComputerTypes(),
  });

  const createMutation = useMutation({
    mutationFn: (payload: Omit<ComputerType, 'id' | 'created_at' | 'updated_at'>) =>
      apiClient.createComputerType(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['computers'] });
      showSuccess('Computer type created successfully');
      setIsModalOpen(false);
      setEditing(null);
    },
    onError: (error: Error) => showError(`Failed to create computer type: ${error.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<ComputerType> }) =>
      apiClient.updateComputerType(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['computers'] });
      showSuccess('Computer type updated successfully');
      setIsModalOpen(false);
      setEditing(null);
    },
    onError: (error: Error) => showError(`Failed to update computer type: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteComputerType(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['computers'] });
      showSuccess('Computer type deleted successfully');
    },
  });

  const handleDelete = async (computer: ComputerType) => {
    const confirmed = await confirm({
      title: 'Delete Computer Type',
      message: `Are you sure you want to delete computer type "${computer.computer_name}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger'
    });
    if (confirmed) {
      deleteMutation.mutate(computer.id);
    }
  };

  const handleAdd = () => {
    const nextNumber = (data?.data?.reduce((max: number, c: ComputerType) => Math.max(max, c.computer_number), 0) || 0) + 1;
    setFormData({
      computer_number: nextNumber,
      computer_name: '',
      enabled: true
    });
    setEditing(null);
    setIsModalOpen(true);
  };

  const handleEdit = (computer: ComputerType) => {
    setFormData({
      computer_number: computer.computer_number,
      computer_name: computer.computer_name,
      enabled: computer.enabled
    });
    setEditing(computer);
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

  const handleToggle = (computer: ComputerType) => {
    updateMutation.mutate({ id: computer.id, updates: { enabled: !computer.enabled } });
  };

  const computers = data?.data || EMPTY_COMPUTERS;

  const columns: DataTableColumn<ComputerType>[] = [
    {
      id: 'enabled',
      header: 'Status',
      value: (computer) => (computer.enabled ? 1 : 0),
      width: '9rem',
      cell: (computer) => (
        <button
          type="button"
          onClick={() => handleToggle(computer)}
          aria-label={`${computer.enabled ? 'Disable' : 'Enable'} ${computer.computer_name}`}
          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors ${
            computer.enabled
              ? 'bg-status-ok/20 text-status-ok hover:bg-status-ok/30'
              : 'bg-surface-3 text-content-muted hover:bg-surface-2'
          }`}
        >
          {computer.enabled ? <ToggleRight size={12} aria-hidden="true" /> : <ToggleLeft size={12} aria-hidden="true" />}
          {computer.enabled ? 'Enabled' : 'Disabled'}
        </button>
      ),
    },
    {
      id: 'computer_number',
      header: 'Number',
      value: (computer) => computer.computer_number,
      align: 'right',
      mono: true,
      width: '6rem',
    },
    {
      id: 'computer_name',
      header: 'Name',
      value: (computer) => computer.computer_name,
      cell: (computer) => <span className="text-content-primary">{computer.computer_name}</span>,
    },
  ];

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <button onClick={handleAdd} className="btn-primary flex items-center space-x-2">
          <Plus size={20} />
          <span>Add Computer Type</span>
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={computers}
        getRowId={(computer) => String(computer.id)}
        initialSort={[{ id: 'computer_number', desc: false }]}
        isLoading={isLoading}
        emptyMessage="No computer types configured. Add computer types for user selection during signup."
        rowActions={(computer) => (
          <>
            <button
              type="button"
              onClick={() => handleEdit(computer)}
              aria-label={`Edit ${computer.computer_name}`}
              className="rounded p-1 text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
            >
              <Edit2 size={14} />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(computer)}
              aria-label={`Delete ${computer.computer_name}`}
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
              {editing ? 'Edit Computer Type' : 'Add Computer Type'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="computer_name" className="label">Name</label>
                <input
                  id="computer_name"
                  type="text"
                  value={formData.computer_name}
                  onChange={(e) => setFormData({ ...formData, computer_name: e.target.value })}
                  className="input-field w-full"
                  required
                />
              </div>
              <div>
                <label htmlFor="computer_number" className="label">Number</label>
                <input
                  id="computer_number"
                  type="number"
                  value={formData.computer_number}
                  onChange={(e) => setFormData({ ...formData, computer_number: Number(e.target.value) })}
                  className="input-field w-full"
                  min={1}
                />
              </div>
              <div className="flex items-center space-x-3">
                <input
                  id="computer_enabled"
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="computer_enabled" className="text-sm text-bbs-text">
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
