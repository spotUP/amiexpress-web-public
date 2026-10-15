import React, { useEffect, useState } from 'react';
import { X, Search, Keyboard } from 'lucide-react';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  category?: string;
}

interface KeyboardOverlayProps {
  shortcuts: KeyboardShortcut[];
  onClose: () => void;
}

export const KeyboardOverlay: React.FC<KeyboardOverlayProps> = ({ shortcuts, onClose }) => {
  const [search, setSearch] = useState('');
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 200);
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  const filteredShortcuts = shortcuts.filter(
    (shortcut) =>
      shortcut.description.toLowerCase().includes(search.toLowerCase()) ||
      shortcut.key.toLowerCase().includes(search.toLowerCase())
  );

  const groupedShortcuts = filteredShortcuts.reduce((acc, shortcut) => {
    const category = shortcut.category || 'General';
    if (!acc[category]) acc[category] = [];
    acc[category].push(shortcut);
    return acc;
  }, {} as Record<string, KeyboardShortcut[]>);

  const renderKey = (key: string) => (
    <kbd className="px-2 py-1 text-xs font-semibold text-white bg-gray-700 border border-gray-600 rounded shadow-sm">
      {key}
    </kbd>
  );

  const renderShortcut = (shortcut: KeyboardShortcut) => {
    const keys: string[] = [];
    if (shortcut.ctrl) keys.push('Ctrl');
    if (shortcut.shift) keys.push('Shift');
    if (shortcut.alt) keys.push('Alt');
    keys.push(shortcut.key.toUpperCase());

    return (
      <div key={`${shortcut.key}-${shortcut.description}`} className="flex items-center justify-between py-2">
        <span className="text-sm text-gray-300">{shortcut.description}</span>
        <div className="flex items-center gap-1">
          {keys.map((key, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="text-gray-500 mx-1">+</span>}
              {renderKey(key)}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      className={`
        fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm
        ${isVisible ? 'animate-fade-in' : 'animate-fade-out'}
      `}
      onClick={handleClose}
    >
      <div
        className={`
          bg-[#1E1E1E] border border-gray-700 rounded-lg shadow-2xl
          w-full max-w-3xl max-h-[80vh] overflow-hidden
          ${isVisible ? 'animate-scale-in' : 'animate-scale-out'}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Keyboard className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-bold text-white">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search shortcuts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              autoFocus
            />
          </div>
        </div>

        {/* Shortcuts list */}
        <div className="overflow-y-auto max-h-[calc(80vh-200px)] p-4">
          {Object.keys(groupedShortcuts).length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <Keyboard className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No shortcuts found</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedShortcuts).map(([category, shortcuts]) => (
                <div key={category}>
                  <h3 className="text-sm font-semibold text-blue-400 mb-3 uppercase tracking-wide">
                    {category}
                  </h3>
                  <div className="space-y-1 bg-gray-800/50 rounded-lg p-3">
                    {shortcuts.map(renderShortcut)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-800/50 text-center text-xs text-gray-400">
          Press <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">?</kbd> to toggle this overlay
        </div>
      </div>
    </div>
  );
};
