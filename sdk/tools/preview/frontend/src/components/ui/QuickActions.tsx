import React, { useState } from 'react';
import { Plus, Play, Hammer, Save, Camera, Wand2, X } from 'lucide-react';

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  action: () => void;
}

interface QuickActionsProps {
  actions: QuickAction[];
  position?: 'bottom-right' | 'bottom-left';
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  actions,
  position = 'bottom-right',
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const positionClasses = {
    'bottom-right': 'bottom-6 right-6',
    'bottom-left': 'bottom-6 left-6',
  };

  return (
    <div className={`fixed ${positionClasses[position]} z-50`}>
      {/* Action buttons */}
      {isOpen && (
        <div className="absolute bottom-16 right-0 flex flex-col gap-2 mb-2 animate-slideUp">
          {actions.map((action, index) => (
            <button
              key={action.id}
              onClick={() => {
                action.action();
                setIsOpen(false);
              }}
              className={`
                group flex items-center gap-3 px-4 py-2.5 rounded-full shadow-2xl
                transition-all duration-300 hover:scale-110 active:scale-95
                ${action.color}
                animate-fadeIn
              `}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="w-5 h-5 transition-transform group-hover:scale-125">
                {action.icon}
              </div>
              <span className="font-medium whitespace-nowrap">{action.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main FAB button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-14 h-14 rounded-full shadow-2xl
          flex items-center justify-center
          transition-all duration-300 hover:scale-110 active:scale-95
          ${isOpen ? 'bg-red-600 hover:bg-red-700 rotate-45' : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 animate-glowPulse'}
        `}
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <Plus className="w-6 h-6 text-white" />
        )}
      </button>
    </div>
  );
};

export default QuickActions;
