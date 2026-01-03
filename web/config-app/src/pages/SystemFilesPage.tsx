import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileCode, Edit2, Save, X, RefreshCw, FolderOpen } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';

interface Tooltype {
  key: string;
  value: string;
  commented: boolean;
  originalLine: string;
}

interface InfoFileItem {
  path: string;
  name: string;
  size?: number;
  category: string;
}

export function SystemFilesPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useNotification();

  // Info editor modal state
  const [isInfoEditorOpen, setIsInfoEditorOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<InfoFileItem | null>(null);
  const [tooltypes, setTooltypes] = useState<Tooltype[]>([]);
  const [infoDirty, setInfoDirty] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Fetch all .info files
  const { data: filesData, isLoading, refetch } = useQuery({
    queryKey: ['system-info-files'],
    queryFn: () => apiClient.getInfoFiles(),
  });

  // Categorize files based on their location/name
  const categorizeFile = (path: string): string => {
    if (path.includes('Node')) return 'Nodes';
    if (path.includes('Conf')) return 'Conferences';
    if (path.startsWith('Commands/')) return 'Commands';
    if (path.startsWith('doors/') || path.startsWith('Doors/')) return 'Doors';
    if (path.startsWith('Protocols')) return 'Protocols';
    if (path.startsWith('Languages')) return 'Languages';
    if (path.startsWith('batch')) return 'Batch Processing';
    if (path.startsWith('FCheck')) return 'File Management';
    if (path.startsWith('bbsConfig')) return 'BBS Configuration';
    if (path.startsWith('ConfConfig')) return 'Conferences';
    if (path.startsWith('AmiXnet')) return 'AmiXnet Network';
    return 'System';
  };

  // Process and filter files
  const files: InfoFileItem[] = (filesData?.data?.files || [])
    .map((file: any) => ({
      path: file.path || file,
      name: file.name || file.split('/').pop() || file,
      size: file.size,
      category: categorizeFile(file.path || file),
    }))
    .filter((file: InfoFileItem) => {
      // Filter by search term
      if (searchTerm && !file.name.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      // Filter by category
      if (selectedCategory !== 'All' && file.category !== selectedCategory) {
        return false;
      }
      return true;
    });

  // Get unique categories
  const categories = ['All', ...Array.from(new Set(files.map(f => f.category)))].sort();

  // Group files by category for display
  const filesByCategory = files.reduce((acc, file) => {
    if (!acc[file.category]) {
      acc[file.category] = [];
    }
    acc[file.category].push(file);
    return acc;
  }, {} as Record<string, InfoFileItem[]>);

  const handleEditInfo = async (file: InfoFileItem) => {
    try {
      const response = await apiClient.getInfoFile(file.path);
      setTooltypes(response.data?.tooltypes || []);
      setEditingFile(file);
      setInfoDirty(false);
      setIsInfoEditorOpen(true);
    } catch (error) {
      showError(`Failed to load .info file: ${(error as Error).message}`);
    }
  };

  const handleInfoSave = async () => {
    if (!editingFile) return;

    try {
      await apiClient.updateInfoFile(editingFile.path, tooltypes);
      showSuccess('.info file saved successfully');
      setInfoDirty(false);
      setIsInfoEditorOpen(false);
      setEditingFile(null);
      queryClient.invalidateQueries({ queryKey: ['system-info-files'] });
    } catch (error) {
      showError(`Failed to save .info file: ${(error as Error).message}`);
    }
  };

  const handleTooltypeToggle = (index: number) => {
    const updated = [...tooltypes];
    updated[index] = { ...updated[index], commented: !updated[index].commented };
    setTooltypes(updated);
    setInfoDirty(true);
  };

  const handleTooltypeUpdate = (index: number, field: 'key' | 'value', newValue: string) => {
    const updated = [...tooltypes];
    updated[index] = { ...updated[index], [field]: newValue };
    setTooltypes(updated);
    setInfoDirty(true);
  };

  const handleTooltypeAdd = () => {
    setTooltypes([...tooltypes, { key: '', value: '', commented: false, originalLine: '' }]);
    setInfoDirty(true);
  };

  const handleTooltypeRemove = (index: number) => {
    setTooltypes(tooltypes.filter((_, i) => i !== index));
    setInfoDirty(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-bbs-text">Loading system files...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center space-x-3 mb-2">
          <FolderOpen className="text-bbs-accent" size={32} />
          <h1 className="text-3xl font-bold text-bbs-accent">System Files</h1>
        </div>
        <p className="text-bbs-muted">
          Edit .info files for system utilities, protocols, and other BBS components
        </p>
      </div>

      {/* Search and Filter Controls */}
      <div className="mb-6 space-y-4">
        {/* Search Bar */}
        <div className="flex items-center space-x-4">
          <input
            type="text"
            placeholder="Search files..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-4 py-2 bg-bbs-secondary border border-bbs-border rounded text-bbs-text"
          />
          <button
            onClick={() => refetch()}
            className="btn-secondary flex items-center space-x-2"
            title="Refresh file list"
          >
            <RefreshCw size={16} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-3 py-1 rounded text-sm ${
                selectedCategory === category
                  ? 'bg-bbs-accent text-bbs-background'
                  : 'bg-bbs-secondary text-bbs-text hover:bg-bbs-secondary/80'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* File Count */}
      <div className="mb-4 text-sm text-bbs-muted">
        Showing {files.length} file{files.length !== 1 ? 's' : ''}
      </div>

      {/* Files by Category */}
      {Object.keys(filesByCategory).length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-bbs-muted">No files found matching your criteria</p>
        </div>
      ) : (
        Object.entries(filesByCategory).map(([category, categoryFiles]) => (
          <div key={category} className="mb-8">
            <h2 className="text-xl font-semibold text-bbs-text mb-4 border-b border-bbs-border pb-2">
              {category} ({categoryFiles.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categoryFiles.map((file) => (
                <div key={file.path} className="card">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start space-x-3 flex-1 min-w-0">
                      <div className="p-2 bg-bbs-primary rounded flex-shrink-0">
                        <FileCode className="text-bbs-accent" size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-semibold text-bbs-text truncate">
                          {file.name}
                        </h3>
                        <p className="text-xs text-bbs-muted font-mono truncate" title={file.path}>
                          {file.path}
                        </p>
                        {file.size && (
                          <p className="text-xs text-bbs-muted">
                            {(file.size / 1024).toFixed(1)} KB
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEditInfo(file)}
                      className="btn-secondary flex items-center space-x-1 text-sm flex-1"
                    >
                      <Edit2 size={14} />
                      <span>Edit Tooltypes</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Info Editor Modal */}
      {isInfoEditorOpen && editingFile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-bbs-background border-2 border-bbs-border rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-bbs-border">
              <div>
                <h2 className="text-2xl font-bold text-bbs-accent">{editingFile.name}</h2>
                <p className="text-sm text-bbs-muted font-mono">{editingFile.path}</p>
              </div>
              <button
                onClick={() => {
                  setIsInfoEditorOpen(false);
                  setEditingFile(null);
                }}
                className="text-bbs-muted hover:text-bbs-text"
              >
                <X size={24} />
              </button>
            </div>

            {/* Modal Body - Tooltypes Editor */}
            <div className="flex-1 overflow-y-auto p-6">
              {tooltypes.length === 0 ? (
                <div className="text-center py-8 text-bbs-muted">
                  <p>No tooltypes defined. Click "Add Tooltype" to create one.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tooltypes.map((tooltype, index) => (
                    <div key={index} className="flex items-start space-x-2 bg-bbs-secondary p-3 rounded">
                      <button
                        onClick={() => handleTooltypeToggle(index)}
                        className={`mt-1 ${tooltype.commented ? 'text-bbs-muted' : 'text-bbs-accent'}`}
                        title={tooltype.commented ? 'Commented (click to enable)' : 'Active (click to comment)'}
                      >
                        {tooltype.commented ? '!' : '*'}
                      </button>
                      <div className="flex-1 space-y-2">
                        <input
                          type="text"
                          value={tooltype.key}
                          onChange={(e) => handleTooltypeUpdate(index, 'key', e.target.value)}
                          placeholder="KEY"
                          className={`w-full px-3 py-1 bg-bbs-primary border border-bbs-border rounded text-sm font-mono ${
                            tooltype.commented ? 'text-bbs-muted' : 'text-bbs-text'
                          }`}
                        />
                        <input
                          type="text"
                          value={tooltype.value}
                          onChange={(e) => handleTooltypeUpdate(index, 'value', e.target.value)}
                          placeholder="Value"
                          className={`w-full px-3 py-1 bg-bbs-primary border border-bbs-border rounded text-sm ${
                            tooltype.commented ? 'text-bbs-muted' : 'text-bbs-text'
                          }`}
                        />
                      </div>
                      <button
                        onClick={() => handleTooltypeRemove(index)}
                        className="text-red-500 hover:text-red-400 mt-1"
                        title="Remove tooltype"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={handleTooltypeAdd}
                className="mt-4 btn-secondary w-full"
              >
                Add Tooltype
              </button>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-bbs-border flex items-center justify-between">
              <div>
                {infoDirty && (
                  <span className="text-yellow-500 text-sm">* Unsaved changes</span>
                )}
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setIsInfoEditorOpen(false);
                    setEditingFile(null);
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleInfoSave}
                  disabled={!infoDirty}
                  className="btn-primary flex items-center space-x-2"
                >
                  <Save size={16} />
                  <span>Save Changes</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
