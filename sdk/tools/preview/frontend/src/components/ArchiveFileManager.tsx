import React, { useState } from 'react';
import { Folder, File, Edit2, Trash2, FolderPlus, Check, X as XIcon } from 'lucide-react';

interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path: string;
  size?: number;
  children?: FileNode[];
  isEditing?: boolean;
}

interface ArchiveFileManagerProps {
  files: FileNode[];
  onFilesChange: (files: FileNode[]) => void;
  className?: string;
}

export const ArchiveFileManager: React.FC<ArchiveFileManagerProps> = ({
  files,
  onFilesChange,
  className = '',
}) => {
  const [draggedItem, setDraggedItem] = useState<FileNode | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleDragStart = (e: React.DragEvent, file: FileNode) => {
    setDraggedItem(file);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetFolder: FileNode | null) => {
    e.preventDefault();
    if (!draggedItem) return;

    // Move file to target folder (or root if targetFolder is null)
    const newFiles = moveFile(files, draggedItem, targetFolder);
    onFilesChange(newFiles);
    setDraggedItem(null);
  };

  const moveFile = (fileList: FileNode[], item: FileNode, target: FileNode | null): FileNode[] => {
    // Remove item from current location
    const removeItem = (nodes: FileNode[]): FileNode[] => {
      return nodes.filter(node => {
        if (node.id === item.id) return false;
        if (node.children) {
          node.children = removeItem(node.children);
        }
        return true;
      });
    };

    // Add item to target location
    const addItem = (nodes: FileNode[]): FileNode[] => {
      if (!target) {
        // Add to root
        return [...nodes, item];
      }
      return nodes.map(node => {
        if (node.id === target.id && node.type === 'folder') {
          return {
            ...node,
            children: [...(node.children || []), item],
          };
        }
        if (node.children) {
          return {
            ...node,
            children: addItem(node.children),
          };
        }
        return node;
      });
    };

    let result = removeItem(fileList);
    result = addItem(result);
    return result;
  };

  const startRename = (fileId: string) => {
    const updateEditing = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(node => {
        if (node.id === fileId) {
          return { ...node, isEditing: true };
        }
        if (node.children) {
          return { ...node, children: updateEditing(node.children) };
        }
        return node;
      });
    };
    onFilesChange(updateEditing(files));
  };

  const finishRename = (fileId: string, newName: string) => {
    const updateName = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(node => {
        if (node.id === fileId) {
          const pathParts = node.path.split('/');
          pathParts[pathParts.length - 1] = newName;
          return {
            ...node,
            name: newName,
            path: pathParts.join('/'),
            isEditing: false,
          };
        }
        if (node.children) {
          return { ...node, children: updateName(node.children) };
        }
        return node;
      });
    };
    onFilesChange(updateName(files));
  };

  const cancelRename = (fileId: string) => {
    const updateEditing = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(node => {
        if (node.id === fileId) {
          return { ...node, isEditing: false };
        }
        if (node.children) {
          return { ...node, children: updateEditing(node.children) };
        }
        return node;
      });
    };
    onFilesChange(updateEditing(files));
  };

  const deleteFile = (fileId: string) => {
    const removeFile = (nodes: FileNode[]): FileNode[] => {
      return nodes.filter(node => {
        if (node.id === fileId) return false;
        if (node.children) {
          node.children = removeFile(node.children);
        }
        return true;
      });
    };
    onFilesChange(removeFile(files));
  };

  const createFolder = () => {
    const newFolder: FileNode = {
      id: `folder-${Date.now()}`,
      name: 'New Folder',
      type: 'folder',
      path: 'New Folder',
      children: [],
      isEditing: true,
    };
    onFilesChange([...files, newFolder]);
  };

  const renderFileNode = (file: FileNode, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedFolders.has(file.id);
    const indent = depth * 20;

    return (
      <div key={file.id}>
        <div
          draggable={!file.isEditing}
          onDragStart={(e) => handleDragStart(e, file)}
          onDragOver={handleDragOver}
          onDrop={(e) => file.type === 'folder' ? handleDrop(e, file) : undefined}
          className={`flex items-center gap-2 px-2 py-1.5 hover:bg-gray-700 rounded cursor-pointer ${
            draggedItem?.id === file.id ? 'opacity-50' : ''
          }`}
          style={{ paddingLeft: `${8 + indent}px` }}
        >
          {/* Expand/collapse for folders */}
          {file.type === 'folder' && (
            <button
              onClick={() => toggleFolder(file.id)}
              className="text-gray-400 hover:text-white"
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}

          {/* Icon */}
          {file.type === 'folder' ? (
            <Folder className="w-4 h-4 text-blue-400 flex-shrink-0" />
          ) : (
            <File className="w-4 h-4 text-gray-400 flex-shrink-0" />
          )}

          {/* Name or edit input */}
          {file.isEditing ? (
            <div className="flex items-center gap-1 flex-1">
              <input
                type="text"
                defaultValue={file.name}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    finishRename(file.id, e.currentTarget.value);
                  } else if (e.key === 'Escape') {
                    cancelRename(file.id);
                  }
                }}
                className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                  finishRename(file.id, input.value);
                }}
                className="p-1 hover:bg-gray-600 rounded text-green-400"
                title="Save"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  cancelRename(file.id);
                }}
                className="p-1 hover:bg-gray-600 rounded text-red-400"
                title="Cancel"
              >
                <XIcon className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <>
              <span className="flex-1 text-sm text-gray-200 truncate">{file.name}</span>
              {file.size !== undefined && (
                <span className="text-xs text-gray-500">{formatFileSize(file.size)}</span>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startRename(file.id);
                  }}
                  className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-blue-400"
                  title="Rename"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteFile(file.id);
                  }}
                  className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-red-400"
                  title="Delete"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Render children if folder is expanded */}
        {file.type === 'folder' && isExpanded && file.children && (
          <div>
            {file.children.map(child => renderFileNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`bg-[#1E1E1E] rounded-lg border border-gray-700 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <h4 className="text-sm font-semibold text-gray-300">Archive Contents</h4>
        <button
          onClick={createFolder}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-300 rounded transition-colors"
        >
          <FolderPlus className="w-3 h-3" />
          New Folder
        </button>
      </div>

      {/* File tree */}
      <div
        className="p-2 max-h-96 overflow-y-auto"
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, null)}
      >
        {files.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-8">
            No files yet. Upload files above to add them to the archive.
          </div>
        ) : (
          <div className="space-y-0.5">
            {files.map(file => renderFileNode(file))}
          </div>
        )}
      </div>

      {/* Footer info */}
      <div className="px-3 py-2 border-t border-gray-700 text-xs text-gray-500">
        {files.length} item(s) • Drag to rearrange • Right-click for options
      </div>
    </div>
  );
};
