import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Edit2, Trash2, Plus, AlertCircle } from 'lucide-react';
import { apiClient } from '../api/client';

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

export function FileCheckersPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['file-checkers'],
    queryFn: () => apiClient.getFileCheckers(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteFileChecker(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['file-checkers'] });
      alert('File checker deleted successfully');
    },
  });

  const handleDelete = (checker: FileChecker) => {
    if (confirm(`Are you sure you want to delete file checker "${checker.checker_name}"? This will also delete all associated error patterns.`)) {
      deleteMutation.mutate(checker.id);
    }
  };

  if (isLoading) {
    return <div className="text-bbs-text">Loading file checkers...</div>;
  }

  const checkers = data?.data || [];

  return (
    <div>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-bbs-accent mb-2">File Checkers</h1>
          <p className="text-bbs-muted">Manage file validation tools (TOOLTYPE_FCHECK)</p>
        </div>
        <button className="btn-primary flex items-center space-x-2">
          <Plus size={20} />
          <span>Add File Checker</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {checkers.map((checker: FileChecker) => (
          <div key={checker.id} className="card">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-bbs-primary rounded">
                  <Shield className="text-bbs-accent" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-bbs-text">{checker.checker_name}</h3>
                  <p className="text-xs text-bbs-muted font-mono">{checker.checker_path}</p>
                </div>
              </div>
              <div
                className={`px-2 py-1 rounded text-xs ${
                  checker.enabled
                    ? 'bg-green-500/20 text-green-500'
                    : 'bg-bbs-muted/20 text-bbs-muted'
                }`}
              >
                {checker.enabled ? 'Enabled' : 'Disabled'}
              </div>
            </div>

            <div className="space-y-2 text-sm mb-4">
              {checker.options && (
                <div>
                  <span className="text-bbs-muted">Options:</span>
                  <p className="text-bbs-text font-mono text-xs mt-1">{checker.options}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {checker.stack_size && (
                  <div>
                    <span className="text-bbs-muted block">Stack Size:</span>
                    <span className="text-bbs-text font-mono">{checker.stack_size} bytes</span>
                  </div>
                )}
                {checker.priority && (
                  <div>
                    <span className="text-bbs-muted block">Priority:</span>
                    <span className="text-bbs-text font-mono">{checker.priority}</span>
                  </div>
                )}
              </div>

              {checker.script_path && (
                <div>
                  <span className="text-bbs-muted">Script:</span>
                  <p className="text-bbs-text font-mono text-xs mt-1">{checker.script_path}</p>
                </div>
              )}
            </div>

            <div className="flex space-x-2">
              <button className="btn-secondary flex-1 flex items-center justify-center space-x-2">
                <Edit2 size={16} />
                <span>Edit</span>
              </button>
              <button className="btn-secondary flex items-center justify-center space-x-2">
                <AlertCircle size={16} />
                <span>Errors</span>
              </button>
              <button
                onClick={() => handleDelete(checker)}
                className="bg-bbs-accent hover:bg-bbs-accent/90 text-white font-medium py-2 px-4 rounded transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {checkers.length === 0 && (
        <div className="card text-center text-bbs-muted">
          No file checkers configured. Add file checkers to validate uploads (virus scanning, archive testing, etc.).
        </div>
      )}

      <div className="mt-6 card bg-bbs-secondary">
        <div className="flex items-start space-x-3">
          <Shield className="text-bbs-accent mt-1" size={20} />
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
    </div>
  );
}
