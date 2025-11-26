import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Edit2, Trash2, Save, X, Plus } from 'lucide-react';
import { apiClient } from '../api/client';
import type { NodeConfig } from '../types';
import { useNotification } from '../contexts/NotificationContext';

export function NodesPage() {
  const queryClient = useQueryClient();
  const { showSuccess, confirm } = useNotification();
  const [editingNode, setEditingNode] = useState<number | null>(null);
  const [formData, setFormData] = useState<Partial<NodeConfig>>({});
  const [newNodeNumber, setNewNodeNumber] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['nodes'],
    queryFn: () => apiClient.getNodeConfigs(),
  });
  const { data: systemConfig } = useQuery({
    queryKey: ['systemConfig'],
    queryFn: () => apiClient.getSystemConfig(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ nodeNumber, updates }: { nodeNumber: number; updates: Partial<NodeConfig> }) =>
      apiClient.updateNodeConfig(nodeNumber, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
      setEditingNode(null);
      showSuccess('Node configuration updated successfully');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (nodeNumber: number) => apiClient.deleteNodeConfig(nodeNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
      showSuccess('Node configuration deleted successfully');
    },
  });

  const createMutation = useMutation({
    mutationFn: (nodeNumber: number) => apiClient.createNodeConfig({ node_number: nodeNumber }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
      showSuccess('Node created');
      setNewNodeNumber(null);
    },
  });

  const handleEdit = (node: NodeConfig) => {
    setEditingNode(node.node_number);
    setFormData(node);
  };

  const handleSave = () => {
    if (editingNode !== null) {
      updateMutation.mutate({ nodeNumber: editingNode, updates: formData });
    }
  };

  const handleCancel = () => {
    setEditingNode(null);
    setFormData({});
  };

  const handleDelete = async (nodeNumber: number) => {
    const confirmed = await confirm({
      title: 'Delete Node Configuration?',
      message: `Are you sure you want to delete node ${nodeNumber} configuration?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger',
    });
    if (confirmed) {
      deleteMutation.mutate(nodeNumber);
    }
  };

  if (isLoading) {
    return <div className="text-bbs-text">Loading node configurations...</div>;
  }

  const nodes = data?.data || [];
  const existingNumbers = new Set<number>(nodes.map((n: NodeConfig) => n.node_number));
  const maxNodes = Math.max(1, Math.min(255, systemConfig?.data?.max_nodes || 8));
  const missingNodes = Array.from({ length: maxNodes }, (_, i) => i + 1).filter(
    (n) => !existingNumbers.has(n)
  );

  return (
    <div>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-bbs-accent mb-2">Node Configuration</h1>
          <p className="text-bbs-muted">Configure individual BBS nodes (1-8)</p>
        </div>
        <div className="flex items-center space-x-2">
          <select
            value={newNodeNumber ?? ''}
            onChange={(e) => setNewNodeNumber(parseInt(e.target.value) || null)}
            className="input-field"
            disabled={missingNodes.length === 0}
          >
            <option value="">Select node</option>
            {missingNodes.map((n) => (
              <option key={n} value={n}>
                Add Node {n}
              </option>
            ))}
          </select>
          <button
            onClick={() => newNodeNumber && createMutation.mutate(newNodeNumber)}
            disabled={!newNodeNumber}
            className="btn-primary flex items-center space-x-2 disabled:opacity-50"
          >
            <Plus size={16} />
            <span>Add Node</span>
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {nodes.map((node: NodeConfig) => (
          <div key={node.id} className="card">
            {editingNode === node.node_number ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-bbs-text">
                    Edit Node {node.node_number}
                  </h3>
                  <div className="flex space-x-2">
                    <button
                      onClick={handleSave}
                      className="btn-primary flex items-center space-x-2"
                    >
                      <Save size={16} />
                      <span>Save</span>
                    </button>
                    <button
                      onClick={handleCancel}
                      className="btn-secondary flex items-center space-x-2"
                    >
                      <X size={16} />
                      <span>Cancel</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Node Start Command</label>
                    <input
                      type="text"
                      value={formData.node_start || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, node_start: e.target.value })
                      }
                      className="input-field w-full"
                    />
                  </div>

                  <div>
                    <label className="label">Priority (-1 to 20)</label>
                    <input
                      type="number"
                      value={formData.priority || 0}
                      onChange={(e) =>
                        setFormData({ ...formData, priority: parseInt(e.target.value) })
                      }
                      min="-1"
                      max="20"
                      className="input-field w-full"
                    />
                  </div>

                  <div>
                    <label className="label">Sysop Chat Color (30-37)</label>
                    <input
                      type="number"
                      value={formData.sysop_chat_color || 32}
                      onChange={(e) =>
                        setFormData({ ...formData, sysop_chat_color: parseInt(e.target.value) })
                      }
                      min="30"
                      max="37"
                      className="input-field w-full"
                    />
                  </div>

                  <div>
                    <label className="label">User Chat Color (30-37)</label>
                    <input
                      type="number"
                      value={formData.user_chat_color || 36}
                      onChange={(e) =>
                        setFormData({ ...formData, user_chat_color: parseInt(e.target.value) })
                      }
                      min="30"
                      max="37"
                      className="input-field w-full"
                    />
                  </div>

                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={formData.capitol_files || false}
                      onChange={(e) =>
                        setFormData({ ...formData, capitol_files: e.target.checked })
                      }
                      className="w-4 h-4"
                    />
                    <label className="text-sm text-bbs-text">Capitol Files</label>
                  </div>

                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={formData.telnet || false}
                      onChange={(e) =>
                        setFormData({ ...formData, telnet: e.target.checked })
                      }
                      className="w-4 h-4"
                    />
                    <label className="text-sm text-bbs-text">Telnet Enabled</label>
                  </div>

                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={formData.ftp || false}
                      onChange={(e) =>
                        setFormData({ ...formData, ftp: e.target.checked })
                      }
                      className="w-4 h-4"
                    />
                    <label className="text-sm text-bbs-text">FTP Enabled</label>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-bbs-text">
                      Node {node.node_number}
                    </h3>
                    <p className="text-sm text-bbs-muted">
                      Priority: {node.priority} | Created: {new Date(node.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(node)}
                      className="btn-secondary flex items-center space-x-2"
                    >
                      <Edit2 size={16} />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => handleDelete(node.node_number)}
                      className="bg-bbs-accent hover:bg-bbs-accent/90 text-white font-medium py-2 px-4 rounded transition-colors flex items-center space-x-2"
                    >
                      <Trash2 size={16} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-bbs-muted">Start Command:</span>
                    <p className="text-bbs-text font-mono">{node.node_start || 'None'}</p>
                  </div>
                  <div>
                    <span className="text-bbs-muted">Telnet:</span>
                    <p className="text-bbs-text">{node.telnet ? 'Enabled' : 'Disabled'}</p>
                  </div>
                  <div>
                    <span className="text-bbs-muted">FTP:</span>
                    <p className="text-bbs-text">{node.ftp ? 'Enabled' : 'Disabled'}</p>
                  </div>
                  <div>
                    <span className="text-bbs-muted">Capitol Files:</span>
                    <p className="text-bbs-text">{node.capitol_files ? 'Yes' : 'No'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {nodes.length === 0 && (
          <div className="card text-center text-bbs-muted">
            No node configurations found. Nodes are created automatically on first BBS startup.
          </div>
        )}
      </div>
    </div>
  );
}
