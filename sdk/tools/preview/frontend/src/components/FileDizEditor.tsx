import React, { useState, useEffect, useRef } from 'react';
import { File, Save, Loader2, CheckCircle, XCircle, Info, Upload } from 'lucide-react';

interface FileDizEditorProps {
  doorId: string;
  className?: string;
}

export const FileDizEditor: React.FC<FileDizEditorProps> = ({ doorId, className = '' }) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [exists, setExists] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadFileDiz();
  }, [doorId]);

  const loadFileDiz = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/doors/${doorId}/file_id_diz`);
      if (response.ok) {
        const data = await response.json();
        setContent(data.content);
        setExists(data.exists);
      } else {
        console.error('Failed to load FILE_ID.DIZ');
      }
    } catch (error) {
      console.error('Error loading FILE_ID.DIZ:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveFileDiz = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const response = await fetch(`/api/doors/${doorId}/file_id_diz`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });

      if (response.ok) {
        setSaveStatus('success');
        setExists(true);
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } catch (error) {
      console.error('Error saving FILE_ID.DIZ:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const text = await file.text();

      // Upload to server
      const response = await fetch(`/api/doors/${doorId}/file_id_diz/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: text }),
      });

      if (response.ok) {
        setContent(text);
        setExists(true);
        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } catch (error) {
      console.error('Error uploading FILE_ID.DIZ:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center h-full bg-gray-900 ${className}`}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-3" />
          <p className="text-gray-400">Loading FILE_ID.DIZ...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-gray-900 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <File className="w-5 h-5 text-purple-400" />
          <div>
            <h3 className="font-semibold text-white">FILE_ID.DIZ Editor</h3>
            <p className="text-xs text-gray-400">
              {exists ? 'Edit release description' : 'Create new FILE_ID.DIZ'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".diz,.txt"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={handleUploadClick}
            disabled={uploading}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
              ${
                uploading
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
              }
            `}
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Uploading...</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                <span>Upload</span>
              </>
            )}
          </button>
          <button
            onClick={saveFileDiz}
            disabled={saving}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
              ${
                saving
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }
            `}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : saveStatus === 'success' ? (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>Saved!</span>
              </>
            ) : saveStatus === 'error' ? (
              <>
                <XCircle className="w-4 h-4" />
                <span>Error</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="p-3 bg-purple-900/20 border-b border-purple-700/50">
        <div className="flex items-start gap-2 text-sm text-purple-300">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <strong>FILE_ID.DIZ</strong> is a BBS standard release description file.
            Limited to <strong>10 lines</strong> and <strong>45 characters per line</strong>.
            Used when packaging door releases.
          </div>
        </div>
      </div>

      {/* Editor with line guides */}
      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 flex">
          {/* Line numbers */}
          <div className="flex-shrink-0 w-12 bg-gray-800/50 border-r border-gray-700 p-4 text-right font-mono text-xs text-gray-500">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="h-6 leading-6">
                {i + 1}
              </div>
            ))}
          </div>

          {/* Editor */}
          <div className="flex-1 relative">
            <textarea
              value={content}
              onChange={(e) => {
                const lines = e.target.value.split('\n');
                // Limit to 10 lines
                const limitedLines = lines.slice(0, 10);
                // Limit each line to 45 characters
                const formattedLines = limitedLines.map(line => line.substring(0, 45));
                setContent(formattedLines.join('\n'));
              }}
              className="w-full h-full p-4 bg-gray-900 text-gray-100 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-600 focus:ring-inset"
              placeholder="FILE_ID.DIZ content (10 lines max, 45 chars per line)

         Your Door Name v1.0.0
        ──────────────────────────

Description of your door here...

By: Author Name
Category: BBS Door
Released: 2025-01-11

Made with AmiExpress SDK"
              spellCheck={false}
              style={{
                lineHeight: '1.5rem',
              }}
            />

            {/* Character limit guide (45 chars) */}
            <div
              className="absolute top-0 bottom-0 w-px bg-yellow-500/30 pointer-events-none"
              style={{ left: `calc(${45 * 0.6}ch + 1rem)` }}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between p-3 border-t border-gray-700 text-xs text-gray-400 bg-gray-800/30">
        <div className="flex items-center gap-4">
          <span>
            {content.split('\n').length} / 10 lines
          </span>
          <span>
            Max line length: {Math.max(...content.split('\n').map(l => l.length), 0)} / 45 chars
          </span>
        </div>
        <div className="text-yellow-400">
          {content.split('\n').length > 10 && '⚠ Too many lines!'}
          {content.split('\n').some(l => l.length > 45) && '⚠ Line too long!'}
        </div>
      </div>
    </div>
  );
};
