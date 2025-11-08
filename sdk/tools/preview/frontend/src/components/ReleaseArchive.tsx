import React, { useState } from 'react';
import { Package, Download, Loader } from 'lucide-react';
import { ArchiveOptions } from '../types';

interface ReleaseArchiveProps {
  doorName: string;
  onCreateArchive: (options: ArchiveOptions) => Promise<void>;
  className?: string;
}

export const ReleaseArchive: React.FC<ReleaseArchiveProps> = ({
  doorName,
  onCreateArchive,
  className = '',
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [options, setOptions] = useState<ArchiveOptions>({
    format: 'zip',
    includeSource: true,
    includeAssets: true,
    includeDocs: true,
    doormanCompatible: true,
  });

  const handleCreateArchive = async () => {
    setIsCreating(true);
    try {
      await onCreateArchive(options);
    } catch (error) {
      console.error('Failed to create archive:', error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className={`bg-[#1E1E1E] rounded-lg border border-gray-700 p-4 ${className}`}>
      <div className="flex items-center gap-3 mb-4">
        <Package className="w-5 h-5 text-blue-400" />
        <h3 className="text-lg font-semibold text-white">Release Archive</h3>
      </div>

      <div className="space-y-4">
        {/* Format selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Archive Format
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setOptions({ ...options, format: 'zip' })}
              className={`flex-1 px-3 py-2 rounded border transition-colors ${
                options.format === 'zip'
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
              }`}
            >
              .zip (Modern)
            </button>
            <button
              onClick={() => setOptions({ ...options, format: 'lha' })}
              className={`flex-1 px-3 py-2 rounded border transition-colors ${
                options.format === 'lha'
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
              }`}
            >
              .lha (Amiga)
            </button>
          </div>
        </div>

        {/* Include options */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">
            Include in Archive
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={options.includeSource}
              onChange={(e) =>
                setOptions({ ...options, includeSource: e.target.checked })
              }
              className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-600 focus:ring-blue-600 focus:ring-offset-gray-900"
            />
            <span className="text-sm text-gray-300">Source code (.ts/.js files)</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={options.includeAssets}
              onChange={(e) =>
                setOptions({ ...options, includeAssets: e.target.checked })
              }
              className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-600 focus:ring-blue-600 focus:ring-offset-gray-900"
            />
            <span className="text-sm text-gray-300">Assets (images, sounds, etc.)</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={options.includeDocs}
              onChange={(e) =>
                setOptions({ ...options, includeDocs: e.target.checked })
              }
              className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-600 focus:ring-blue-600 focus:ring-offset-gray-900"
            />
            <span className="text-sm text-gray-300">Documentation (README, etc.)</span>
          </label>
        </div>

        {/* Doorman compatibility */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={options.doormanCompatible}
              onChange={(e) =>
                setOptions({ ...options, doormanCompatible: e.target.checked })
              }
              className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-600 focus:ring-blue-600 focus:ring-offset-gray-900"
            />
            <span className="text-sm text-gray-300">
              Doorman compatible (include .info metadata)
            </span>
          </label>
          <p className="text-xs text-gray-500 mt-1 ml-6">
            Makes the archive installable via the BBS doorman utility
          </p>
        </div>

        {/* Create button */}
        <button
          onClick={handleCreateArchive}
          disabled={isCreating}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded font-medium transition-colors"
        >
          {isCreating ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              Creating Archive...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Create Release Archive
            </>
          )}
        </button>

        {/* Info */}
        <div className="text-xs text-gray-500 p-3 bg-gray-800 rounded">
          <p className="mb-1">
            <strong>Filename:</strong> {doorName}_v{'{version}'}.{options.format}
          </p>
          <p>
            The archive will include package.json, built JavaScript, and selected files.
          </p>
        </div>
      </div>
    </div>
  );
};
