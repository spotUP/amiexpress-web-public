import React from 'react';
import { Info, Package, User, Calendar, File, HardDrive, Terminal } from 'lucide-react';
import { DoorMetadata } from '../types';
import { formatBytes, formatRelativeTime } from '../utils/format';

interface DoorInfoProps {
  metadata: DoorMetadata | null;
  className?: string;
}

export const DoorInfo: React.FC<DoorInfoProps> = ({ metadata, className = '' }) => {
  if (!metadata) {
    return (
      <div className={`bg-[#1E1E1E] rounded-lg border border-gray-700 p-4 ${className}`}>
        <div className="text-center text-gray-500 py-8">
          <Info className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No door selected</p>
        </div>
      </div>
    );
  }

  const getDoorTypeColor = (type: string) => {
    switch (type) {
      case 'typescript':
        return 'text-blue-400';
      case 'javascript':
        return 'text-yellow-400';
      case 'amiga':
        return 'text-purple-400';
      default:
        return 'text-gray-400';
    }
  };

  const getDoorTypeBadge = (type: string) => {
    const color = getDoorTypeColor(type);
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${color} bg-opacity-10`}>
        {type.toUpperCase()}
      </span>
    );
  };

  return (
    <div className={`bg-[#1E1E1E] rounded-lg border border-gray-700 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-lg font-semibold text-white">{metadata.name}</h3>
          {getDoorTypeBadge(metadata.doorType)}
        </div>
        <p className="text-sm text-gray-400">{metadata.description}</p>
      </div>

      {/* Metadata sections */}
      <div className="p-4 space-y-4">
        {/* Basic info */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Package className="w-4 h-4 text-gray-400" />
            <span className="text-gray-400">Version:</span>
            <span className="text-white font-medium">{metadata.version}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-gray-400" />
            <span className="text-gray-400">Author:</span>
            <span className="text-white">{metadata.author}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-gray-400">Last Modified:</span>
            <span className="text-white">
              {formatRelativeTime(metadata.lastModified)}
            </span>
          </div>
        </div>

        {/* File statistics */}
        <div className="pt-4 border-t border-gray-700">
          <h4 className="text-sm font-semibold text-gray-300 mb-2">Statistics</h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <File className="w-4 h-4 text-gray-400" />
              <span className="text-gray-400">Files:</span>
              <span className="text-white">{metadata.fileCount}</span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <HardDrive className="w-4 h-4 text-gray-400" />
              <span className="text-gray-400">Total Size:</span>
              <span className="text-white">{formatBytes(metadata.totalSize)}</span>
            </div>
          </div>
        </div>

        {/* Dependencies */}
        {Object.keys(metadata.dependencies).length > 0 && (
          <div className="pt-4 border-t border-gray-700">
            <h4 className="text-sm font-semibold text-gray-300 mb-2">Dependencies</h4>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {Object.entries(metadata.dependencies).map(([name, version]) => (
                <div key={name} className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">{name}</span>
                  <span className="text-gray-500">{version}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Entry point */}
        <div className="pt-4 border-t border-gray-700">
          <h4 className="text-sm font-semibold text-gray-300 mb-2">Entry Point</h4>
          <code className="block text-xs text-blue-400 bg-gray-800 px-2 py-1 rounded">
            {metadata.entryPoint}
          </code>
        </div>

        {/* BBS Command */}
        {metadata.bbsCommand && (
          <div className="pt-4 border-t border-gray-700">
            <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-green-400" />
              BBS Command
            </h4>
            <code className="block text-sm text-green-400 bg-gray-800 px-3 py-2 rounded font-mono font-bold">
              {metadata.bbsCommand}
            </code>
            <p className="text-xs text-gray-500 mt-1">Type this command in the BBS terminal</p>
          </div>
        )}

        {/* Build status */}
        <div className="pt-4 border-t border-gray-700">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                metadata.hasBuild ? 'bg-green-400' : 'bg-gray-600'
              }`}
            />
            <span className="text-sm text-gray-400">
              {metadata.hasBuild ? 'Build available' : 'No build'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
