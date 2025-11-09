import React, { useState } from 'react';
import { Search, Star, Clock, Package, X, Wand2 } from 'lucide-react';
import { DoorListItem } from '../types';
import { formatRelativeTime } from '../utils/format';

interface DoorListProps {
  doors: DoorListItem[];
  selectedDoor: DoorListItem | null;
  onDoorSelect: (door: DoorListItem) => void;
  onToggleFavorite: (doorId: string) => void;
  onCreateNewGame?: () => void;
  className?: string;
}

export const DoorList: React.FC<DoorListProps> = ({
  doors,
  selectedDoor,
  onDoorSelect,
  onToggleFavorite,
  onCreateNewGame,
  className = '',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'favorites' | 'recent'>('all');

  const filteredDoors = doors.filter((door) => {
    // Apply search filter
    const matchesSearch =
      door.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      door.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      door.author.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    // Apply mode filter
    switch (filterMode) {
      case 'favorites':
        return door.favorite;
      case 'recent':
        return door.lastOpened > 0;
      default:
        return true;
    }
  });

  // Sort doors: favorites first, then by last opened
  const sortedDoors = [...filteredDoors].sort((a, b) => {
    if (a.favorite && !b.favorite) return -1;
    if (!a.favorite && b.favorite) return 1;
    return b.lastOpened - a.lastOpened;
  });

  return (
    <div className={`flex flex-col h-full bg-[#1E1E1E] border-r border-gray-700 ${className}`}>
      {/* Create New Game Button */}
      {onCreateNewGame && (
        <div className="p-3 border-b border-gray-700">
          <button
            onClick={onCreateNewGame}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg transition-all font-semibold shadow-lg hover:shadow-xl"
          >
            <Wand2 className="w-4 h-4" />
            Create with AI
          </button>
        </div>
      )}

      {/* Search bar */}
      <div className="p-3 border-b border-gray-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search doors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-8 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setFilterMode('all')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            filterMode === 'all'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilterMode('favorites')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            filterMode === 'favorites'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          <Star className="w-3 h-3 inline mr-1" />
          Favorites
        </button>
        <button
          onClick={() => setFilterMode('recent')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            filterMode === 'recent'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          <Clock className="w-3 h-3 inline mr-1" />
          Recent
        </button>
      </div>

      {/* Door list */}
      <div className="flex-1 overflow-y-auto">
        {sortedDoors.length === 0 ? (
          <div className="text-center text-gray-500 py-8 px-4">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">
              {searchQuery ? 'No doors match your search' : 'No doors available'}
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {sortedDoors.map((door) => {
              const isSelected = selectedDoor?.id === door.id;

              return (
                <div
                  key={door.id}
                  className={`group relative rounded-lg border transition-colors ${
                    isSelected
                      ? 'bg-blue-600 border-blue-500'
                      : 'bg-gray-800 border-gray-700 hover:bg-gray-700 hover:border-gray-600'
                  }`}
                >
                  <button
                    onClick={() => onDoorSelect(door)}
                    className="w-full text-left p-3"
                  >
                    {/* Thumbnail or icon */}
                    <div className="flex items-start gap-3">
                      {door.thumbnail ? (
                        <img
                          src={door.thumbnail}
                          alt={door.name}
                          className="w-12 h-12 rounded object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                          <Package className="w-6 h-6 text-white" />
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
                          <span>{door.author}</span>
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
                    className={`absolute top-2 right-2 p-1.5 rounded transition-colors ${
                      door.favorite
                        ? 'text-yellow-400 hover:text-yellow-300'
                        : 'text-gray-500 hover:text-yellow-400 opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    <Star
                      className={`w-4 h-4 ${door.favorite ? 'fill-current' : ''}`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="p-3 border-t border-gray-700 text-xs text-gray-400">
        {sortedDoors.length} {sortedDoors.length === 1 ? 'door' : 'doors'}
        {searchQuery && ` matching "${searchQuery}"`}
      </div>
    </div>
  );
};
