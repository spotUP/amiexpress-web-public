import React, { useEffect, useRef, useState } from 'react';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  onClick?: () => void;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ items, position, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  useEffect(() => {
    if (menuRef.current) {
      const menu = menuRef.current;
      const menuRect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let { x, y } = position;

      // Adjust horizontal position if menu overflows
      if (x + menuRect.width > viewportWidth) {
        x = viewportWidth - menuRect.width - 8;
      }

      // Adjust vertical position if menu overflows
      if (y + menuRect.height > viewportHeight) {
        y = viewportHeight - menuRect.height - 8;
      }

      setAdjustedPosition({ x, y });
    }
  }, [position]);

  const handleItemClick = (item: ContextMenuItem) => {
    if (item.disabled) return;
    item.onClick?.();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-[#252526] border border-gray-700 rounded-lg shadow-2xl py-1 min-w-[200px] animate-scale-in"
      style={{
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
      }}
    >
      {items.map((item, index) =>
        item.separator ? (
          <div key={`separator-${index}`} className="my-1 border-t border-gray-700" />
        ) : (
          <button
            key={item.id}
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
            className={`
              w-full flex items-center justify-between px-3 py-2 text-sm
              transition-colors text-left
              ${
                item.disabled
                  ? 'text-gray-600 cursor-not-allowed'
                  : item.danger
                  ? 'text-red-400 hover:bg-red-500/10'
                  : 'text-gray-300 hover:bg-blue-500/10 hover:text-white'
              }
            `}
          >
            <div className="flex items-center gap-2">
              {item.icon && <span className="w-4 h-4">{item.icon}</span>}
              <span>{item.label}</span>
            </div>
            {item.shortcut && (
              <kbd className="px-1.5 py-0.5 text-xs font-mono bg-gray-700 rounded text-gray-400">
                {item.shortcut}
              </kbd>
            )}
          </button>
        )
      )}
    </div>
  );
};

interface ContextMenuWrapperProps {
  children: React.ReactNode;
  items: ContextMenuItem[];
  disabled?: boolean;
}

export const ContextMenuWrapper: React.FC<ContextMenuWrapperProps> = ({
  children,
  items,
  disabled = false,
}) => {
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    setMenuPosition({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div onContextMenu={handleContextMenu}>{children}</div>
      {menuPosition && (
        <ContextMenu
          items={items}
          position={menuPosition}
          onClose={() => setMenuPosition(null)}
        />
      )}
    </>
  );
};
