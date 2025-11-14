import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Monitor, Edit2, Trash2, Plus } from 'lucide-react';
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
  const { showSuccess, confirm } = useNotification();

  const { data, isLoading } = useQuery({
    queryKey: ['computers'],
    queryFn: () => apiClient.getComputerTypes(),
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

  if (isLoading) {
    return <div className="text-bbs-text">Loading computer types...</div>;
  }

  const computers = data?.data || [];

  return (
    <div>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-bbs-accent mb-2">Computer Types</h1>
          <p className="text-bbs-muted">Manage computer type selections (TOOLTYPE_COMPUTERLIST)</p>
        </div>
        <button className="btn-primary flex items-center space-x-2">
          <Plus size={20} />
          <span>Add Computer Type</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {computers.map((computer: ComputerType) => (
          <div key={computer.id} className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-bbs-primary rounded">
                <Monitor className="text-bbs-accent" size={20} />
              </div>
              <div
                className={`px-2 py-1 rounded text-xs ${
                  computer.enabled
                    ? 'bg-green-500/20 text-green-500'
                    : 'bg-bbs-muted/20 text-bbs-muted'
                }`}
              >
                {computer.enabled ? 'Enabled' : 'Disabled'}
              </div>
            </div>

            <h3 className="text-lg font-semibold text-bbs-text mb-2">{computer.computer_name}</h3>

            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between">
                <span className="text-bbs-muted">Number:</span>
                <span className="text-bbs-text font-mono">{computer.computer_number}</span>
              </div>
            </div>

            <div className="flex space-x-2">
              <button className="btn-secondary flex-1 flex items-center justify-center space-x-2">
                <Edit2 size={16} />
                <span>Edit</span>
              </button>
              <button
                onClick={() => handleDelete(computer)}
                className="bg-bbs-accent hover:bg-bbs-accent/90 text-white font-medium py-2 px-4 rounded transition-colors"
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
    </div>
  );
}
