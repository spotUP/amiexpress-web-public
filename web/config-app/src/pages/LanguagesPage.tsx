import { useQuery } from '@tanstack/react-query';
import { Languages as LanguagesIcon } from 'lucide-react';
import { apiClient } from '../api/client';
import type { Language } from '../types';

export function LanguagesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['languages'],
    queryFn: () => apiClient.getLanguages(),
  });

  if (isLoading) {
    return <div className="text-bbs-text">Loading languages...</div>;
  }

  const languages = data?.data || [];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-bbs-accent mb-2">Languages Configuration</h1>
        <p className="text-bbs-muted">Manage multi-language support (up to 10 languages)</p>
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
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-bbs-muted">Language File:</span>
                <span className="text-bbs-text font-mono text-xs">
                  {lang.file_path || 'Not set'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-bbs-muted">Status:</span>
                <span
                  className={`${
                    lang.enabled ? 'text-green-500' : 'text-bbs-muted'
                  }`}
                >
                  {lang.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {languages.length === 0 && (
        <div className="card text-center text-bbs-muted">
          No languages configured. Add language files to support multi-language BBS operation.
        </div>
      )}
    </div>
  );
}
