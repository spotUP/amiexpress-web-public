import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit2, Trash2, Plus, X, FileCode, Save, Power, PowerOff, Upload } from 'lucide-react';
import { apiClient } from '../api/client';
import type { Door } from '../types';
import { useNotification } from '../contexts/NotificationContext';

interface DoorFormData {
  door_name: string;
  door_command: string;
  description: string;
  door_type: string;
  runtime_env: string;
  min_security_level: number;
  time_limit: number;
  enabled: boolean;
}

interface Tooltype {
  key: string;
  value: string;
  commented: boolean;
  originalLine: string;
}

export function DoorsPage() {
  const queryClient = useQueryClient();
  const { showSuccess, showError, confirm } = useNotification();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDoor, setEditingDoor] = useState<Door | null>(null);
  const [sortColumn, setSortColumn] = useState<keyof Door>('door_name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [isUploading, setIsUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<DoorFormData>({
    door_name: '',
    door_command: '',
    description: '',
    door_type: 'XIM',
    runtime_env: 'vamos',
    min_security_level: 0,
    time_limit: 30,
    enabled: true,
  });

  // Info editor modal state
  const [isInfoEditorOpen, setIsInfoEditorOpen] = useState(false);
  const [editingInfoDoor, setEditingInfoDoor] = useState<Door | null>(null);
  const [tooltypes, setTooltypes] = useState<Tooltype[]>([]);
  const [infoDirty, setInfoDirty] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['doors'],
    queryFn: () => apiClient.getDoors(),
  });

  const createMutation = useMutation({
    mutationFn: (door: DoorFormData) => apiClient.createDoor(door),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doors'] });
      showSuccess('Door created successfully');
      setIsModalOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      showError(`Failed to create door: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<DoorFormData> }) =>
      apiClient.updateDoor(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doors'] });
      showSuccess('Door updated successfully');
      setIsModalOpen(false);
      setEditingDoor(null);
      resetForm();
    },
    onError: (error: Error) => {
      showError(`Failed to update door: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.deleteDoor(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doors'] });
      showSuccess('Door deleted successfully');
    },
    onError: (error: Error) => {
      showError(`Failed to delete door: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      door_name: '',
      door_command: '',
      description: '',
      door_type: 'XIM',
      runtime_env: 'vamos',
      min_security_level: 0,
      time_limit: 30,
      enabled: true,
    });
  };

  const handleAdd = () => {
    resetForm();
    setEditingDoor(null);
    setIsModalOpen(true);
  };

  const handleEdit = (door: Door) => {
    setFormData({
      door_name: door.door_name,
      door_command: door.door_command,
      description: door.description,
      door_type: door.door_type,
      runtime_env: door.runtime_env,
      min_security_level: door.min_security_level,
      time_limit: door.time_limit,
      enabled: door.enabled,
    });
    setEditingDoor(door);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingDoor) {
      updateMutation.mutate({ id: editingDoor.id, updates: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = async (door: Door) => {
    const confirmed = await confirm({
      title: 'Delete Door',
      message: `Are you sure you want to delete door "${door.door_name}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger'
    });
    if (confirmed) {
      deleteMutation.mutate(door.id);
    }
  };

  const handleUploadClick = () => {
    uploadInputRef.current?.click();
  };

  const handleUploadChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const uploadResult = await apiClient.uploadDoorArchive(file);
      const archivePath = uploadResult.data?.path;
      const filename = uploadResult.data?.filename || uploadResult.data?.originalname;

      const installResult = await apiClient.installDoorArchive({
        path: archivePath,
        filename,
      });

      showSuccess(installResult.message || 'Door archive installed successfully');
      queryClient.invalidateQueries({ queryKey: ['doors'] });
    } catch (error) {
      showError(`Door upload failed: ${(error as Error).message}`);
    } finally {
      setIsUploading(false);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = '';
      }
    }
  };

  const handleEditInfo = async (door: Door) => {
    try {
      // Load the door's .info file from Commands/BBSCmd/{command}.info
      const infoPath = `Commands/BBSCmd/${door.door_command}.info`;
      const response = await apiClient.getInfoFile(infoPath);

      setTooltypes(response.data?.tooltypes || []);
      setEditingInfoDoor(door);
      setInfoDirty(false);
      setIsInfoEditorOpen(true);
    } catch (error) {
      showError(`Failed to load .info file: ${(error as Error).message}`);
    }
  };

  const handleInfoSave = async () => {
    if (!editingInfoDoor) return;

    try {
      const infoPath = `Commands/BBSCmd/${editingInfoDoor.door_command}.info`;
      await apiClient.updateInfoFile(infoPath, tooltypes);

      showSuccess('Door .info file saved successfully');
      setInfoDirty(false);
      setIsInfoEditorOpen(false);
      setEditingInfoDoor(null);
      queryClient.invalidateQueries({ queryKey: ['doors'] });
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

  const handleSort = (column: keyof Door) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  if (isLoading) {
    return <div className="text-bbs-text">Loading doors...</div>;
  }

  const doors = (data?.data || []).sort((a: Door, b: Door) => {
    const aVal = a[sortColumn];
    const bVal = b[sortColumn];
    const modifier = sortDirection === 'asc' ? 1 : -1;

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return aVal.localeCompare(bVal) * modifier;
    }
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return (aVal - bVal) * modifier;
    }
    if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
      return (aVal === bVal ? 0 : aVal ? -1 : 1) * modifier;
    }
    return 0;
  });

  return (
    <div>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-accent mb-2">Doors Configuration</h1>
          <p className="text-bbs-muted">Manage BBS doors and external programs</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={uploadInputRef}
            type="file"
            accept=".zip,.lha,.lzh,.lzx"
            className="hidden"
            onChange={handleUploadChange}
          />
          <button
            onClick={handleUploadClick}
            className="btn-secondary flex items-center space-x-2"
            disabled={isUploading}
          >
            <Upload size={20} />
            <span>{isUploading ? 'Uploading...' : 'Upload Door'}</span>
          </button>
          <button onClick={handleAdd} className="btn-primary flex items-center space-x-2">
            <Plus size={20} />
            <span>Add Door</span>
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-bbs-border">
              <th className="text-left py-3 px-4 text-bbs-text font-semibold cursor-pointer hover:bg-bbs-secondary/30" onClick={() => handleSort('enabled')}>
                Status {sortColumn === 'enabled' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="text-left py-3 px-4 text-bbs-text font-semibold cursor-pointer hover:bg-bbs-secondary/30" onClick={() => handleSort('door_name')}>
                Name {sortColumn === 'door_name' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="text-left py-3 px-4 text-bbs-text font-semibold cursor-pointer hover:bg-bbs-secondary/30" onClick={() => handleSort('door_command')}>
                Command {sortColumn === 'door_command' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="text-left py-3 px-4 text-bbs-text font-semibold">
                Description
              </th>
              <th className="text-left py-3 px-4 text-bbs-text font-semibold cursor-pointer hover:bg-bbs-secondary/30" onClick={() => handleSort('door_type')}>
                Type {sortColumn === 'door_type' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="text-left py-3 px-4 text-bbs-text font-semibold cursor-pointer hover:bg-bbs-secondary/30" onClick={() => handleSort('runtime_env')}>
                Runtime {sortColumn === 'runtime_env' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="text-left py-3 px-4 text-bbs-text font-semibold cursor-pointer hover:bg-bbs-secondary/30" onClick={() => handleSort('min_security_level')}>
                Min Sec {sortColumn === 'min_security_level' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="text-left py-3 px-4 text-bbs-text font-semibold cursor-pointer hover:bg-bbs-secondary/30" onClick={() => handleSort('time_limit')}>
                Time {sortColumn === 'time_limit' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="text-right py-3 px-4 text-bbs-text font-semibold">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {doors.map((door: Door) => (
              <tr key={door.id} className="border-b border-bbs-border hover:bg-bbs-secondary/20 transition-colors">
                <td className="py-3 px-4">
                  {door.enabled ? (
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-status-ok/20 text-status-ok">
                      <Power size={12} className="mr-1" /> Enabled
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-bbs-muted/20 text-bbs-muted">
                      <PowerOff size={12} className="mr-1" /> Disabled
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-bbs-text font-semibold">{door.door_name}</td>
                <td className="py-3 px-4 text-bbs-text font-mono text-sm">/{door.door_command}</td>
                <td className="py-3 px-4 text-bbs-muted text-sm max-w-xs truncate" title={door.description}>{door.description}</td>
                <td className="py-3 px-4 text-bbs-text font-mono text-sm">{door.door_type}</td>
                <td className="py-3 px-4 text-bbs-text font-mono text-sm">{door.runtime_env}</td>
                <td className="py-3 px-4 text-bbs-text text-center">{door.min_security_level}</td>
                <td className="py-3 px-4 text-bbs-text text-center">{door.time_limit}m</td>
                <td className="py-3 px-4">
                  <div className="flex space-x-2 justify-end">
                    <button
                      onClick={() => handleEdit(door)}
                      className="p-2 bg-bbs-secondary hover:bg-bbs-secondary/80 text-bbs-text rounded transition-colors"
                      title="Edit door"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleEditInfo(door)}
                      className="p-2 bg-accent hover:bg-accent-hover text-content-inverse rounded transition-colors"
                      title="Edit .info file"
                    >
                      <FileCode size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(door)}
                      className="p-2 bg-bbs-accent hover:bg-bbs-accent/90 text-content-inverse rounded transition-colors"
                      title="Delete door"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {doors.length === 0 && (
        <div className="card text-center text-bbs-muted">
          No doors configured. Add doors to provide external programs and games.
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bbs-bg border-2 border-bbs-accent rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto m-4">
            <div className="sticky top-0 bg-bbs-bg border-b border-bbs-primary p-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-accent">
                {editingDoor ? 'Edit Door' : 'Add Door'}
              </h2>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingDoor(null);
                  resetForm();
                }}
                className="text-bbs-muted hover:text-bbs-text transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="door_name" className="label">Door Name *</label>
                  <input
                    id="door_name"
                    type="text"
                    value={formData.door_name}
                    onChange={(e) => setFormData({ ...formData, door_name: e.target.value })}
                    className="input-field w-full"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="door_command" className="label">Command *</label>
                  <input
                    id="door_command"
                    type="text"
                    value={formData.door_command}
                    onChange={(e) => setFormData({ ...formData, door_command: e.target.value })}
                    className="input-field w-full"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="description" className="label">Description</label>
                  <textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="input-field w-full"
                    rows={3}
                  />
                </div>

                <div>
                  <label htmlFor="door_type" className="label">Door Type *</label>
                  <select
                    id="door_type"
                    value={formData.door_type}
                    onChange={(e) => setFormData({ ...formData, door_type: e.target.value })}
                    className="input-field w-full"
                    required
                  >
                    {/* The values the BBS actually uses - see
                        web/backend/src/constants/door-types.ts. The old list
                        (68K/JS/TS/EXEC) matched nothing the server serves or
                        accepts, so an XIM door had no entry to display and
                        saving it changed its type. */}
                    <option value="XIM">XIM (Amiga 68K door)</option>
                    <option value="AIM">AIM (Amiga 68K door)</option>
                    <option value="SIM">SIM (Amiga 68K door)</option>
                    <option value="TIM">TIM (Amiga 68K door)</option>
                    <option value="IIM">IIM (Amiga 68K door)</option>
                    <option value="FIM">FIM (FAME door port)</option>
                    <option value="DD">DD (DayDream door)</option>
                    <option value="typescript">TypeScript</option>
                    <option value="SYSCMD">SYSCMD (system command)</option>
                    <option value="BBSCMD">BBSCMD (BBS command)</option>
                    <option value="INTERNAL">INTERNAL</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="runtime_env" className="label">Runtime *</label>
                  <select
                    id="runtime_env"
                    value={formData.runtime_env}
                    onChange={(e) => setFormData({ ...formData, runtime_env: e.target.value })}
                    className="input-field w-full"
                    required
                  >
                    <option value="vamos">vamos (68K emulator)</option>
                    {/* "nodejs", not "node" - that is what the API serves. */}
                    <option value="nodejs">Node.js</option>
                    <option value="native">Native</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="min_security_level" className="label">Min Security Level *</label>
                  <input
                    id="min_security_level"
                    type="number"
                    min="0"
                    max="255"
                    value={formData.min_security_level}
                    onChange={(e) => setFormData({ ...formData, min_security_level: parseInt(e.target.value) })}
                    className="input-field w-full"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="time_limit" className="label">Time Limit (min) *</label>
                  <input
                    id="time_limit"
                    type="number"
                    min="1"
                    value={formData.time_limit}
                    onChange={(e) => setFormData({ ...formData, time_limit: parseInt(e.target.value) })}
                    className="input-field w-full"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.enabled}
                      onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                      className="form-checkbox h-5 w-5 text-accent"
                    />
                    <span className="text-bbs-text">Enabled</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end space-x-4 pt-6 border-t border-bbs-primary">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingDoor(null);
                    resetForm();
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editingDoor ? 'Update Door' : 'Create Door'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Info Editor Modal */}
      {isInfoEditorOpen && editingInfoDoor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bbs-bg border-2 border-bbs-accent rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto m-4">
            <div className="sticky top-0 bg-bbs-bg border-b border-bbs-primary p-6 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-accent">Edit .info File</h2>
                <p className="text-bbs-muted text-sm mt-1">
                  {editingInfoDoor.door_name} ({editingInfoDoor.door_command}.info)
                </p>
              </div>
              <button
                onClick={() => {
                  if (infoDirty) {
                    if (window.confirm('You have unsaved changes. Discard them?')) {
                      setIsInfoEditorOpen(false);
                      setEditingInfoDoor(null);
                      setInfoDirty(false);
                    }
                  } else {
                    setIsInfoEditorOpen(false);
                    setEditingInfoDoor(null);
                  }
                }}
                className="text-bbs-muted hover:text-bbs-text transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6">
              <div className="mb-4 flex justify-between items-center">
                <p className="text-bbs-muted text-sm">
                  Edit tooltypes for this door. Changes are saved back to the .info file.
                </p>
                <button
                  onClick={handleTooltypeAdd}
                  className="btn-secondary text-sm flex items-center space-x-1"
                >
                  <Plus size={16} />
                  <span>Add Tooltype</span>
                </button>
              </div>

              <div className="border border-bbs-primary rounded overflow-hidden">
                <table className="w-full">
                  <thead className="bg-bbs-primary">
                    <tr>
                      <th className="text-left p-3 text-bbs-text font-semibold w-12">Active</th>
                      <th className="text-left p-3 text-bbs-text font-semibold">Key</th>
                      <th className="text-left p-3 text-bbs-text font-semibold">Value</th>
                      <th className="text-left p-3 text-bbs-text font-semibold w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tooltypes.map((tt, index) => (
                      <tr
                        key={index}
                        className={`border-t border-bbs-primary ${
                          tt.commented ? 'opacity-50' : ''
                        }`}
                      >
                        <td className="p-3">
                          <button
                            onClick={() => handleTooltypeToggle(index)}
                            className={`p-1 rounded transition-colors ${
                              tt.commented
                                ? 'text-bbs-muted hover:text-bbs-text'
                                : 'text-status-ok hover:text-status-ok'
                            }`}
                            title={tt.commented ? 'Enable this tooltype' : 'Disable this tooltype'}
                          >
                            {tt.commented ? <PowerOff size={20} /> : <Power size={20} />}
                          </button>
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            value={tt.key}
                            onChange={(e) => handleTooltypeUpdate(index, 'key', e.target.value)}
                            className="input-field w-full font-mono text-sm"
                            placeholder="KEY"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="text"
                            value={tt.value}
                            onChange={(e) => handleTooltypeUpdate(index, 'value', e.target.value)}
                            className="input-field w-full font-mono text-sm"
                            placeholder="value"
                          />
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => handleTooltypeRemove(index)}
                            className="text-accent hover:text-accent/90 transition-colors"
                            title="Remove this tooltype"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {tooltypes.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-bbs-muted">
                          No tooltypes defined. Click "Add Tooltype" to create one.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end space-x-4 pt-6 border-t border-bbs-primary mt-6">
                <button
                  onClick={() => {
                    if (infoDirty) {
                      if (window.confirm('You have unsaved changes. Discard them?')) {
                        setIsInfoEditorOpen(false);
                        setEditingInfoDoor(null);
                        setInfoDirty(false);
                      }
                    } else {
                      setIsInfoEditorOpen(false);
                      setEditingInfoDoor(null);
                    }
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleInfoSave}
                  className="btn-primary flex items-center space-x-2"
                  disabled={!infoDirty}
                >
                  <Save size={16} />
                  <span>{infoDirty ? 'Save Changes' : 'No Changes'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
