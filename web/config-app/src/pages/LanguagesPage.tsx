import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Languages as LanguagesIcon, Plus, Edit2, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { apiClient } from '../api/client';
import type { Language } from '../types';
import { useNotification } from '../contexts/NotificationContext';

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

  if (isLoading) {
    return <div className="text-bbs-text">Loading languages...</div>;
  }

  const languages = data?.data || [];

  return (
    <div>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-bbs-accent mb-2">Languages Configuration</h1>
          <p className="text-bbs-muted">Manage multi-language support (up to 10 languages)</p>
        </div>
        <button onClick={handleAdd} className="btn-primary flex items-center space-x-2">
          <Plus size={20} />
          <span>Add Language</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {languages.map((lang: Language) => (
          <div key={lang.id} className="card">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-bbs-primary rounded">
                  <LanguagesIcon className="text-bbs-accent" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-bbs-text">{lang.title}</h3>
                  <p className="text-xs text-bbs-muted font-mono">
                    {lang.language_code} (Lang #{lang.language_number})
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleToggle(lang)}
                className={`flex items-center space-x-1 px-2 py-1 rounded text-xs ${
                  lang.enabled ? 'bg-green-500/20 text-green-500' : 'bg-bbs-muted/20 text-bbs-muted'
                }`}
                title="Toggle availability"
              >
                {lang.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                <span>{lang.enabled ? 'Enabled' : 'Disabled'}</span>
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-bbs-muted">Language File:</span>
                <span className="text-bbs-text font-mono text-xs">{lang.file_path || 'Not set'}</span>
              </div>
            </div>

            <div className="flex space-x-2 mt-4">
              <button
                onClick={() => handleEdit(lang)}
                className="btn-secondary flex-1 flex items-center justify-center space-x-2"
              >
                <Edit2 size={16} />
                <span>Edit</span>
              </button>
              <button
                onClick={() => handleDelete(lang)}
                className="bg-bbs-accent hover:bg-bbs-accent/90 text-white font-medium py-2 px-4 rounded transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {languages.length === 0 && (
        <div className="card text-center text-bbs-muted">
          No languages configured. Add language files to support multi-language BBS operation.
        </div>
      )}

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
