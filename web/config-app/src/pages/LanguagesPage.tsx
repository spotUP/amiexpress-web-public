import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { apiClient } from '../api/client';
import type { Language } from '../types';
import { useNotification } from '../contexts/NotificationContext';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';

/** Stable fallback: a fresh array each render invalidates the row model. */
const EMPTY_LANGUAGES: Language[] = [];

export function LanguagesPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError, confirm } = useNotification();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Language | null>(null);
  const [formData, setFormData] = useState<Omit<Language, 'id' | 'created_at' | 'updated_at'>>({
    language_number: 1,
    title: '',
    language_code: '',
    file_path: '',
    enabled: true,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['languages'],
    queryFn: () => apiClient.getLanguages(),
  });

  const createMutation = useMutation({
    mutationFn: (payload: Omit<Language, 'id' | 'created_at' | 'updated_at'>) => apiClient.createLanguage(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['languages'] });
      showSuccess('Language added');
      setIsModalOpen(false);
      setEditing(null);
    },
    onError: (error: Error) => showError(`Failed to add language: ${error.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<Language> }) => apiClient.updateLanguage(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['languages'] });
      showSuccess('Language updated');
      setIsModalOpen(false);
      setEditing(null);
    },
    onError: (error: Error) => showError(`Failed to update language: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteLanguage(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['languages'] });
      showSuccess('Language removed');
    },
  });

  const handleAdd = () => {
    const nextNumber = (data?.data?.reduce((max: number, lang: Language) => Math.max(max, lang.language_number), 0) || 0) + 1;
    setFormData({
      language_number: nextNumber,
      title: '',
      language_code: '',
      file_path: '',
      enabled: true,
    });
    setEditing(null);
    setIsModalOpen(true);
  };

  const handleEdit = (lang: Language) => {
    setFormData({
      language_number: lang.language_number,
      title: lang.title,
      language_code: lang.language_code,
      file_path: lang.file_path,
      enabled: lang.enabled,
    });
    setEditing(lang);
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

  const handleToggle = (lang: Language) => {
    updateMutation.mutate({ id: lang.id, updates: { enabled: !lang.enabled } });
  };

  const handleDelete = async (lang: Language) => {
    const confirmed = await confirm({
      title: 'Delete Language',
      message: `Delete language ${lang.title}?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger'
    });
    if (confirmed) {
      deleteMutation.mutate(lang.id);
    }
  };

  const languages: Language[] = data?.data ?? EMPTY_LANGUAGES;

  const columns: DataTableColumn<Language>[] = [
    {
      id: 'enabled',
      header: 'Status',
      value: (lang) => (lang.enabled ? 1 : 0),
      width: '9rem',
      cell: (lang) => (
        <button
          type="button"
          onClick={() => handleToggle(lang)}
          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors ${
            lang.enabled
              ? 'bg-status-ok/20 text-status-ok hover:bg-status-ok/30'
              : 'bg-surface-3 text-content-muted hover:bg-surface-2'
          }`}
        >
          {lang.enabled ? <ToggleRight size={12} aria-hidden="true" /> : <ToggleLeft size={12} aria-hidden="true" />}
          {lang.enabled ? 'Enabled' : 'Disabled'}
        </button>
      ),
    },
    {
      id: 'language_number',
      header: 'Number',
      value: (lang) => lang.language_number,
      align: 'right',
      mono: true,
      width: '6rem',
    },
    {
      id: 'title',
      header: 'Title',
      value: (lang) => lang.title,
      cell: (lang) => <span className="text-content-primary">{lang.title}</span>,
    },
    {
      id: 'language_code',
      header: 'Code',
      value: (lang) => lang.language_code,
      mono: true,
      width: '7rem',
    },
    {
      id: 'file_path',
      header: 'File path',
      value: (lang) => lang.file_path ?? '',
      mono: true,
      cell: (lang) => (
        <span className="block max-w-md truncate text-content-secondary">{lang.file_path || '-'}</span>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <button onClick={handleAdd} className="btn-primary flex items-center space-x-2">
          <Plus size={20} />
          <span>Add Language</span>
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={languages}
        getRowId={(lang) => String(lang.id)}
        initialSort={[{ id: 'language_number', desc: false }]}
        isLoading={isLoading}
        emptyMessage="No languages configured. Language files are what let callers pick a language at login."
        rowActions={(lang) => (
          <>
            <button
              type="button"
              onClick={() => handleEdit(lang)}
              aria-label={`Edit ${lang.title}`}
              className="rounded p-1 text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
            >
              <Edit2 size={14} />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(lang)}
              aria-label={`Delete ${lang.title}`}
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
              {editing ? 'Edit Language' : 'Add Language'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="language_number" className="label">Number</label>
                  <input
                    id="language_number"
                    type="number"
                    value={formData.language_number}
                    onChange={(e) => setFormData({ ...formData, language_number: Number(e.target.value) })}
                    className="input-field w-full"
                    min={1}
                    max={10}
                  />
                </div>
                <div>
                  <label htmlFor="language_code" className="label">Code</label>
                  <input
                    id="language_code"
                    type="text"
                    value={formData.language_code}
                    onChange={(e) => setFormData({ ...formData, language_code: e.target.value })}
                    className="input-field w-full"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="title" className="label">Title</label>
                <input
                  id="title"
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="input-field w-full"
                  required
                />
              </div>

              <div>
                <label htmlFor="file_path" className="label">Language File Path</label>
                <input
                  id="file_path"
                  type="text"
                  value={formData.file_path}
                  onChange={(e) => setFormData({ ...formData, file_path: e.target.value })}
                  className="input-field w-full"
                  placeholder="Languages/english.lng"
                />
              </div>

              <div className="flex items-center space-x-3">
                <input
                  id="enabled"
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="enabled" className="text-sm text-bbs-text">Enabled</label>
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
