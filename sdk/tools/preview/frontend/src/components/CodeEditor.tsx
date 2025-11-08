import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { DoorFile } from '../types';
import { File, Folder, FolderOpen, ChevronRight, ChevronDown } from 'lucide-react';

interface CodeEditorProps {
  files: DoorFile[];
  currentFile: DoorFile | null;
  onFileSelect: (file: DoorFile) => void;
  onFileChange?: (file: DoorFile, content: string) => void;
  readOnly?: boolean;
  theme?: 'vs-dark' | 'vs-light';
  fontSize?: number;
  className?: string;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  files,
  currentFile,
  onFileSelect,
  onFileChange,
  readOnly = false,
  theme = 'vs-dark',
  fontSize = 14,
  className = '',
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['/']));

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const getLanguage = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
        return 'typescript';
      case 'js':
        return 'javascript';
      case 'json':
        return 'json';
      case 'md':
        return 'markdown';
      case 'css':
        return 'css';
      case 'html':
        return 'html';
      case 'txt':
        return 'plaintext';
      default:
        return 'plaintext';
    }
  };

  const renderFileTree = (files: DoorFile[], level: number = 0): React.ReactNode => {
    return files.map((file) => {
      const isExpanded = expandedFolders.has(file.path);
      const isSelected = currentFile?.path === file.path;

      if (file.type === 'directory') {
        return (
          <div key={file.path}>
            <button
              onClick={() => toggleFolder(file.path)}
              className={`w-full flex items-center gap-2 px-2 py-1 hover:bg-gray-700 rounded text-left text-sm ${
                isSelected ? 'bg-blue-600' : ''
              }`}
              style={{ paddingLeft: `${level * 12 + 8}px` }}
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 flex-shrink-0" />
              )}
              {isExpanded ? (
                <FolderOpen className="w-4 h-4 flex-shrink-0 text-yellow-400" />
              ) : (
                <Folder className="w-4 h-4 flex-shrink-0 text-yellow-400" />
              )}
              <span className="truncate">{file.name}</span>
            </button>
            {isExpanded && file.children && (
              <div>{renderFileTree(file.children, level + 1)}</div>
            )}
          </div>
        );
      }

      return (
        <button
          key={file.path}
          onClick={() => onFileSelect(file)}
          className={`w-full flex items-center gap-2 px-2 py-1 hover:bg-gray-700 rounded text-left text-sm ${
            isSelected ? 'bg-blue-600' : ''
          }`}
          style={{ paddingLeft: `${level * 12 + 32}px` }}
        >
          <File className="w-4 h-4 flex-shrink-0 text-blue-400" />
          <span className="truncate">{file.name}</span>
        </button>
      );
    });
  };

  return (
    <div className={`flex h-full ${className}`}>
      {/* File tree sidebar */}
      <div className="w-64 bg-[#252526] border-r border-gray-700 overflow-y-auto">
        <div className="p-2">
          <div className="text-xs font-semibold text-gray-400 mb-2 px-2">FILES</div>
          {renderFileTree(files)}
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 flex flex-col">
        {currentFile ? (
          <>
            {/* File tab */}
            <div className="bg-[#252526] border-b border-gray-700 px-4 py-2 flex items-center gap-2">
              <File className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-gray-300">{currentFile.name}</span>
              {readOnly && (
                <span className="text-xs text-gray-500 ml-auto">Read-only</span>
              )}
            </div>

            {/* Monaco Editor */}
            <div className="flex-1">
              <Editor
                height="100%"
                language={getLanguage(currentFile.name)}
                value={currentFile.content || '// Loading...'}
                onChange={(value) => {
                  if (!readOnly && value !== undefined && onFileChange) {
                    onFileChange(currentFile, value);
                  }
                }}
                theme={theme}
                options={{
                  readOnly,
                  fontSize,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  wordWrap: 'on',
                  lineNumbers: 'on',
                  renderWhitespace: 'selection',
                  tabSize: 2,
                }}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <File className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>Select a file to view</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
