import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Edit2, Trash2, Save, X, Plus } from 'lucide-react';
import { apiClient } from '../api/client';
import type { NodeConfig } from '../types';
import { useNotification } from '../contexts/NotificationContext';
import { DataGrid, type DataGridColumn } from '../components/DataGrid';

// Stable empty array reference to prevent infinite re-renders
const EMPTY_NODES: NodeConfig[] = [];

interface NodeRow {
  nodeNumber: number;
  config: NodeConfig | null;
}

export function NodesPage() {
  const queryClient = useQueryClient();
  const { showSuccess, confirm } = useNotification();
  const [editingNode, setEditingNode] = useState<number | null>(null);
  const [formData, setFormData] = useState<Partial<NodeConfig>>({});

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

  // Use stable reference for empty fallback to prevent infinite re-renders
  const nodes = data?.data ?? EMPTY_NODES;
  const maxNodes = useMemo(
    () => Math.max(1, Math.min(255, systemConfig?.data?.max_nodes || 8)),
    [systemConfig?.data?.max_nodes]
  );

  const nodeMap = useMemo(() => {
    const map = new Map<number, NodeConfig>();
    nodes.forEach((n: NodeConfig) => map.set(n.node_number, n));
    return map;
  }, [nodes]);

  const rows: NodeRow[] = useMemo(
    () =>
      Array.from({ length: maxNodes }, (_, i) => {
        const nodeNumber = i + 1;
        return { nodeNumber, config: nodeMap.get(nodeNumber) || null };
      }),
    [maxNodes, nodeMap]
  );

  if (isLoading) {
    return <div className="text-bbs-text">Loading node configurations...</div>;
  }

  const columns: DataGridColumn<NodeRow>[] = [
    {
      key: 'node',
      header: 'Node',
      render: (row) => <span className="font-semibold text-bbs-text">#{row.nodeNumber}</span>,
    },
    {
      key: 'start',
      header: 'Start Command',
      render: (row) =>
        editingNode === row.nodeNumber ? (
          <input
            type="text"
            value={formData.node_start || ''}
            onChange={(e) => setFormData({ ...formData, node_start: e.target.value })}
            className="input-field w-full"
          />
        ) : (
          <span className="text-bbs-text font-mono">
            {row.config?.node_start || 'Not configured'}
          </span>
        ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (row) =>
        editingNode === row.nodeNumber ? (
          <input
            type="number"
            value={formData.priority ?? row.config?.priority ?? 0}
            onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
            min="-1"
            max="20"
            className="input-field w-full"
          />
        ) : (
          <span className="text-bbs-text">{row.config?.priority ?? '—'}</span>
        ),
    },
    {
      key: 'telnet',
      header: 'Telnet',
      render: (row) =>
        editingNode === row.nodeNumber ? (
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={formData.telnet ?? row.config?.telnet ?? false}
              onChange={(e) => setFormData({ ...formData, telnet: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm text-bbs-text">Enabled</span>
          </label>
        ) : (
          <span className="text-bbs-text">{row.config?.telnet ? 'Enabled' : 'Disabled'}</span>
        ),
    },
    {
      key: 'ftp',
      header: 'FTP',
      render: (row) =>
        editingNode === row.nodeNumber ? (
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={formData.ftp ?? row.config?.ftp ?? false}
              onChange={(e) => setFormData({ ...formData, ftp: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm text-bbs-text">Enabled</span>
          </label>
        ) : (
          <span className="text-bbs-text">{row.config?.ftp ? 'Enabled' : 'Disabled'}</span>
        ),
    },
    {
      key: 'capitol',
      header: 'Capitol Files',
      render: (row) =>
        editingNode === row.nodeNumber ? (
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={formData.capitol_files ?? row.config?.capitol_files ?? false}
              onChange={(e) => setFormData({ ...formData, capitol_files: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm text-bbs-text">Enabled</span>
          </label>
        ) : (
          <span className="text-bbs-text">{row.config?.capitol_files ? 'Yes' : 'No'}</span>
        ),
    },
    {
      key: 'colors',
      header: 'Chat Colors',
      render: (row) =>
        editingNode === row.nodeNumber ? (
          <div className="flex items-center space-x-2">
            <input
              type="number"
              min="30"
              max="37"
              value={formData.sysop_chat_color ?? row.config?.sysop_chat_color ?? 32}
              onChange={(e) =>
                setFormData({ ...formData, sysop_chat_color: parseInt(e.target.value) })
              }
              className="input-field w-20"
            />
            <span className="text-bbs-muted">/</span>
            <input
              type="number"
              min="30"
              max="37"
              value={formData.user_chat_color ?? row.config?.user_chat_color ?? 36}
              onChange={(e) =>
                setFormData({ ...formData, user_chat_color: parseInt(e.target.value) })
              }
              className="input-field w-20"
            />
          </div>
        ) : (
          <span className="text-bbs-text">
            Sysop {row.config?.sysop_chat_color ?? '—'} / User {row.config?.user_chat_color ?? '—'}
          </span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) =>
        row.config ? (
          <span className="text-bbs-muted">
            Created {new Date(row.config.created_at).toLocaleDateString()}
          </span>
        ) : (
          <span className="text-bbs-muted">Not configured</span>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => {
        if (!row.config) {
          return (
            <button
              onClick={() => createMutation.mutate(row.nodeNumber)}
              className="btn-primary flex items-center space-x-2"
              disabled={createMutation.isPending}
            >
              <Plus size={16} />
              <span>Create</span>
            </button>
          );
        }

        if (editingNode === row.nodeNumber) {
          return (
            <div className="flex space-x-2">
              <button onClick={handleSave} className="btn-primary flex items-center space-x-2">
                <Save size={16} />
                <span>Save</span>
              </button>
              <button onClick={handleCancel} className="btn-secondary flex items-center space-x-2">
                <X size={16} />
                <span>Cancel</span>
              </button>
            </div>
          );
        }

        return (
          <div className="flex space-x-2">
            <button
              onClick={() => handleEdit(row.config!)}
              className="btn-secondary flex items-center space-x-2"
            >
              <Edit2 size={16} />
              <span>Edit</span>
            </button>
            <button
              onClick={() => handleDelete(row.nodeNumber)}
              className="bg-bbs-accent hover:bg-bbs-accent/90 text-white font-medium py-2 px-4 rounded transition-colors flex items-center space-x-2"
            >
              <Trash2 size={16} />
              <span>Delete</span>
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-bbs-accent mb-2">Node Configuration</h1>
          <p className="text-bbs-muted">
            Configure individual BBS nodes (1-{maxNodes}). Missing nodes can be created inline.
          </p>
        </div>
      </div>

      <DataGrid
        columns={columns}
        rows={rows}
        emptyMessage="No node entries found."
        getRowKey={(row) => row.nodeNumber}
      />
    </div>
  );
}
