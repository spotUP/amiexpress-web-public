import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Network, Edit2, Save, X, FileCode } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';

interface Tooltype {
  key: string;
  value: string;
  commented: boolean;
  originalLine: string;
}

interface InfoFileItem {
  name: string;
  path: string;
  category: string;
  description: string;
}

const AMIXNET_FILES: InfoFileItem[] = [
  // Main Config
  { name: 'AmiXnet.info', path: 'AmiXnet.info', category: 'Main Configuration', description: 'Primary AmiXnet network settings' },

  // Network Transfers
  { name: 'InBound.info', path: 'AmiXnet/InBound.info', category: 'Network Transfers', description: 'Incoming network mail and files' },
  { name: 'OutBound.info', path: 'AmiXnet/OutBound.info', category: 'Network Transfers', description: 'Outgoing network mail and files' },

  // Node Identity
  { name: 'MyNode.info', path: 'AmiXnet/MyNode.info', category: 'Node Identity', description: 'Local node information and settings' },

  // Mail Routing
  { name: 'MailRoute.info', path: 'AmiXnet/MailRoute.info', category: 'Mail Routing', description: 'Network mail routing configuration' },

  // Conference & File Mapping
  { name: 'Confs.info', path: 'AmiXnet/Confs.info', category: 'Conference Mapping', description: 'Network conference mappings' },
  { name: 'FileBase.info', path: 'AmiXnet/FileBase.info', category: 'File Sync', description: 'Network file area mappings' },

  // System Files
  { name: 'Scripts.info', path: 'AmiXnet/Scripts.info', category: 'System', description: 'Network scripts configuration' },
  { name: 'Doors.info', path: 'AmiXnet/Doors.info', category: 'System', description: 'Network doors configuration' },
  { name: 'Utils.info', path: 'AmiXnet/Utils.info', category: 'System', description: 'Network utilities settings' },
  { name: 'Maps.info', path: 'AmiXnet/Maps.info', category: 'System', description: 'Network maps configuration' },
  { name: 'Regulations.info', path: 'AmiXnet/Regulations.info', category: 'System', description: 'Network regulations' },
  { name: 'Logs.info', path: 'AmiXnet/Logs.info', category: 'System', description: 'Network logging configuration' },
  { name: 'Pointers.info', path: 'AmiXnet/Pointers.info', category: 'System', description: 'Network pointers configuration' },
];

export function AmiXnetPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useNotification();

  // Info editor modal state
  const [isInfoEditorOpen, setIsInfoEditorOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<InfoFileItem | null>(null);
  const [tooltypes, setTooltypes] = useState<Tooltype[]>([]);
  const [infoDirty, setInfoDirty] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Get unique categories
  const categories = ['All', ...Array.from(new Set(AMIXNET_FILES.map(f => f.category)))];

  // Filter files by category
  const filteredFiles = selectedCategory === 'All'
    ? AMIXNET_FILES
    : AMIXNET_FILES.filter(f => f.category === selectedCategory);

  // Group files by category for display
  const filesByCategory = filteredFiles.reduce((acc, file) => {
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
      showSuccess('AmiXnet .info file saved successfully');
      setInfoDirty(false);
      setIsInfoEditorOpen(false);
      setEditingFile(null);
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

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center space-x-3 mb-2">
          <Network className="text-bbs-accent" size={32} />
          <h1 className="text-3xl font-bold text-bbs-accent">AmiXnet Network</h1>
        </div>
        <p className="text-bbs-muted">Configure AmiXnet BBS network settings and routing</p>
      </div>

      {/* Category Filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`px-4 py-2 rounded ${
              selectedCategory === category
                ? 'bg-bbs-accent text-bbs-background'
                : 'bg-bbs-secondary text-bbs-text hover:bg-bbs-secondary/80'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Files by Category */}
      {Object.entries(filesByCategory).map(([category, files]) => (
        <div key={category} className="mb-8">
          <h2 className="text-xl font-semibold text-bbs-text mb-4 border-b border-bbs-border pb-2">
            {category}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {files.map((file) => (
              <div key={file.path} className="card">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start space-x-3">
                    <div className="p-2 bg-bbs-primary rounded">
                      <FileCode className="text-bbs-accent" size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-bbs-text">{file.name}</h3>
                      <p className="text-xs text-bbs-muted font-mono">{file.path}</p>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-bbs-muted mb-4">{file.description}</p>

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
      ))}

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
