import React, { useState, useEffect } from 'react';
import { FileText, Save, Loader2, CheckCircle, XCircle, Info } from 'lucide-react';
import { SDK_API_URL } from '../utils/api-config';

interface NFOEditorProps {
  doorId: string;
  className?: string;
}

export const NFOEditor: React.FC<NFOEditorProps> = ({ doorId, className = '' }) => {
  const [content, setContent] = useState('');
  const [filename, setFilename] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [exists, setExists] = useState(false);

  useEffect(() => {
    loadNFOFile();
  }, [doorId]);

  const loadNFOFile = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${SDK_API_URL}/api/doors/${doorId}/nfo`);
      if (response.ok) {
        const data = await response.json();
        setContent(data.content);
        setFilename(data.filename);
        setExists(data.exists);
      } else {
        console.error('Failed to load .nfo file');
      }
    } catch (error) {
      console.error('Error loading .nfo file:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveNFOFile = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const response = await fetch(`${SDK_API_URL}/api/doors/${doorId}/nfo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content, filename }),
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
      console.error('Error saving .nfo file:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center h-full bg-gray-900 ${className}`}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-3" />
          <p className="text-gray-400">Loading .nfo file...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-gray-900 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-cyan-400" />
          <div>
            <h3 className="font-semibold text-white">README/NFO Editor</h3>
            <p className="text-xs text-gray-400">
              {exists ? `Editing ${filename}` : 'Create new .nfo file'}
            </p>
          </div>
        </div>
        <button
          onClick={saveNFOFile}
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

      {/* Info Banner */}
      <div className="p-3 bg-blue-900/20 border-b border-blue-700/50">
        <div className="flex items-start gap-2 text-sm text-blue-300">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <strong>.NFO files</strong> are traditional BBS documentation files.
            Use ASCII art and plain text formatting. Recommended width: 80 characters.
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full h-full p-4 bg-gray-900 text-gray-100 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-inset"
          placeholder="Enter .nfo file content here...

╔════════════════════════════════════════════════════════════════════════════╗
║                            YOUR DOOR NAME HERE                             ║
╚════════════════════════════════════════════════════════════════════════════╝

Description of your door...

Features:
  * Feature 1
  * Feature 2

Installation:
  1. Step 1
  2. Step 2

Author: Your Name
Version: 1.0.0
"
          spellCheck={false}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between p-3 border-t border-gray-700 text-xs text-gray-400 bg-gray-800/30">
        <div className="flex items-center gap-4">
          <span>{content.length} characters</span>
          <span>{content.split('\n').length} lines</span>
        </div>
        <div>
          Press Ctrl+S to save (keyboard shortcut)
        </div>
      </div>
    </div>
  );
};
