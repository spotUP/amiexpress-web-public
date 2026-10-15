import React, { useState } from 'react';
import { Plus, X, Terminal as TerminalIcon } from 'lucide-react';

export interface TerminalTab {
  id: string;
  name: string;
  output?: string[];  // Optional for fixed tabs
  active: boolean;
}

interface TerminalTabsProps {
  tabs: TerminalTab[];
  activeTab?: string;  // Add explicit activeTab prop
  onTabChange: (tabId: string) => void;
  onTabClose?: (tabId: string) => void;  // Optional
  onTabCreate?: () => void;  // Optional
  onTabRename?: (tabId: string, newName: string) => void;  // Optional
}

export const TerminalTabs: React.FC<TerminalTabsProps> = ({
  tabs,
  activeTab,
  onTabChange,
  onTabClose,
  onTabCreate,
  onTabRename,
}) => {
  const [renamingTab, setRenamingTab] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const handleRename = (tabId: string) => {
    if (newName.trim() && onTabRename) {
      onTabRename(tabId, newName.trim());
    }
    setRenamingTab(null);
    setNewName('');
  };

  return (
    <div className="flex items-center gap-1 bg-[#1E1E1E] border-b border-gray-700 px-2 overflow-x-auto">
      {tabs.map((tab, index) => {
        const isActive = activeTab ? tab.id === activeTab : tab.active;
        return (
        <div
          key={tab.id}
          className={`
            group flex items-center gap-2 px-3 py-2 rounded-t border-t border-l border-r
            transition-all duration-200 min-w-[120px] max-w-[200px]
            ${
              isActive
                ? 'bg-[#252526] border-gray-700 text-white'
                : 'bg-[#1E1E1E] border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
            }
          `}
          style={{ animationDelay: `${index * 0.05}s` }}
        >
          <button
            onClick={() => onTabChange(tab.id)}
            className="flex items-center gap-2 flex-1 min-w-0"
          >
            <TerminalIcon className="w-4 h-4 flex-shrink-0" />
            {renamingTab === tab.id && onTabRename ? (
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={() => handleRename(tab.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(tab.id);
                  if (e.key === 'Escape') {
                    setRenamingTab(null);
                    setNewName('');
                  }
                }}
                className="flex-1 bg-transparent border-none outline-none text-sm"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                className="text-sm truncate"
                onDoubleClick={onTabRename ? (e) => {
                  e.stopPropagation();
                  setRenamingTab(tab.id);
                  setNewName(tab.name);
                } : undefined}
              >
                {tab.name}
              </span>
            )}
          </button>

          {tabs.length > 1 && onTabClose && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
              className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        );
      })}

      {/* New tab button - only show if onTabCreate is provided */}
      {onTabCreate && (
        <button
          onClick={onTabCreate}
          className="flex items-center gap-1 px-3 py-2 text-gray-500 hover:text-white hover:bg-gray-800/50 rounded-t transition-colors"
          title="New terminal"
        >
          <Plus className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default TerminalTabs;
