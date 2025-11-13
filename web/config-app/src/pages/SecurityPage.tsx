import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Plus, ToggleLeft, ToggleRight, X, Trash2 } from 'lucide-react';
import { apiClient } from '../api/client';
import { useState } from 'react';

interface SecurityLevelAccess {
  id: number;
  security_level: number;
  acs_flag: string;
  enabled: boolean;
  description?: string;
  created_at: Date;
  updated_at: Date;
}

interface ACSFormData {
  acs_flag: string;
  description: string;
  enabled: boolean;
}

const SECURITY_LEVELS = [10, 20, 50, 100, 200, 255];

export function SecurityPage() {
  const [selectedLevel, setSelectedLevel] = useState(100);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<ACSFormData>({
    acs_flag: '',
    description: '',
    enabled: true,
  });
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['security', selectedLevel],
    queryFn: () => apiClient.getSecurityAccessForLevel(selectedLevel),
  });

  const createMutation = useMutation({
    mutationFn: (access: { security_level: number; acs_flag: string; description: string; enabled: boolean }) =>
      apiClient.createSecurityAccess(access),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security', selectedLevel] });
      alert('ACS flag created successfully');
      setIsModalOpen(false);
      setFormData({ acs_flag: '', description: '', enabled: true });
    },
    onError: (error: Error) => {
      alert(`Failed to create ACS flag: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      apiClient.updateSecurityAccess(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security', selectedLevel] });
    },
    onError: (error: Error) => {
      alert(`Failed to update ACS flag: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteSecurityAccess(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security', selectedLevel] });
      alert('ACS flag deleted successfully');
    },
    onError: (error: Error) => {
      alert(`Failed to delete ACS flag: ${error.message}`);
    },
  });

  const handleToggle = (access: SecurityLevelAccess) => {
    updateMutation.mutate({ id: access.id, enabled: !access.enabled });
  };

  const handleAdd = () => {
    setFormData({ acs_flag: '', description: '', enabled: true });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      security_level: selectedLevel,
      ...formData,
    });
  };

  const handleDelete = (access: SecurityLevelAccess) => {
    if (confirm(`Are you sure you want to delete ACS flag "${access.acs_flag}"?`)) {
      deleteMutation.mutate(access.id);
    }
  };

  if (isLoading) {
    return <div className="text-bbs-text">Loading security access flags...</div>;
  }

  const accessFlags = data?.data || [];

  return (
    <div>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-bbs-accent mb-2">Security Level Access</h1>
          <p className="text-bbs-muted">Manage ACS flags per security level (TOOLTYPE_ACCESS)</p>
        </div>
        <button onClick={handleAdd} className="btn-primary flex items-center space-x-2">
          <Plus size={20} />
          <span>Add ACS Flag</span>
        </button>
      </div>

      <div className="mb-6 flex space-x-2">
        {SECURITY_LEVELS.map((level) => (
          <button
            key={level}
            onClick={() => setSelectedLevel(level)}
            className={`px-4 py-2 rounded font-medium transition-colors ${
              selectedLevel === level
                ? 'bg-bbs-accent text-white'
                : 'bg-bbs-secondary text-bbs-text hover:bg-bbs-primary'
            }`}
          >
            Level {level}
          </button>
        ))}
      </div>

      <div className="card">
        <h2 className="text-xl font-semibold text-bbs-text mb-4">
          Security Level {selectedLevel} - {accessFlags.length} ACS Flags
        </h2>

        <div className="space-y-2">
          {accessFlags.map((access: SecurityLevelAccess) => (
            <div
              key={access.id}
              className="flex items-center justify-between p-3 bg-bbs-secondary rounded hover:bg-bbs-primary transition-colors"
            >
              <div className="flex items-center space-x-4 flex-1">
                <button
                  onClick={() => handleToggle(access)}
                  className="focus:outline-none"
                >
                  {access.enabled ? (
                    <ToggleRight className="text-green-500" size={24} />
                  ) : (
                    <ToggleLeft className="text-bbs-muted" size={24} />
                  )}
                </button>

                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-bbs-text font-mono">{access.acs_flag}</h3>
                  {access.description && (
                    <p className="text-xs text-bbs-muted mt-1">{access.description}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <div
                  className={`px-3 py-1 rounded text-xs ${
                    access.enabled
                      ? 'bg-green-500/20 text-green-500'
                      : 'bg-bbs-muted/20 text-bbs-muted'
                  }`}
                >
                  {access.enabled ? 'Enabled' : 'Disabled'}
                </div>
                <button
                  onClick={() => handleDelete(access)}
                  className="text-bbs-muted hover:text-bbs-accent transition-colors p-2"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {accessFlags.length === 0 && (
          <div className="text-center text-bbs-muted py-8">
            No ACS flags configured for security level {selectedLevel}. Add ACS flags to control user permissions.
          </div>
        )}
      </div>

      <div className="mt-6 card bg-bbs-secondary">
        <div className="flex items-start space-x-3">
          <Shield className="text-bbs-accent mt-1" size={20} />
          <div>
            <h3 className="text-sm font-semibold text-bbs-text mb-2">About Security Levels</h3>
            <p className="text-xs text-bbs-muted">
              Security levels (1-255) control user access to BBS features. ACS (Access Control System) flags
              define specific permissions for each security level. Toggle flags to enable/disable features
              for users at this security level.
            </p>
          </div>
        </div>
      </div>

      {/* Add ACS Flag Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bbs-bg border-2 border-bbs-accent rounded-lg max-w-md w-full m-4">
            <div className="border-b border-bbs-primary p-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-bbs-accent">Add ACS Flag</h2>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setFormData({ acs_flag: '', description: '', enabled: true });
                }}
                className="text-bbs-muted hover:text-bbs-text transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div>
                <label htmlFor="acs_flag" className="label">ACS Flag Name *</label>
                <input
                  id="acs_flag"
                  type="text"
                  value={formData.acs_flag}
                  onChange={(e) => setFormData({ ...formData, acs_flag: e.target.value })}
                  className="input-field w-full font-mono"
                  placeholder="e.g., ACS_SYSOP, ACS_DOWNLOAD_FILES"
                  required
                />
                <p className="text-xs text-bbs-muted mt-1">
                  Will be created for security level {selectedLevel}
                </p>
              </div>

              <div>
                <label htmlFor="description" className="label">Description</label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input-field w-full"
                  rows={3}
                  placeholder="Describe what this flag controls..."
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
                  <span className="text-bbs-text">Enabled by default</span>
                </label>
              </div>

              <div className="flex justify-end space-x-4 pt-6 border-t border-bbs-primary">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setFormData({ acs_flag: '', description: '', enabled: true });
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? 'Creating...' : 'Create ACS Flag'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
