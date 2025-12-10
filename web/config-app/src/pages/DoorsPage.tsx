import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { DoorOpen, Edit2, Trash2, Plus, X, FileCode } from 'lucide-react';
import { apiClient } from '../api/client';
import type { Door } from '../types';
import { useNotification } from '../contexts/NotificationContext';

interface DoorFormData {
  door_name: string;
  door_command: string;
  description: string;
  door_type: string;
  runtime_env: string;
  min_security_level: number;
  time_limit: number;
  enabled: boolean;
}

export function DoorsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { showSuccess, showError, confirm } = useNotification();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDoor, setEditingDoor] = useState<Door | null>(null);
  const [formData, setFormData] = useState<DoorFormData>({
    door_name: '',
    door_command: '',
    description: '',
    door_type: '68K',
    runtime_env: 'vamos',
    min_security_level: 0,
    time_limit: 30,
    enabled: true,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['doors'],
    queryFn: () => apiClient.getDoors(),
  });

  const createMutation = useMutation({
    mutationFn: (door: DoorFormData) => apiClient.createDoor(door),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doors'] });
      showSuccess('Door created successfully');
      setIsModalOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      showError(`Failed to create door: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<DoorFormData> }) =>
      apiClient.updateDoor(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doors'] });
      showSuccess('Door updated successfully');
      setIsModalOpen(false);
      setEditingDoor(null);
      resetForm();
    },
    onError: (error: Error) => {
      showError(`Failed to update door: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteDoor(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doors'] });
      showSuccess('Door deleted successfully');
    },
    onError: (error: Error) => {
      showError(`Failed to delete door: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      door_name: '',
      door_command: '',
      description: '',
      door_type: '68K',
      runtime_env: 'vamos',
      min_security_level: 0,
      time_limit: 30,
      enabled: true,
    });
  };

  const handleAdd = () => {
    resetForm();
    setEditingDoor(null);
    setIsModalOpen(true);
  };

  const handleEdit = (door: Door) => {
    setFormData({
      door_name: door.door_name,
      door_command: door.door_command,
      description: door.description,
      door_type: door.door_type,
      runtime_env: door.runtime_env,
      min_security_level: door.min_security_level,
      time_limit: door.time_limit,
      enabled: door.enabled,
    });
    setEditingDoor(door);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingDoor) {
      updateMutation.mutate({ id: editingDoor.id, updates: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = async (door: Door) => {
    const confirmed = await confirm({
      title: 'Delete Door',
      message: `Are you sure you want to delete door "${door.door_name}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger'
    });
    if (confirmed) {
      deleteMutation.mutate(door.id);
    }
  };

  const handleEditInfo = (door: Door) => {
    // Navigate to Info Editor page - it will show all .info files grouped by type
    // User can find their door in the "Doors" section
    navigate('/info-editor');
  };

  if (isLoading) {
    return <div className="text-bbs-text">Loading doors...</div>;
  }

  const doors = data?.data || [];

  return (
    <div>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-bbs-accent mb-2">Doors Configuration</h1>
          <p className="text-bbs-muted">Manage BBS doors and external programs</p>
        </div>
        <button onClick={handleAdd} className="btn-primary flex items-center space-x-2">
          <Plus size={20} />
          <span>Add Door</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {doors.map((door: Door) => (
          <div key={door.id} className="card">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-bbs-primary rounded">
                  <DoorOpen className="text-bbs-accent" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-bbs-text">{door.door_name}</h3>
                  <p className="text-xs text-bbs-muted font-mono">/{door.door_command}</p>
                </div>
              </div>
              <div
                className={`px-2 py-1 rounded text-xs ${
                  door.enabled
                    ? 'bg-green-500/20 text-green-500'
                    : 'bg-bbs-muted/20 text-bbs-muted'
                }`}
              >
                {door.enabled ? 'Enabled' : 'Disabled'}
              </div>
            </div>

            <p className="text-sm text-bbs-muted mb-4">{door.description}</p>

            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between">
                <span className="text-bbs-muted">Type:</span>
                <span className="text-bbs-text font-mono">{door.door_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-bbs-muted">Runtime:</span>
                <span className="text-bbs-text font-mono">{door.runtime_env}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-bbs-muted">Min Security:</span>
                <span className="text-bbs-text">{door.min_security_level}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-bbs-muted">Time Limit:</span>
                <span className="text-bbs-text">{door.time_limit} min</span>
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => handleEdit(door)}
                className="btn-secondary flex-1 flex items-center justify-center space-x-2"
              >
                <Edit2 size={16} />
                <span>Edit</span>
              </button>
              <button
                onClick={() => handleEditInfo(door)}
                className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded transition-colors"
                title="Edit .info file tooltypes"
              >
                <FileCode size={16} />
              </button>
              <button
                onClick={() => handleDelete(door)}
                className="bg-bbs-accent hover:bg-bbs-accent/90 text-white font-medium py-2 px-4 rounded transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {doors.length === 0 && (
        <div className="card text-center text-bbs-muted">
          No doors configured. Add doors to provide external programs and games.
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bbs-bg border-2 border-bbs-accent rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto m-4">
            <div className="sticky top-0 bg-bbs-bg border-b border-bbs-primary p-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-bbs-accent">
                {editingDoor ? 'Edit Door' : 'Add Door'}
              </h2>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingDoor(null);
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
                  <label htmlFor="door_name" className="label">Door Name *</label>
                  <input
                    id="door_name"
                    type="text"
                    value={formData.door_name}
                    onChange={(e) => setFormData({ ...formData, door_name: e.target.value })}
                    className="input-field w-full"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="door_command" className="label">Command *</label>
                  <input
                    id="door_command"
                    type="text"
                    value={formData.door_command}
                    onChange={(e) => setFormData({ ...formData, door_command: e.target.value })}
                    className="input-field w-full"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="description" className="label">Description</label>
                  <textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="input-field w-full"
                    rows={3}
                  />
                </div>

                <div>
                  <label htmlFor="door_type" className="label">Door Type *</label>
                  <select
                    id="door_type"
                    value={formData.door_type}
                    onChange={(e) => setFormData({ ...formData, door_type: e.target.value })}
                    className="input-field w-full"
                    required
                  >
                    <option value="68K">68K (Amiga Binary)</option>
                    <option value="JS">JavaScript</option>
                    <option value="TS">TypeScript</option>
                    <option value="EXEC">Executable</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="runtime_env" className="label">Runtime *</label>
                  <select
                    id="runtime_env"
                    value={formData.runtime_env}
                    onChange={(e) => setFormData({ ...formData, runtime_env: e.target.value })}
                    className="input-field w-full"
                    required
                  >
                    <option value="vamos">vamos (68K Emulator)</option>
                    <option value="node">Node.js</option>
                    <option value="native">Native</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="min_security_level" className="label">Min Security Level *</label>
                  <input
                    id="min_security_level"
                    type="number"
                    min="0"
                    max="255"
                    value={formData.min_security_level}
                    onChange={(e) => setFormData({ ...formData, min_security_level: parseInt(e.target.value) })}
                    className="input-field w-full"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="time_limit" className="label">Time Limit (min) *</label>
                  <input
                    id="time_limit"
                    type="number"
                    min="1"
                    value={formData.time_limit}
                    onChange={(e) => setFormData({ ...formData, time_limit: parseInt(e.target.value) })}
                    className="input-field w-full"
                    required
                  />
                </div>

                <div className="md:col-span-2">
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
              </div>

              <div className="flex justify-end space-x-4 pt-6 border-t border-bbs-primary">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingDoor(null);
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
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editingDoor ? 'Update Door' : 'Create Door'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
