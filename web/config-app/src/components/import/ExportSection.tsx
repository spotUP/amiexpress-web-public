/**
 * Export Section Component
 *
 * UI for exporting BBS data to Amiga-compatible archives.
 */

import { useState, useEffect } from 'react';
import { useNotification } from '../../contexts/NotificationContext';

interface ExportOptions {
  includeUsers: boolean;
  includeConferences: boolean;
  includeMessages: boolean;
  includeFiles: boolean;
  includeConfig: boolean;
  includeBulletins: boolean;
  includeScreens: boolean;
}

interface ExportFile {
  filename: string;
  size: number;
  created: Date;
}

export function ExportSection() {
  const { showSuccess, showError, confirm } = useNotification();
  const [options, setOptions] = useState<ExportOptions>({
    includeUsers: true,
    includeConferences: true,
    includeMessages: true,
    includeFiles: true,
    includeConfig: true,
    includeBulletins: true,
    includeScreens: true,
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exports, setExports] = useState<ExportFile[]>([]);

  // Load existing exports on mount
  useEffect(() => {
    loadExports();
  }, []);

  const loadExports = async () => {
    try {
      const response = await fetch('/api/import/export/list', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setExports(data.exports || []);
      }
    } catch (err) {
      console.error('Failed to load exports:', err);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const response = await fetch('/api/import/export/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(options),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const itemsCount = Object.values(data.itemsExported as Record<string, number>).reduce((a, b) => a + b, 0);
        showSuccess(`Export created successfully! Exported ${itemsCount} items (${formatBytes(data.size)})`);
        loadExports(); // Reload the list
      } else {
        showError(data.errors?.join(', ') || 'Export failed');
      }
    } catch (err: any) {
      showError(`Export error: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownload = (filename: string) => {
    const token = localStorage.getItem('token');
    window.open(`/api/import/export/download/${filename}?token=${token}`, '_blank');
  };

  const handleDelete = async (filename: string) => {
    const confirmed = await confirm({
      title: 'Delete Export',
      message: `Delete export ${filename}?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger'
    });

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/import/export/${filename}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        showSuccess('Export deleted successfully');
        loadExports();
      } else {
        const data = await response.json();
        showError(data.error || 'Failed to delete export');
      }
    } catch (err: any) {
      showError(`Delete error: ${err.message}`);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString();
  };

  return (
    <div className="export-section">
      <h2>Export BBS Data</h2>
      <p>Export current BBS data to Amiga-compatible archive (ZIP format)</p>

      <div className="export-options">
        <h3>Export Options</h3>
        <div className="options-grid">
          <label>
            <input
              type="checkbox"
              checked={options.includeUsers}
              onChange={(e) => setOptions({ ...options, includeUsers: e.target.checked })}
            />
            <span>Users</span>
          </label>

          <label>
            <input
              type="checkbox"
              checked={options.includeConferences}
              onChange={(e) => setOptions({ ...options, includeConferences: e.target.checked })}
            />
            <span>Conferences</span>
          </label>

          <label>
            <input
              type="checkbox"
              checked={options.includeMessages}
              onChange={(e) => setOptions({ ...options, includeMessages: e.target.checked })}
            />
            <span>Messages</span>
          </label>

          <label>
            <input
              type="checkbox"
              checked={options.includeFiles}
              onChange={(e) => setOptions({ ...options, includeFiles: e.target.checked })}
            />
            <span>Files Metadata</span>
          </label>

          <label>
            <input
              type="checkbox"
              checked={options.includeConfig}
              onChange={(e) => setOptions({ ...options, includeConfig: e.target.checked })}
            />
            <span>System Config</span>
          </label>

          <label>
            <input
              type="checkbox"
              checked={options.includeBulletins}
              onChange={(e) => setOptions({ ...options, includeBulletins: e.target.checked })}
            />
            <span>Bulletins</span>
          </label>

          <label>
            <input
              type="checkbox"
              checked={options.includeScreens}
              onChange={(e) => setOptions({ ...options, includeScreens: e.target.checked })}
            />
            <span>Screens</span>
          </label>
        </div>
      </div>

      <div className="export-actions">
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="btn-primary"
        >
          {isExporting ? 'Creating Export...' : 'Create Export'}
        </button>
      </div>

      {exports.length > 0 && (
        <div className="exports-list">
          <h3>Available Exports</h3>
          <table>
            <thead>
              <tr>
                <th>Filename</th>
                <th>Size</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {exports.map((exp) => (
                <tr key={exp.filename}>
                  <td>{exp.filename}</td>
                  <td>{formatBytes(exp.size)}</td>
                  <td>{formatDate(exp.created)}</td>
                  <td>
                    <button
                      onClick={() => handleDownload(exp.filename)}
                      className="btn-small btn-primary"
                    >
                      Download
                    </button>
                    <button
                      onClick={() => handleDelete(exp.filename)}
                      className="btn-small btn-danger"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
