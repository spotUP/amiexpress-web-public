import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/client';
import { ScreenArt } from '../components/ScreenArt';
import { History, RotateCcw, Eye, EyeOff, X } from 'lucide-react';

interface RevisionItem {
  ts: string;
  file: string;
  bytes: number;
  sha256: string;
  source: string;
}

interface Props {
  path: string;
  onClose: () => void;
}

function formatTs(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return ts;
  }
}

export function ScreenRevisionsPanel({ path, onClose }: Props) {
  const [revisions, setRevisions] = useState<RevisionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.getScreenRevisions(path);
      if (data) setRevisions(data.revisions);
    } catch {
      setStatus('Failed to load revisions');
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => { load(); }, [load]);

  const handlePreview = async (file: string) => {
    if (previewFile === file) {
      setPreviewFile(null);
      setPreviewContent(null);
      return;
    }
    try {
      const data = await apiClient.getScreenRevision(path, file);
      if (data) {
        const bytes = atob(data.content);
        // Decode latin1 (single-byte) to string for display
        const decoder = new TextDecoder('latin1');
        const buf = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
        setPreviewContent(decoder.decode(buf));
        setPreviewFile(file);
      }
    } catch {
      setStatus('Failed to load preview');
    }
  };

  const handleRestore = async (file: string) => {
    if (!window.confirm(`Restore revision from ${formatTs(file)}? The current file will be saved as a new revision.`)) return;
    setRestoring(file);
    setStatus(null);
    try {
      await apiClient.restoreScreenRevision(path, file);
      setStatus(`Restored ${file}`);
      setPreviewFile(null);
      setPreviewContent(null);
      await load();
    } catch {
      setStatus('Restore failed');
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className="mt-4 border border-border rounded overflow-hidden">
      <div className="bg-surface-2 px-4 py-2 text-xs font-semibold text-content-muted border-b border-border flex items-center justify-between">
        <span className="flex items-center gap-2">
          <History size={14} />
          Revisions ({revisions.length})
        </span>
        <button onClick={onClose} className="text-content-secondary hover:text-content-primary">
          <X size={14} />
        </button>
      </div>

      {status && (
        <div className={`px-4 py-2 text-xs ${status.startsWith('Failed') || status.startsWith('Restore') ? 'text-alert' : 'text-ok'}`}>
          {status}
        </div>
      )}

      {loading ? (
        <div className="p-4 text-xs text-content-muted">Loading...</div>
      ) : revisions.length === 0 ? (
        <div className="p-4 text-xs text-content-muted">No revisions yet. Revisions are created automatically when a file is replaced.</div>
      ) : (
        <div className="divide-y divide-border max-h-64 overflow-y-auto">
          {revisions.map((rev) => (
            <div key={rev.file} className="px-4 py-2 hover:bg-surface-2 transition-colors">
              <div className="flex items-center justify-between">
                <div className="text-xs text-content-secondary">
                  <span className="text-content-primary">{formatTs(rev.ts)}</span>
                  <span className="ml-2 font-mono">{(rev.bytes / 1024).toFixed(1)} KB</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePreview(rev.file)}
                    className="p-1 rounded hover:bg-surface-3 text-content-secondary hover:text-content-primary"
                    title={previewFile === rev.file ? 'Hide preview' : 'Preview'}
                  >
                    {previewFile === rev.file ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                  <button
                    onClick={() => handleRestore(rev.file)}
                    disabled={restoring === rev.file}
                    className="p-1 rounded hover:bg-surface-3 text-content-secondary hover:text-ok transition-colors disabled:opacity-50"
                    title="Restore this revision"
                  >
                    <RotateCcw size={12} />
                  </button>
                </div>
              </div>
              {previewFile === rev.file && previewContent && (
                <div className="mt-2 bg-black rounded overflow-hidden max-h-48 overflow-y-auto">
                  <ScreenArt content={previewContent} scale={0.5} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}