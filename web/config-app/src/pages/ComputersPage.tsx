import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Monitor, Edit2, Trash2, Plus, ToggleLeft, ToggleRight } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';

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

  if (isLoading) {
    return <div className="text-bbs-text">Loading computer types...</div>;
  }

  const computers = data?.data || [];

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <button onClick={handleAdd} className="btn-primary flex items-center space-x-2">
          <Plus size={20} />
          <span>Add Computer Type</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {computers.map((computer: ComputerType) => (
          <div key={computer.id} className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-bbs-primary rounded">
                <Monitor className="text-accent" size={20} />
              </div>
              <button
                onClick={() => handleToggle(computer)}
                className={`flex items-center space-x-1 px-2 py-1 rounded text-xs ${
                  computer.enabled
                    ? 'bg-status-ok/20 text-status-ok'
                    : 'bg-bbs-muted/20 text-bbs-muted'
                }`}
                title="Toggle availability"
              >
                {computer.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                <span>{computer.enabled ? 'Enabled' : 'Disabled'}</span>
              </button>
            </div>

            <h3 className="text-lg font-semibold text-bbs-text mb-2">{computer.computer_name}</h3>

            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between">
                <span className="text-bbs-muted">Number:</span>
                <span className="text-bbs-text font-mono">{computer.computer_number}</span>
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => handleEdit(computer)}
                className="btn-secondary flex-1 flex items-center justify-center space-x-2"
              >
                <Edit2 size={16} />
                <span>Edit</span>
              </button>
              <button
                onClick={() => handleDelete(computer)}
                className="bg-bbs-accent hover:bg-bbs-accent/90 text-content-inverse font-medium py-2 px-4 rounded transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {computers.length === 0 && (
        <div className="card text-center text-bbs-muted">
          No computer types configured. Add computer types for user selection during signup.
        </div>
      )}

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
