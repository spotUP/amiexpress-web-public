import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Edit2, Trash2, Plus, AlertCircle, ToggleLeft, ToggleRight } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';

interface FileChecker {
  id: number;
  checker_name: string;
  checker_path: string;
  options?: string;
  stack_size?: number;
  priority?: number;
  script_path?: string;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

interface FileCheckerError {
  id: number;
  file_checker_id: number;
  error_number: number;
  error_pattern: string;
}

/** A stable fallback: a fresh array each render invalidates the row model. */
const EMPTY_CHECKERS: FileChecker[] = [];

export function FileCheckersPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError, confirm } = useNotification();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<FileChecker | null>(null);
  const [formData, setFormData] = useState<Omit<FileChecker, 'id' | 'created_at' | 'updated_at'>>({
    checker_name: '',
    checker_path: '',
    options: '',
    stack_size: 0,
    priority: 0,
    script_path: '',
    enabled: true,
  });
  const [errorsChecker, setErrorsChecker] = useState<FileChecker | null>(null);
  const [newError, setNewError] = useState({ error_number: 1, error_pattern: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['file-checkers'],
    queryFn: () => apiClient.getFileCheckers(),
  });

  const errorsQuery = useQuery({
    queryKey: ['file-checker-errors', errorsChecker?.id],
    queryFn: () => apiClient.getFileCheckerErrors(errorsChecker!.id),
    enabled: !!errorsChecker,
  });

  const createMutation = useMutation({
    mutationFn: (payload: Omit<FileChecker, 'id' | 'created_at' | 'updated_at'>) =>
      apiClient.createFileChecker(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-checkers'] });
      showSuccess('File checker created successfully');
      setIsModalOpen(false);
      setEditing(null);
    },
    onError: (error: Error) => showError(`Failed to create file checker: ${error.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<FileChecker> }) =>
      apiClient.updateFileChecker(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-checkers'] });
      showSuccess('File checker updated successfully');
      setIsModalOpen(false);
      setEditing(null);
    },
    onError: (error: Error) => showError(`Failed to update file checker: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteFileChecker(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-checkers'] });
      showSuccess('File checker deleted successfully');
    },
  });

  const createErrorMutation = useMutation({
    mutationFn: (payload: { checkerId: number; error_number: number; error_pattern: string }) =>
      apiClient.createFileCheckerError(payload.checkerId, {
        error_number: payload.error_number,
        error_pattern: payload.error_pattern,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-checker-errors', errorsChecker?.id] });
      showSuccess('Error pattern added');
      setNewError((prev) => ({ error_number: prev.error_number + 1, error_pattern: '' }));
    },
    onError: (error: Error) => showError(`Failed to add error pattern: ${error.message}`),
  });

  const deleteErrorMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteFileCheckerError(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-checker-errors', errorsChecker?.id] });
      showSuccess('Error pattern removed');
    },
    onError: (error: Error) => showError(`Failed to delete error pattern: ${error.message}`),
  });

  const handleDelete = async (checker: FileChecker) => {
    const confirmed = await confirm({
      title: 'Delete File Checker',
      message: `Are you sure you want to delete file checker "${checker.checker_name}"? This will also delete all associated error patterns.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger'
    });
    if (confirmed) {
      deleteMutation.mutate(checker.id);
    }
  };

  const handleAdd = () => {
    setFormData({
      checker_name: '',
      checker_path: '',
      options: '',
      stack_size: 0,
      priority: 0,
      script_path: '',
      enabled: true,
    });
    setEditing(null);
    setIsModalOpen(true);
  };

  const handleEdit = (checker: FileChecker) => {
    setFormData({
      checker_name: checker.checker_name,
      checker_path: checker.checker_path,
      options: checker.options || '',
      stack_size: checker.stack_size || 0,
      priority: checker.priority || 0,
      script_path: checker.script_path || '',
      enabled: checker.enabled,
    });
    setEditing(checker);
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

  const handleToggle = (checker: FileChecker) => {
    updateMutation.mutate({ id: checker.id, updates: { enabled: !checker.enabled } });
  };

  const handleOpenErrors = (checker: FileChecker) => {
    setErrorsChecker(checker);
    setNewError({ error_number: 1, error_pattern: '' });
  };

  const handleAddError = () => {
    if (!errorsChecker) return;
    if (!newError.error_pattern.trim()) {
      showError('Error pattern cannot be empty');
      return;
    }
    createErrorMutation.mutate({
      checkerId: errorsChecker.id,
      error_number: newError.error_number,
      error_pattern: newError.error_pattern,
    });
  };

  const checkers = data?.data || EMPTY_CHECKERS;
  const errors = errorsQuery.data?.data || [];

  const columns: DataTableColumn<FileChecker>[] = [
    {
      id: 'enabled',
      header: 'Status',
      value: (checker) => (checker.enabled ? 1 : 0),
      width: '9rem',
      cell: (checker) => (
        <button
          type="button"
          onClick={() => handleToggle(checker)}
          aria-label={`${checker.enabled ? 'Disable' : 'Enable'} ${checker.checker_name}`}
          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors ${
            checker.enabled
              ? 'bg-status-ok/20 text-status-ok hover:bg-status-ok/30'
              : 'bg-surface-3 text-content-muted hover:bg-surface-2'
          }`}
        >
          {checker.enabled ? <ToggleRight size={12} aria-hidden="true" /> : <ToggleLeft size={12} aria-hidden="true" />}
          {checker.enabled ? 'Enabled' : 'Disabled'}
        </button>
      ),
    },
    {
      id: 'checker_name',
      header: 'Name',
      value: (checker) => checker.checker_name,
      cell: (checker) => <span className="text-content-primary">{checker.checker_name}</span>,
    },
    {
      id: 'checker_path',
      header: 'Path',
      value: (checker) => checker.checker_path ?? '',
      mono: true,
      cell: (checker) => (
        <span className="block max-w-sm truncate text-content-secondary">{checker.checker_path || '-'}</span>
      ),
    },
    {
      id: 'options',
      header: 'Options',
      value: (checker) => checker.options ?? '',
      mono: true,
      cell: (checker) => (
        <span className="block max-w-xs truncate text-content-secondary">{checker.options || '-'}</span>
      ),
    },
    {
      id: 'stack_size',
      header: 'Stack',
      value: (checker) => checker.stack_size ?? 0,
      align: 'right',
      mono: true,
      width: '7rem',
      cell: (checker) => (
        <span>{checker.stack_size === undefined || checker.stack_size === null ? '-' : checker.stack_size}</span>
      ),
    },
    {
      id: 'priority',
      header: 'Priority',
      value: (checker) => checker.priority ?? 0,
      align: 'right',
      mono: true,
      width: '6rem',
      cell: (checker) => (
        <span>{checker.priority === undefined || checker.priority === null ? '-' : checker.priority}</span>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <button onClick={handleAdd} className="btn-primary flex items-center space-x-2">
          <Plus size={20} />
          <span>Add File Checker</span>
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={checkers}
        getRowId={(checker) => String(checker.id)}
        initialSort={[{ id: 'checker_name', desc: false }]}
        isLoading={isLoading}
        emptyMessage="No file checkers configured. Add file checkers to validate uploads (virus scanning, archive testing, etc.)."
        rowActions={(checker) => (
          <>
            <button
              type="button"
              onClick={() => handleEdit(checker)}
              aria-label={`Edit ${checker.checker_name}`}
              className="rounded p-1 text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
            >
              <Edit2 size={14} />
            </button>
            <button
              type="button"
              onClick={() => handleOpenErrors(checker)}
              aria-label={`Errors for ${checker.checker_name}`}
              className="rounded p-1 text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
            >
              <AlertCircle size={14} />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(checker)}
              aria-label={`Delete ${checker.checker_name}`}
              className="rounded p-1 text-content-secondary transition-colors hover:bg-status-danger/20 hover:text-status-danger"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      />

      <div className="mt-6 card bg-bbs-secondary">
        <div className="flex items-start space-x-3">
          <Shield className="text-accent mt-1" size={20} />
          <div>
            <h3 className="text-sm font-semibold text-bbs-text mb-2">About File Checkers</h3>
            <p className="text-xs text-bbs-muted">
              File checkers are external programs that validate uploaded files. Common uses include virus scanning
              (ClamAV), archive integrity checking (unzip -t), and custom validation scripts. Configure error patterns
              to detect and handle specific failure conditions.
            </p>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bbs-surface border border-bbs-primary rounded-lg shadow-xl w-full max-w-2xl p-6">
            <h2 className="text-xl font-semibold text-bbs-text mb-4">
              {editing ? 'Edit File Checker' : 'Add File Checker'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="checker_name" className="label">Name</label>
                  <input
                    id="checker_name"
                    type="text"
                    value={formData.checker_name}
                    onChange={(e) => setFormData({ ...formData, checker_name: e.target.value })}
                    className="input-field w-full"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="checker_path" className="label">Executable Path</label>
                  <input
                    id="checker_path"
                    type="text"
                    value={formData.checker_path}
                    onChange={(e) => setFormData({ ...formData, checker_path: e.target.value })}
                    className="input-field w-full"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="options" className="label">Options</label>
                  <input
                    id="options"
                    type="text"
                    value={formData.options || ''}
                    onChange={(e) => setFormData({ ...formData, options: e.target.value })}
                    className="input-field w-full"
                  />
                </div>
                <div>
                  <label htmlFor="script_path" className="label">Post-Check Script</label>
                  <input
                    id="script_path"
                    type="text"
                    value={formData.script_path || ''}
                    onChange={(e) => setFormData({ ...formData, script_path: e.target.value })}
                    className="input-field w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor="stack_size" className="label">Stack Size (bytes)</label>
                  <input
                    id="stack_size"
                    type="number"
                    value={formData.stack_size || 0}
                    onChange={(e) => setFormData({ ...formData, stack_size: Number(e.target.value) })}
                    className="input-field w-full"
                  />
                </div>
                <div>
                  <label htmlFor="priority" className="label">Priority</label>
                  <input
                    id="priority"
                    type="number"
                    value={formData.priority || 0}
                    onChange={(e) => setFormData({ ...formData, priority: Number(e.target.value) })}
                    className="input-field w-full"
                  />
                </div>
                <div className="flex items-center space-x-3 pt-6">
                  <input
                    id="checker_enabled"
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label htmlFor="checker_enabled" className="text-sm text-bbs-text">Enabled</label>
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
          </div>
        </div>
      )}

      {errorsChecker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bbs-surface border border-bbs-primary rounded-lg shadow-xl w-full max-w-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-bbs-text">Error Patterns</h2>
                <p className="text-sm text-bbs-muted">{errorsChecker.checker_name}</p>
              </div>
              <button
                className="btn-secondary"
                onClick={() => {
                  setErrorsChecker(null);
                  setNewError({ error_number: 1, error_pattern: '' });
                }}
              >
                Close
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
              {errors.length === 0 && (
                <div className="text-bbs-muted text-sm">No error patterns configured.</div>
              )}
              {errors.map((err: FileCheckerError) => (
                <div key={err.id} className="flex items-center justify-between border border-bbs-primary rounded px-2 py-1">
                  <div>
                    <span className="text-xs text-bbs-muted mr-2">#{err.error_number}</span>
                    <span className="text-bbs-text text-sm font-mono">{err.error_pattern}</span>
                  </div>
                  <button
                    onClick={() => deleteErrorMutation.mutate(err.id)}
                    className="btn-secondary px-2 py-1 text-xs"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="border-t border-bbs-primary pt-3">
              <div className="grid grid-cols-5 gap-3 items-end">
                <div className="col-span-1">
                  <label htmlFor="error_number" className="label text-xs">Number</label>
                  <input
                    id="error_number"
                    type="number"
                    value={newError.error_number}
                    onChange={(e) => setNewError({ ...newError, error_number: Number(e.target.value) })}
                    className="input-field w-full"
                    min={1}
                  />
                </div>
                <div className="col-span-3">
                  <label htmlFor="error_pattern" className="label text-xs">Pattern</label>
                  <input
                    id="error_pattern"
                    type="text"
                    value={newError.error_pattern}
                    onChange={(e) => setNewError({ ...newError, error_pattern: e.target.value })}
                    className="input-field w-full"
                  />
                </div>
                <div className="col-span-1 flex justify-end">
                  <button
                    onClick={handleAddError}
                    className="btn-primary w-full"
                    disabled={createErrorMutation.isPending}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
