import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Star } from 'lucide-react';
import { apiClient } from '../api/client';
import type { Protocol } from '../types';
import { useNotification } from '../contexts/NotificationContext';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';

/** A stable fallback: a fresh array each render invalidates the row model. */
const EMPTY_PROTOCOLS: Protocol[] = [];

export function ProtocolsPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError, confirm } = useNotification();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Protocol | null>(null);
  const [formData, setFormData] = useState<Omit<Protocol, 'id' | 'created_at' | 'updated_at'>>({
    protocol_name: '',
    protocol_code: '',
    command: '',
    upload_command: '',
    download_command: '',
    batch_upload: false,
    batch_download: false,
    bidirectional: false,
    enabled: true,
    is_default: false,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['protocols'],
    queryFn: () => apiClient.getProtocols(),
  });

  const createMutation = useMutation({
    mutationFn: (payload: Omit<Protocol, 'id' | 'created_at' | 'updated_at'>) => apiClient.createProtocol(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protocols'] });
      showSuccess('Protocol created');
      setIsModalOpen(false);
      setEditing(null);
    },
    onError: (error: Error) => showError(`Failed to create protocol: ${error.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<Protocol> }) => apiClient.updateProtocol(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protocols'] });
      showSuccess('Protocol updated');
      setIsModalOpen(false);
      setEditing(null);
    },
    onError: (error: Error) => showError(`Failed to update protocol: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteProtocol(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protocols'] });
      showSuccess('Protocol deleted');
    },
  });

  const handleAdd = () => {
    setFormData({
      protocol_name: '',
      protocol_code: '',
      command: '',
      upload_command: '',
      download_command: '',
      batch_upload: false,
      batch_download: false,
      bidirectional: false,
      enabled: true,
      is_default: false,
    });
    setEditing(null);
    setIsModalOpen(true);
  };

  const handleEdit = (protocol: Protocol) => {
    setFormData({
      protocol_name: protocol.protocol_name,
      protocol_code: protocol.protocol_code,
      command: protocol.command || '',
      upload_command: protocol.upload_command || '',
      download_command: protocol.download_command || '',
      batch_upload: protocol.batch_upload,
      batch_download: protocol.batch_download,
      bidirectional: protocol.bidirectional,
      enabled: protocol.enabled,
      is_default: protocol.is_default,
    });
    setEditing(protocol);
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

  const handleToggle = (protocol: Protocol) => {
    updateMutation.mutate({ id: protocol.id, updates: { enabled: !protocol.enabled } });
  };

  const handleDelete = async (protocol: Protocol) => {
    const confirmed = await confirm({
      title: 'Delete Protocol',
      message: `Delete protocol ${protocol.protocol_name}?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger'
    });
    if (confirmed) {
      deleteMutation.mutate(protocol.id);
    }
  };

  const handleMakeDefault = async (protocol: Protocol, protocols: Protocol[]) => {
    try {
      await apiClient.updateProtocol(protocol.id, { is_default: true, enabled: true });
      const others = protocols.filter((p) => p.id !== protocol.id && p.is_default);
      if (others.length) {
        await Promise.all(others.map((p) => apiClient.updateProtocol(p.id, { is_default: false })));
      }
      queryClient.invalidateQueries({ queryKey: ['protocols'] });
      showSuccess(`${protocol.protocol_name} set as default`);
    } catch (error: any) {
      showError(error.message || 'Failed to update default protocol');
    }
  };

  const protocols: Protocol[] = data?.data || EMPTY_PROTOCOLS;

  const columns: DataTableColumn<Protocol>[] = [
    {
      id: 'enabled',
      header: 'Status',
      value: (protocol) => (protocol.enabled ? 1 : 0),
      width: '9rem',
      cell: (protocol) => (
        <button
          type="button"
          onClick={() => handleToggle(protocol)}
          aria-label={`${protocol.enabled ? 'Disable' : 'Enable'} ${protocol.protocol_name}`}
          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors ${
            protocol.enabled
              ? 'bg-status-ok/20 text-status-ok hover:bg-status-ok/30'
              : 'bg-surface-3 text-content-muted hover:bg-surface-2'
          }`}
        >
          {protocol.enabled ? <ToggleRight size={12} aria-hidden="true" /> : <ToggleLeft size={12} aria-hidden="true" />}
          {protocol.enabled ? 'Enabled' : 'Disabled'}
        </button>
      ),
    },
    {
      id: 'protocol_name',
      header: 'Name',
      value: (protocol) => protocol.protocol_name,
      cell: (protocol) => (
        <span className="flex items-center gap-2">
          <span className="text-content-primary">{protocol.protocol_name}</span>
          {protocol.is_default && (
            <span className="inline-flex items-center gap-1 rounded bg-accent/20 px-1.5 py-0.5 text-xs text-accent">
              <Star size={10} aria-hidden="true" />
              Default
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'protocol_code',
      header: 'Code',
      value: (protocol) => protocol.protocol_code,
      mono: true,
      width: '7rem',
    },
    {
      id: 'command',
      header: 'Base command',
      value: (protocol) => protocol.command ?? '',
      mono: true,
      cell: (protocol) => (
        <span className="block max-w-md truncate text-content-secondary">{protocol.command || '-'}</span>
      ),
    },
    {
      id: 'features',
      header: 'Features',
      cell: (protocol) => (
        <span className="flex flex-wrap gap-1">
          {protocol.batch_upload && (
            <span className="rounded bg-accent/20 px-1.5 py-0.5 text-xs text-accent">Batch up</span>
          )}
          {protocol.batch_download && (
            <span className="rounded bg-accent/20 px-1.5 py-0.5 text-xs text-accent">Batch down</span>
          )}
          {protocol.bidirectional && (
            <span className="rounded bg-status-info/20 px-1.5 py-0.5 text-xs text-status-info">Bi-directional</span>
          )}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <button onClick={handleAdd} className="btn-primary flex items-center space-x-2">
          <Plus size={20} />
          <span>Add Protocol</span>
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={protocols}
        getRowId={(protocol) => String(protocol.id)}
        initialSort={[{ id: 'protocol_name', desc: false }]}
        isLoading={isLoading}
        emptyMessage="No protocols configured. Add transfer protocols like ZMODEM, YMODEM, XMODEM, or Punter."
        rowActions={(protocol) => (
          <>
            <button
              type="button"
              onClick={() => handleEdit(protocol)}
              aria-label={`Edit ${protocol.protocol_name}`}
              className="rounded p-1 text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
            >
              <Edit2 size={14} />
            </button>
            <button
              type="button"
              onClick={() => handleMakeDefault(protocol, protocols)}
              aria-label={`Make ${protocol.protocol_name} the default protocol`}
              className="rounded p-1 text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
            >
              <Star size={14} />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(protocol)}
              aria-label={`Delete ${protocol.protocol_name}`}
              className="rounded p-1 text-content-secondary transition-colors hover:bg-status-danger/20 hover:text-status-danger"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      />

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bbs-surface border border-bbs-primary rounded-lg shadow-xl w-full max-w-2xl p-6">
            <h2 className="text-xl font-semibold text-bbs-text mb-4">
              {editing ? 'Edit Protocol' : 'Add Protocol'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="protocol_name" className="label">Name</label>
                  <input
                    id="protocol_name"
                    type="text"
                    value={formData.protocol_name}
                    onChange={(e) => setFormData({ ...formData, protocol_name: e.target.value })}
                    className="input-field w-full"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="protocol_code" className="label">Code</label>
                  <input
                    id="protocol_code"
                    type="text"
                    value={formData.protocol_code}
                    onChange={(e) => setFormData({ ...formData, protocol_code: e.target.value })}
                    className="input-field w-full"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="command" className="label">Base Command</label>
                <input
                  id="command"
                  type="text"
                  value={formData.command || ''}
                  onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                  className="input-field w-full"
                  placeholder="sz %s"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="upload_command" className="label">Upload Command</label>
                  <input
                    id="upload_command"
                    type="text"
                    value={formData.upload_command || ''}
                    onChange={(e) => setFormData({ ...formData, upload_command: e.target.value })}
                    className="input-field w-full"
                    placeholder="rz"
                  />
                </div>
                <div>
                  <label htmlFor="download_command" className="label">Download Command</label>
                  <input
                    id="download_command"
                    type="text"
                    value={formData.download_command || ''}
                    onChange={(e) => setFormData({ ...formData, download_command: e.target.value })}
                    className="input-field w-full"
                    placeholder="sz %s"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center space-x-2">
                  <input
                    id="batch_upload"
                    type="checkbox"
                    checked={formData.batch_upload}
                    onChange={(e) => setFormData({ ...formData, batch_upload: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label htmlFor="batch_upload" className="text-sm text-bbs-text">Batch Upload</label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    id="batch_download"
                    type="checkbox"
                    checked={formData.batch_download}
                    onChange={(e) => setFormData({ ...formData, batch_download: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label htmlFor="batch_download" className="text-sm text-bbs-text">Batch Download</label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    id="bidirectional"
                    type="checkbox"
                    checked={formData.bidirectional}
                    onChange={(e) => setFormData({ ...formData, bidirectional: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label htmlFor="bidirectional" className="text-sm text-bbs-text">Bi-directional</label>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <input
                    id="enabled"
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label htmlFor="enabled" className="text-sm text-bbs-text">Enabled</label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    id="is_default"
                    type="checkbox"
                    checked={formData.is_default}
                    onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label htmlFor="is_default" className="text-sm text-bbs-text">Default</label>
                </div>
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
            <p className="text-xs text-bbs-muted mt-3">
              Supported protocols: ZMODEM (batch), YMODEM (batch), XMODEM (checksum/CRC/1K), Punter (C64/C128), WebSocket (browser).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
