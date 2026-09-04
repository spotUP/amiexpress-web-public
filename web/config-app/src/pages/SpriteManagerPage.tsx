import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/client';
import { SkeletonRows } from '../components/ui/states';
import { Upload, Trash2, Download, Eye, EyeOff, FileImage, FolderOpen } from 'lucide-react';

interface SpriteInfo {
  file: string;
  size: number;
  mtime: number;
  animationCount: number;
  dimensions: { width: number; height: number };
}

export function SpriteManagerPage() {
  const [doors, setDoors] = useState<string[]>([]);
  const [selectedDoor, setSelectedDoor] = useState<string | null>(null);
  const [sprites, setSprites] = useState<SpriteInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [previewSprite, setPreviewSprite] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string>('');

  const loadDoors = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.listSpriteDoors();
      if (data) setDoors(data.doors);
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Failed'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDoors(); }, [loadDoors]);

  const loadSprites = useCallback(async (door: string) => {
    setLoading(true);
    setSelectedDoor(door);
    setPreviewSprite(null);
    try {
      const data = await apiClient.listSprites(door);
      if (data) setSprites(data.sprites);
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Failed'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedDoor) return;
    setUploading(true);
    setStatus(null);
    try {
      const content = await file.text();
      // Validate JSON
      JSON.parse(content);
      await apiClient.putSprite(selectedDoor, file.name, content);
      setStatus(`Uploaded ${file.name}`);
      await loadSprites(selectedDoor);
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Upload failed'}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (file: string) => {
    if (!selectedDoor) return;
    if (!window.confirm(`Delete ${file}? This cannot be undone.`)) return;
    setStatus(null);
    try {
      await apiClient.deleteSprite(selectedDoor, file);
      setStatus(`Deleted ${file}`);
      if (previewSprite === file) setPreviewSprite(null);
      await loadSprites(selectedDoor);
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Delete failed'}`);
    }
  };

  const handlePreview = async (file: string) => {
    if (!selectedDoor) return;
    if (previewSprite === file) {
      setPreviewSprite(null);
      return;
    }
    try {
      const data = await apiClient.getSprite(selectedDoor, file);
      if (data) {
        setPreviewContent(data.content);
        setPreviewSprite(file);
      }
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Preview failed'}`);
    }
  };

  if (loading && doors.length === 0) return <div className="p-5"><SkeletonRows rows={8} /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-content-primary">Sprite Manager</h1>
        <p className="text-content-secondary mt-1">
          Browse, preview, upload, and delete sprite sheets for installed doors.
        </p>
      </div>

      {status && (
        <div className={`px-4 py-2 rounded text-sm ${status.startsWith('Error') ? 'bg-alert/10 text-alert' : 'bg-ok/10 text-ok'}`}>
          {status}
        </div>
      )}

      <div className="grid grid-cols-4 gap-6">
        {/* Door list sidebar */}
        <div className="col-span-1 card">
          <h3 className="text-sm font-semibold text-content-primary mb-3">Doors with Sprites</h3>
          {doors.length === 0 ? (
            <p className="text-xs text-content-muted">No sprite doors found.</p>
          ) : (
            <ul className="space-y-1">
              {doors.map(door => (
                <li key={door}>
                  <button
                    onClick={() => loadSprites(door)}
                    className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center gap-2 ${
                      selectedDoor === door
                        ? 'bg-accent text-content-inverse'
                        : 'text-content-secondary hover:bg-surface-3 hover:text-content-primary'
                    }`}
                  >
                    <FolderOpen size={14} />
                    {door}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Sprite list */}
        <div className="col-span-3 card">
          {!selectedDoor ? (
            <p className="text-content-muted text-sm">Select a door to view its sprites.</p>
          ) : loading ? (
            <SkeletonRows rows={6} />
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-content-primary">
                  {selectedDoor}/sprites/ ({sprites.length} files)
                </h3>
                <label className="btn-primary text-sm flex items-center gap-2 cursor-pointer">
                  <Upload size={14} />
                  {uploading ? 'Uploading...' : 'Upload Sprite'}
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              </div>

              {sprites.length === 0 ? (
                <p className="text-content-muted text-sm">No sprites in this door.</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-2xs font-semibold uppercase tracking-widest text-content-muted">
                      <th className="px-3 py-2 text-left">File</th>
                      <th className="px-3 py-2 text-left">Animations</th>
                      <th className="px-3 py-2 text-left">Size</th>
                      <th className="px-3 py-2 text-left">Dimensions</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sprites.map(s => (
                      <tr key={s.file} className="border-b border-border last:border-0 hover:bg-surface-2 transition-colors">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <FileImage size={14} className="text-content-muted shrink-0" />
                            <span className="text-sm text-content-primary font-mono">{s.file}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-sm text-content-secondary">{s.animationCount}</td>
                        <td className="px-3 py-2 text-sm text-content-secondary font-mono">{(s.size / 1024).toFixed(1)} KB</td>
                        <td className="px-3 py-2 text-sm text-content-secondary">{s.dimensions.width}×{s.dimensions.height}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handlePreview(s.file)}
                              className="p-1.5 rounded hover:bg-surface-3 text-content-secondary hover:text-content-primary transition-colors"
                              title={previewSprite === s.file ? 'Hide preview' : 'Preview'}
                            >
                              {previewSprite === s.file ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                            <a
                              href={`/api/sprite-manager/${encodeURIComponent(selectedDoor)}/sprite/${encodeURIComponent(s.file)}`}
                              download={s.file}
                              className="p-1.5 rounded hover:bg-surface-3 text-content-secondary hover:text-content-primary transition-colors"
                              title="Download"
                              onClick={e => {
                                // Use fetch + blob download to include auth header
                                e.preventDefault();
                                apiClient.getSprite(selectedDoor, s.file).then(data => {
                                  if (data?.content) {
                                    const blob = new Blob([data.content], { type: 'application/json' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = s.file;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                  }
                                }).catch(() => setStatus('Error downloading sprite'));
                              }}
                            >
                              <Download size={14} />
                            </a>
                            <button
                              onClick={() => handleDelete(s.file)}
                              className="p-1.5 rounded hover:bg-alert/10 text-content-secondary hover:text-alert transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* JSON Preview */}
              {previewSprite && (
                <div className="mt-4 border border-border rounded overflow-hidden">
                  <div className="bg-surface-2 px-4 py-2 text-xs font-semibold text-content-muted border-b border-border flex items-center justify-between">
                    <span>Preview: {previewSprite}</span>
                    <button
                      onClick={() => setPreviewSprite(null)}
                      className="text-content-secondary hover:text-content-primary"
                    >
                      <EyeOff size={12} />
                    </button>
                  </div>
                  <pre className="p-4 text-xs font-mono text-content-secondary overflow-auto max-h-96 bg-surface-0">
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(previewContent), null, 2);
                      } catch {
                        return previewContent;
                      }
                    })()}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}