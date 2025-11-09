import React, { useState, useEffect, useRef } from 'react';
import { Search, Command, X } from 'lucide-react';

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  shortcut?: string;
  category?: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandItem[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  commands,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredCommands = commands.filter((cmd) =>
    `${cmd.label} ${cmd.description || ''} ${cmd.category || ''}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase())
  );

  // Group by category
  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    const category = cmd.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(cmd);
    return acc;
  }, {} as Record<string, CommandItem[]>);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setSearchQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action();
            onClose();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredCommands, onClose]);

  if (!isOpen) return null;

  let currentIndex = 0;

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-20 animate-fadeIn">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Command Palette */}
      <div className="relative w-full max-w-2xl mx-4 bg-gray-900 rounded-xl shadow-2xl border border-gray-700 overflow-hidden animate-slideDown">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700 bg-gray-800/50">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-500"
          />
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto p-2">
          {Object.keys(groupedCommands).length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No commands found
            </div>
          ) : (
            Object.entries(groupedCommands).map(([category, categoryCommands]) => (
              <div key={category} className="mb-4">
                <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {category}
                </div>
                {categoryCommands.map((cmd) => {
                  const itemIndex = currentIndex++;
                  const isSelected = itemIndex === selectedIndex;

                  return (
                    <button
                      key={cmd.id}
                      onClick={() => {
                        cmd.action();
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(itemIndex)}
                      className={`
                        w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all
                        ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'hover:bg-gray-800 text-gray-300'
                        }
                      `}
                    >
                      {cmd.icon && (
                        <div className="flex-shrink-0 w-5 h-5">
                          {cmd.icon}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{cmd.label}</div>
                        {cmd.description && (
                          <div className="text-xs opacity-75 truncate">
                            {cmd.description}
                          </div>
                        )}
                      </div>
                      {cmd.shortcut && (
                        <div className="flex-shrink-0 flex items-center gap-1">
                          {cmd.shortcut.split('+').map((key, i) => (
                            <kbd
                              key={i}
                              className={`
                                px-1.5 py-0.5 rounded text-xs font-mono border
                                ${
                                  isSelected
                                    ? 'bg-blue-700 border-blue-500'
                                    : 'bg-gray-800 border-gray-600'
                                }
                              `}
                            >
                              {key}
                            </kbd>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-700 bg-gray-800/50 text-xs text-gray-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Command className="w-3 h-3" />K to open
            </span>
            <span>↑↓ to navigate</span>
            <span>↵ to select</span>
          </div>
          <span>ESC to close</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
