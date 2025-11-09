import React, { useState, useRef, DragEvent } from 'react';
import { GripVertical } from 'lucide-react';

export interface DraggableItem {
  id: string;
  [key: string]: any;
}

interface DragDropListProps<T extends DraggableItem> {
  items: T[];
  onReorder: (items: T[]) => void;
  renderItem: (item: T, isDragging: boolean) => React.ReactNode;
  className?: string;
  dragHandleClassName?: string;
}

export function DragDropList<T extends DraggableItem>({
  items,
  onReorder,
  renderItem,
  className = '',
  dragHandleClassName = '',
}: DragDropListProps<T>) {
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);
  const dragCounter = useRef(0);

  const handleDragStart = (e: DragEvent<HTMLDivElement>, itemId: string) => {
    setDraggedItem(itemId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', itemId);

    // Add visual feedback
    if (e.currentTarget) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (e: DragEvent<HTMLDivElement>) => {
    setDraggedItem(null);
    setDragOverItem(null);
    dragCounter.current = 0;

    // Reset opacity
    if (e.currentTarget) {
      e.currentTarget.style.opacity = '1';
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>, itemId: string) => {
    e.preventDefault();
    dragCounter.current++;

    if (draggedItem !== itemId) {
      setDragOverItem(itemId);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounter.current--;

    if (dragCounter.current === 0) {
      setDragOverItem(null);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, targetItemId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedItem || draggedItem === targetItemId) {
      return;
    }

    const draggedIndex = items.findIndex(item => item.id === draggedItem);
    const targetIndex = items.findIndex(item => item.id === targetItemId);

    if (draggedIndex === -1 || targetIndex === -1) {
      return;
    }

    // Create new array with reordered items
    const newItems = [...items];
    const [removed] = newItems.splice(draggedIndex, 1);
    newItems.splice(targetIndex, 0, removed);

    onReorder(newItems);
    setDraggedItem(null);
    setDragOverItem(null);
    dragCounter.current = 0;
  };

  return (
    <div className={className}>
      {items.map((item) => {
        const isDragging = draggedItem === item.id;
        const isDragOver = dragOverItem === item.id;

        return (
          <div
            key={item.id}
            draggable
            onDragStart={(e) => handleDragStart(e, item.id)}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragEnter={(e) => handleDragEnter(e, item.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, item.id)}
            className={`
              relative transition-all duration-200
              ${isDragging ? 'opacity-50 scale-95' : ''}
              ${isDragOver ? 'border-t-2 border-blue-500' : ''}
            `}
          >
            {/* Drag handle */}
            <div className={`absolute left-2 top-1/2 -translate-y-1/2 cursor-move text-gray-500 hover:text-gray-300 transition-colors z-10 ${dragHandleClassName}`}>
              <GripVertical className="w-4 h-4" />
            </div>

            {/* Item content */}
            <div className={`${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}>
              {renderItem(item, isDragging)}
            </div>

            {/* Drop indicator */}
            {isDragOver && (
              <div className="absolute inset-x-0 -top-1 h-1 bg-blue-500 animate-pulse" />
            )}
          </div>
        );
      })}

      <style>{`
        @keyframes drag-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

export default DragDropList;
