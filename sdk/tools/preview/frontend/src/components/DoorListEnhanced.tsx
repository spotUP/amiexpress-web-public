import React, { useState } from 'react';
import { Search, Star, Clock, Package, X, Wand2, Play, FileCode, Trash2, Download } from 'lucide-react';
import { DoorListItem } from '../types';
import { formatRelativeTime } from '../utils/format';
import { DoorListSkeleton } from './ui/Skeleton';
import { ContextMenuWrapper, ContextMenuItem } from './ui/ContextMenu';

interface DoorListEnhancedProps {
  doors: DoorListItem[];
  selectedDoor: DoorListItem | null;
  onDoorSelect: (door: DoorListItem) => void;
  onToggleFavorite: (doorId: string) => void;
  onCreateNewGame?: () => void;
  onBuildDoor?: (doorId: string) => void;
  onRunDoor?: (doorId: string) => void;
  onDeleteDoor?: (doorId: string) => void;
  loading?: boolean;
  className?: string;
}

export const DoorListEnhanced: React.FC<DoorListEnhancedProps> = ({
  doors,
  selectedDoor,
  onDoorSelect,
  onToggleFavorite,
  onCreateNewGame,
  onBuildDoor,
  onRunDoor,
  onDeleteDoor,
  loading = false,
  className = '',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'favorites' | 'recent'>('all');

  const filteredDoors = doors.filter((door) => {
    const matchesSearch =
      door.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      door.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      door.author?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    switch (filterMode) {
      case 'favorites':
        return door.favorite;
      case 'recent':
        return door.lastOpened > 0;
      default:
        return true;
    }
  });

  // Keep doors in their original order - don't rearrange when selected
  const sortedDoors = filteredDoors;

  const getContextMenu = (door: DoorListItem): ContextMenuItem[] => [
    {
      id: 'run',
      label: 'Build & Run Door',
      icon: <Play className="w-4 h-4" />,
      shortcut: 'Enter',
      onClick: () => onRunDoor?.(door.id),
    },
    {
      id: 'favorite',
      label: door.favorite ? 'Remove from Favorites' : 'Add to Favorites',
      icon: <Star className={`w-4 h-4 ${door.favorite ? 'fill-current' : ''}`} />,
      onClick: () => onToggleFavorite(door.id),
    },
    { id: 'sep1', label: '', separator: true },
    {
      id: 'view-files',
      label: 'View Files',
      icon: <FileCode className="w-4 h-4" />,
      onClick: () => onDoorSelect(door),
    },
    {
      id: 'export',
      label: 'Export Archive',
      icon: <Download className="w-4 h-4" />,
      onClick: () => {},
    },
    { id: 'sep2', label: '', separator: true },
    {
      id: 'delete',
      label: 'Delete Door',
      icon: <Trash2 className="w-4 h-4" />,
      danger: true,
      onClick: () => onDeleteDoor?.(door.id),
    },
  ];

  return (
    <div className={`flex flex-col h-full bg-[#1E1E1E] border-r border-gray-700 ${className}`}>
      {/* Create New Game Button with enhanced animations */}
      {onCreateNewGame && (
        <div className="p-3 border-b border-gray-700 animate-slideDown">
          <button
            onClick={onCreateNewGame}
            className="group w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg transition-all duration-300 font-semibold hover:scale-105 active:scale-95"
          >
            <Wand2 className="w-4 h-4 transition-transform group-hover:rotate-12 group-hover:scale-110" />
            <span>Create with AI</span>
          </button>
        </div>
      )}

      {/* Search bar with enhanced animations */}
      <div className="p-3 border-b border-gray-700 animate-slideDown" style={{animationDelay: '0.1s'}}>
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 transition-all group-focus-within:text-blue-400 group-focus-within:scale-110" />
          <input
            type="text"
            placeholder="Search doors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-8 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all duration-200 hover:bg-gray-750 focus:bg-gray-800"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-all duration-200 hover:scale-110 active:scale-95 hover:rotate-90"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs with enhanced animations */}
      <div className="flex border-b border-gray-700 bg-gray-900/50 backdrop-blur-sm animate-slideDown" style={{animationDelay: '0.2s'}}>
        {[
          { mode: 'all' as const, label: 'All' },
          { mode: 'favorites' as const, label: 'Favorites', icon: Star },
          { mode: 'recent' as const, label: 'Recent', icon: Clock },
        ].map(({ mode, label, icon: Icon }) => (
          <button
            key={mode}
            onClick={() => setFilterMode(mode)}
            className={`
              relative flex-1 px-3 py-2 text-xs font-medium transition-all duration-300
              ${
                filterMode === mode
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }
              hover:scale-105 active:scale-95
            `}
          >
            {Icon && <Icon className={`w-3 h-3 inline mr-1 transition-transform ${filterMode === mode ? 'scale-110' : ''}`} />}
            {label}
            {filterMode === mode && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400 animate-shimmer" />
            )}
          </button>
        ))}
      </div>

      {/* Door list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <DoorListSkeleton count={5} />
        ) : sortedDoors.length === 0 ? (
          <div className="text-center text-gray-500 py-8 px-4 animate-fade-in">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">
              {searchQuery ? 'No doors match your search' : 'No doors available'}
            </p>
            {onCreateNewGame && (
              <button
                onClick={onCreateNewGame}
                className="mt-4 text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
              >
                Create your first door
              </button>
            )}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {sortedDoors.map((door, index) => {
              const isSelected = selectedDoor?.id === door.id;

              return (
                <ContextMenuWrapper key={door.id} items={getContextMenu(door)}>
                  <div
                    className={`
                      group relative rounded-lg border transition-all duration-300
                      animate-fadeIn hover:scale-[1.02] active:scale-[0.98]
                      ${
                        isSelected
                          ? 'bg-gradient-to-r from-blue-600 to-blue-500 border-blue-400 scale-[1.02]'
                          : 'bg-gray-800 border-gray-700 hover:bg-gray-700 hover:border-gray-600'
                      }
                    `}
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <button
                      onClick={() => onDoorSelect(door)}
                      className="w-full text-left p-3"
                    >
                      <div className="flex items-start gap-3">
                        {door.thumbnail ? (
                          <img
                            src={door.thumbnail}
                            alt={door.name}
                            className="w-12 h-12 rounded object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                            <Package className="w-6 h-6 text-white transition-transform group-hover:scale-110" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium text-sm text-white truncate">
                              {door.name}
                            </h3>
                            <span className="text-xs text-gray-400">{door.version}</span>
                          </div>
                          <p className="text-xs text-gray-400 line-clamp-2 mb-1">
                            {door.description}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            {door.author && <span>{door.author}</span>}
                            {door.lastOpened > 0 && (
                              <>
                                <span>•</span>
                                <span>{formatRelativeTime(door.lastOpened)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>

                    {/* Favorite button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(door.id);
                      }}
                      className={`
                        absolute top-2 right-2 p-1.5 rounded transition-all
                        ${
                          door.favorite
                            ? 'text-yellow-400 hover:text-yellow-300 scale-100'
                            : 'text-gray-500 hover:text-yellow-400 opacity-0 group-hover:opacity-100'
                        }
                      `}
                    >
                      <Star
                        className={`w-4 h-4 ${door.favorite ? 'fill-current animate-bounce-in' : ''}`}
                      />
                    </button>
                  </div>
                </ContextMenuWrapper>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="p-3 border-t border-gray-700 text-xs text-gray-400 bg-gray-800/30">
        <div className="flex items-center justify-between">
          <span>
            {sortedDoors.length} {sortedDoors.length === 1 ? 'door' : 'doors'}
            {searchQuery && ` matching "${searchQuery}"`}
          </span>
          {doors.filter((d) => d.favorite).length > 0 && (
            <span className="flex items-center gap-1">
              <Star className="w-3 h-3 text-yellow-400 fill-current" />
              {doors.filter((d) => d.favorite).length}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
