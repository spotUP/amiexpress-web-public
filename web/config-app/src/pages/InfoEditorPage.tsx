import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, RefreshCw, Plus, Trash2, Power, PowerOff, Filter, FileCode } from 'lucide-react';
import { apiClient } from '../api/client';
import { useNotification } from '../contexts/NotificationContext';

interface Tooltype {
  key: string;
  value: string;
  commented: boolean;
  originalLine: string;
}

interface InfoFileMetadata {
  path: string;
  relativePath: string;
  basename: string;
  type: 'command' | 'door' | 'conference' | 'unknown';
  tooltypes: Tooltype[];
}

export function InfoEditorPage() {
  const { showSuccess, showError } = useNotification();
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [tooltypes, setTooltypes] = useState<Tooltype[]>([]);
  const [dirty, setDirty] = useState(false);
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Fetch all .info files
  const filesQuery = useQuery({
    queryKey: ['info-files'],
    queryFn: () => apiClient.getInfoFiles(),
  });

  // Fetch specific file details
  const fileQuery = useQuery({
    queryKey: ['info-file', selectedFile],
    queryFn: () => apiClient.getInfoFile(selectedFile),
    enabled: !!selectedFile,
  });

  // Load tooltypes when file data changes
  const handleFileSelect = async (relativePath: string) => {
    if (dirty) {
      if (!confirm('You have unsaved changes. Continue?')) {
        return;
      }
    }
    setSelectedFile(relativePath);
    setDirty(false);
    try {
      const res = await apiClient.getInfoFile(relativePath);
      setTooltypes(res.data?.tooltypes || []);
    } catch (err: any) {
      showError(`Failed to load ${relativePath}: ${err.message}`);
    }
  };

  const handleSave = async () => {
    if (!selectedFile) return;
    try {
      const res = await apiClient.updateInfoFile(selectedFile, tooltypes);
      showSuccess(res.data?.message || 'Tooltypes saved');
      if (res.data?.note) {
        showError(res.data.note);
      }
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['info-file', selectedFile] });
    } catch (err: any) {
      showError(`Failed to save: ${err.message}`);
    }
  };

  const handleToggle = async (key: string) => {
    if (!selectedFile) return;
    try {
      const res = await apiClient.toggleTooltypeComment(selectedFile, key);
      showSuccess(res.data?.message || `Toggled ${key}`);
      // Update local state
      setTooltypes((prev) =>
        prev.map((tt) =>
          tt.key === key ? { ...tt, commented: !tt.commented } : tt
        )
      );
      setDirty(true);
      queryClient.invalidateQueries({ queryKey: ['info-file', selectedFile] });
    } catch (err: any) {
      showError(`Failed to toggle ${key}: ${err.message}`);
    }
  };

  const handleAdd = () => {
    const newKey = prompt('Enter tooltype key (e.g., DOORUSE, STACK, ACCESS):');
    if (!newKey) return;

    const newValue = prompt('Enter value:');
    if (newValue === null) return;

    const upperKey = newKey.toUpperCase();
    if (tooltypes.some((tt) => tt.key === upperKey)) {
      showError(`Tooltype ${upperKey} already exists`);
      return;
    }

    setTooltypes((prev) => [
      ...prev,
      {
        key: upperKey,
        value: newValue,
        commented: false,
        originalLine: `${upperKey}=${newValue}`,
      },
    ]);
    setDirty(true);
    showSuccess(`Added ${upperKey}`);
  };

  const handleRemove = (key: string) => {
    if (!confirm(`Remove ${key}?`)) return;
    setTooltypes((prev) => prev.filter((tt) => tt.key !== key));
    setDirty(true);
    showSuccess(`Removed ${key}`);
  };

  const handleUpdateValue = (key: string, newValue: string) => {
    setTooltypes((prev) =>
      prev.map((tt) =>
        tt.key === key ? { ...tt, value: newValue } : tt
      )
    );
    setDirty(true);
  };

  const files = filesQuery.data?.data?.files || [];
  const filteredFiles = files.filter((f: InfoFileMetadata) => {
    if (typeFilter !== 'all' && f.type !== typeFilter) return false;
    if (filter && !f.basename.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const groupedFiles = {
    command: filteredFiles.filter((f: InfoFileMetadata) => f.type === 'command'),
    door: filteredFiles.filter((f: InfoFileMetadata) => f.type === 'door'),
    conference: filteredFiles.filter((f: InfoFileMetadata) => f.type === 'conference'),
    unknown: filteredFiles.filter((f: InfoFileMetadata) => f.type === 'unknown'),
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-bbs-accent mb-1">Info File Editor</h1>
        <p className="text-bbs-muted">
          Edit Amiga .info file tooltypes for commands, doors, and conferences
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* File Browser */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold text-bbs-text">Files</h2>
            <button
              onClick={() => filesQuery.refetch()}
              className="btn-secondary flex items-center space-x-1"
            >
              <RefreshCw size={14} />
              <span>Refresh</span>
            </button>
          </div>

          <div className="mb-3 space-y-2">
            <div className="flex items-center space-x-2">
              <Filter size={16} className="text-bbs-muted" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter files"
                className="input-field flex-1"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="input-field w-full"
            >
              <option value="all">All Types</option>
              <option value="command">Commands</option>
              <option value="door">Doors</option>
              <option value="conference">Conferences</option>
            </select>
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {['command', 'door', 'conference'].map((type) => {
              const typeFiles = groupedFiles[type as keyof typeof groupedFiles];
              if (!typeFiles.length) return null;

              return (
                <div key={type}>
                  <div className="text-xs text-bbs-muted uppercase font-semibold mb-1">
                    {type}s ({typeFiles.length})
                  </div>
                  {typeFiles.map((file: InfoFileMetadata) => (
                    <button
                      key={file.relativePath}
                      onClick={() => handleFileSelect(file.relativePath)}
                      className={`w-full text-left px-3 py-2 rounded text-sm ${
                        selectedFile === file.relativePath
                          ? 'bg-bbs-accent text-white'
                          : 'hover:bg-bbs-border text-bbs-text'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <FileCode size={14} />
                        <span className="truncate">{file.basename}</span>
                      </div>
                      <div className="text-xs text-bbs-muted truncate">
                        {file.relativePath}
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
            {filteredFiles.length === 0 && (
              <div className="text-center text-bbs-muted py-8">
                No files found
              </div>
            )}
          </div>
        </div>

        {/* Tooltype Editor */}
        <div className="lg:col-span-2 card">
          {!selectedFile ? (
            <div className="text-center text-bbs-muted py-12">
              <FileCode size={48} className="mx-auto mb-4 opacity-50" />
              <p>Select a .info file to edit tooltypes</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-bbs-text">
                    {fileQuery.data?.data?.basename || 'Loading...'}
                  </h2>
                  <p className="text-sm text-bbs-muted">{selectedFile}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleAdd}
                    className="btn-secondary flex items-center space-x-2"
                  >
                    <Plus size={16} />
                    <span>Add</span>
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!dirty}
                    className="btn-primary flex items-center space-x-2 disabled:opacity-50"
                  >
                    <Save size={16} />
                    <span>Save</span>
                  </button>
                </div>
              </div>

              {tooltypes.length === 0 ? (
                <div className="text-center text-bbs-muted py-8">
                  No tooltypes found
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-bbs-muted px-2 pb-2 border-b border-bbs-border">
                    <div className="col-span-1 text-center">Status</div>
                    <div className="col-span-3">Key</div>
                    <div className="col-span-6">Value</div>
                    <div className="col-span-2 text-center">Actions</div>
                  </div>

                  {tooltypes.map((tt) => (
                    <div
                      key={tt.key}
                      className={`grid grid-cols-12 gap-2 items-center px-2 py-2 rounded ${
                        tt.commented ? 'bg-bbs-border opacity-60' : 'bg-bbs-surface'
                      }`}
                    >
                      <div className="col-span-1 flex justify-center" title={tt.commented ? "Disabled" : "Enabled"}>
                        {tt.commented ? (
                          <PowerOff size={16} className="text-red-400" />
                        ) : (
                          <Power size={16} className="text-green-400" />
                        )}
                      </div>
                      <div className="col-span-3">
                        <input
                          type="text"
                          value={tt.key}
                          disabled
                          className="input-field w-full font-mono text-sm bg-bbs-border"
                        />
                      </div>
                      <div className="col-span-6">
                        <input
                          type="text"
                          value={tt.value}
                          onChange={(e) => handleUpdateValue(tt.key, e.target.value)}
                          className={`input-field w-full font-mono text-sm ${
                            tt.commented ? 'text-bbs-muted' : 'text-bbs-text'
                          }`}
                        />
                      </div>
                      <div className="col-span-2 flex justify-center space-x-1">
                        <button
                          onClick={() => handleToggle(tt.key)}
                          className="btn-secondary p-2"
                          title={tt.commented ? 'Enable' : 'Disable'}
                        >
                          {tt.commented ? (
                            <Power size={14} />
                          ) : (
                            <PowerOff size={14} />
                          )}
                        </button>
                        <button
                          onClick={() => handleRemove(tt.key)}
                          className="btn-secondary p-2 text-red-400"
                          title="Remove"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 p-3 bg-green-900 bg-opacity-20 border border-green-600 rounded text-sm text-green-200">
                <strong>Info:</strong> Tooltypes are written directly to the binary .info file.
                A backup is created automatically before modifications.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
