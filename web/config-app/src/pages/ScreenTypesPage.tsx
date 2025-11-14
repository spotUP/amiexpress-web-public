import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Monitor, Edit2, Trash2, Plus } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';

interface ScreenType {
  id: number;
  screen_number: number;
  screen_type: string;
  screen_title: string;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export function ScreenTypesPage() {
  const queryClient = useQueryClient();
  const { showSuccess, confirm } = useNotification();

  const { data, isLoading } = useQuery({
    queryKey: ['screen-types'],
    queryFn: () => apiClient.getScreenTypes(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteScreenType(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screen-types'] });
      showSuccess('Screen type deleted successfully');
    },
  });

  const handleDelete = async (screenType: ScreenType) => {
    const confirmed = await confirm({
      title: 'Delete Screen Type',
      message: `Are you sure you want to delete screen type "${screenType.screen_title}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger'
    });
    if (confirmed) {
      deleteMutation.mutate(screenType.id);
    }
  };

  if (isLoading) {
    return <div className="text-bbs-text">Loading screen types...</div>;
  }

  const screenTypes = data?.data || [];

  return (
    <div>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-bbs-accent mb-2">Screen Types</h1>
          <p className="text-bbs-muted">Manage terminal format types (TOOLTYPE_SCREENTYPES)</p>
        </div>
        <button className="btn-primary flex items-center space-x-2">
          <Plus size={20} />
          <span>Add Screen Type</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {screenTypes.map((screenType: ScreenType) => (
          <div key={screenType.id} className="card">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-bbs-primary rounded">
                  <Monitor className="text-bbs-accent" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-bbs-text">{screenType.screen_title}</h3>
                  <p className="text-xs text-bbs-muted font-mono">{screenType.screen_type}</p>
                </div>
              </div>
              <div
                className={`px-2 py-1 rounded text-xs ${
                  screenType.enabled
                    ? 'bg-green-500/20 text-green-500'
                    : 'bg-bbs-muted/20 text-bbs-muted'
                }`}
              >
                {screenType.enabled ? 'Enabled' : 'Disabled'}
              </div>
            </div>

            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between">
                <span className="text-bbs-muted">Number:</span>
                <span className="text-bbs-text font-mono">{screenType.screen_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-bbs-muted">Type:</span>
                <span className="text-bbs-text font-mono">{screenType.screen_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-bbs-muted">Title:</span>
                <span className="text-bbs-text">{screenType.screen_title}</span>
              </div>
            </div>

            <div className="flex space-x-2">
              <button className="btn-secondary flex-1 flex items-center justify-center space-x-2">
                <Edit2 size={16} />
                <span>Edit</span>
              </button>
              <button
                onClick={() => handleDelete(screenType)}
                className="bg-bbs-accent hover:bg-bbs-accent/90 text-white font-medium py-2 px-4 rounded transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {screenTypes.length === 0 && (
        <div className="card text-center text-bbs-muted">
          No screen types configured. Add screen types to define terminal formats (ANSI, ASCII, etc.).
        </div>
      )}
    </div>
  );
}
