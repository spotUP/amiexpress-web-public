import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Edit2, Trash2, X, Plus } from 'lucide-react';
import { useAutosave } from '../hooks/useAutosave';
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
  const { showSuccess, showError, confirm } = useNotification();
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

  const deleteMutation = useMutation({
    mutationFn: (nodeNumber: number) => apiClient.deleteNodeConfig(nodeNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
      showSuccess('Node configuration deleted successfully');
    },
    onError: (error: Error) => {
      showError(`Failed to delete node: ${error.message}`);
    },
  });

  const createMutation = useMutation({
    mutationFn: (nodeNumber: number) => apiClient.createNodeConfig({ node_number: nodeNumber - 1 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
      showSuccess('Node created');
    },
    onError: (error: Error) => {
      showError(`Failed to create node: ${error.message}`);
    },
  });

  const handleEdit = (node: NodeConfig) => {
    setEditingNode(node.node_number + 1); // Store as 1-based for UI matching
    setFormData(node);
  };

  /**
   * A row writes itself. No Save button - "i want no save buttons at all in
   * the admin ui everything should auto save" (sysop, 2026-09-14).
   *
   * Keyed on the NODE NUMBER, so editing two rows in quick succession cannot
   * land one node's settings on another: a pending write belongs to the row
   * it was typed into.
   *
   * It deliberately does NOT close the row on success - that is what the
   * update mutation does, and doing it per keystroke would snatch the row
   * shut under the sysop mid-edit.
   */
  const autosave = useAutosave<Partial<NodeConfig>>({
    save: async (updates, node) => {
      if (!node) return;
      await apiClient.updateNodeConfig(Number(node), updates);
      queryClient.invalidateQueries({ queryKey: ['nodes'] });
    },
    label: (_u, node) => `Node ${node} saved`,
  });

  /** The one way a field changes: set it AND schedule the write. */
  const editField = (next: Partial<NodeConfig>) => {
    setFormData(next);
    if (editingNode !== null) autosave.schedule(next, String(editingNode));
  };

  /** Leave the row, writing anything still pending rather than dropping it. */
  const handleDone = async () => {
    if (editingNode !== null) await autosave.flush(String(editingNode));
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
        const nodeNumber = i + 1; // UI Display
        return { nodeNumber, config: nodeMap.get(i) || null }; // Look up by 0-based i
      }),
    [maxNodes, nodeMap]
  );

  if (isLoading) {
    return <div className="text-content-primary">Loading node configurations...</div>;
  }

  const columns: DataGridColumn<NodeRow>[] = [
    {
      key: 'node',
      header: 'Node',
      render: (row) => <span className="font-semibold text-content-primary">#{row.nodeNumber}</span>,
    },
    {
      key: 'start',
      header: 'Start Command',
      render: (row) =>
        editingNode === row.nodeNumber ? (
          <input
            type="text"
            value={formData.node_start || ''}
            onChange={(e) => editField({ ...formData, node_start: e.target.value })}
            className="input-field w-full"
          />
        ) : (
          <span className="text-content-primary font-mono">
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
            onChange={(e) => editField({ ...formData, priority: parseInt(e.target.value, 10) || 0 })}
            min="-1"
            max="20"
            className="input-field w-full"
          />
        ) : (
          <span className="text-content-primary">{row.config?.priority ?? '—'}</span>
        ),
    },
    {
      key: 'screens',
      header: 'Screens Directory',
      render: (row) =>
        editingNode === row.nodeNumber ? (
          <input
            type="text"
            value={formData.screens ?? row.config?.screens ?? ''}
            onChange={(e) => editField({ ...formData, screens: e.target.value })}
            placeholder={`Node${row.nodeNumber}/`}
            className="input-field w-full font-mono"
          />
        ) : (
          <span className="text-content-primary font-mono">
            {row.config?.screens || `Node${row.nodeNumber}/ (default)`}
          </span>
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
              onChange={(e) => editField({ ...formData, telnet: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm text-content-primary">Enabled</span>
          </label>
        ) : (
          <span className="text-content-primary">{row.config?.telnet ? 'Enabled' : 'Disabled'}</span>
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
              onChange={(e) => editField({ ...formData, ftp: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm text-content-primary">Enabled</span>
          </label>
        ) : (
          <span className="text-content-primary">{row.config?.ftp ? 'Enabled' : 'Disabled'}</span>
        ),
    },
    {
      key: 'log_host',
      // LOG_HOST, express.e:16048 - write the caller's address into the CallersLog.
      header: 'Log Host',
      render: (row) =>
        editingNode === row.nodeNumber ? (
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={formData.log_host ?? row.config?.log_host ?? false}
              onChange={(e) => editField({ ...formData, log_host: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm text-content-primary">Logged</span>
          </label>
        ) : (
          <span className="text-content-primary">{row.config?.log_host ? 'Logged' : 'Not logged'}</span>
        ),
    },
    {
      key: 'show_password_fails',
      // SHOWPWFAIL, express.e:30030 - log what was typed instead of (xxxx).
      header: 'Show Password Fails',
      render: (row) =>
        editingNode === row.nodeNumber ? (
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={formData.show_password_fails ?? row.config?.show_password_fails ?? false}
              onChange={(e) => editField({ ...formData, show_password_fails: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm text-content-primary">Shown</span>
          </label>
        ) : (
          <span className="text-content-primary">{row.config?.show_password_fails ? 'Shown' : 'Masked'}</span>
        ),
    },
    {
      key: 'usernumber_login',
      // USERNUMBER_LOGIN, express.e:29598 - a caller may type his slot number.
      header: 'User Number Logon',
      render: (row) =>
        editingNode === row.nodeNumber ? (
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={formData.usernumber_login ?? row.config?.usernumber_login ?? false}
              onChange={(e) => editField({ ...formData, usernumber_login: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm text-content-primary">Allowed</span>
          </label>
        ) : (
          <span className="text-content-primary">{row.config?.usernumber_login ? 'Allowed' : 'Name only'}</span>
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
              onChange={(e) => editField({ ...formData, capitol_files: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm text-content-primary">Enabled</span>
          </label>
        ) : (
          <span className="text-content-primary">{row.config?.capitol_files ? 'Yes' : 'No'}</span>
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
                editField({ ...formData, sysop_chat_color: parseInt(e.target.value, 10) || 0 })
              }
              className="input-field w-20"
            />
            <span className="text-content-secondary">/</span>
            <input
              type="number"
              min="30"
              max="37"
              value={formData.user_chat_color ?? row.config?.user_chat_color ?? 36}
              onChange={(e) =>
                editField({ ...formData, user_chat_color: parseInt(e.target.value, 10) || 0 })
              }
              className="input-field w-20"
            />
          </div>
        ) : (
          <span className="text-content-primary">
            Sysop {row.config?.sysop_chat_color ?? '—'} / User {row.config?.user_chat_color ?? '—'}
          </span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) =>
        row.config ? (
          <span className="text-content-secondary">
            Created {new Date(row.config.created_at).toLocaleDateString()}
          </span>
        ) : (
          <span className="text-content-secondary">Not configured</span>
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
            <div className="flex items-center space-x-2">
              {/* No Save button: a field is written once the typing stops. */}
              <span className="text-xs text-content-secondary">
                {autosave.saving ? 'Saving...' : 'Saves itself'}
              </span>
              <button onClick={() => { void handleDone(); }} className="btn-secondary flex items-center space-x-2">
                <X size={16} />
                <span>Done</span>
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
              className="bg-accent hover:bg-accent/90 text-content-inverse font-medium py-2 px-4 rounded transition-colors flex items-center space-x-2"
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

      <DataGrid
        columns={columns}
        rows={rows}
        emptyMessage="No node entries found."
        getRowKey={(row) => row.nodeNumber}
      />
    </div>
  );
}
