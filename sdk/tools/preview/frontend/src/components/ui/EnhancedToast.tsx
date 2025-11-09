import React from 'react';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface EnhancedToastProps {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  duration?: number;
  actions?: ToastAction[];
  progress?: number;
  onClose: () => void;
}

export const EnhancedToast: React.FC<EnhancedToastProps> = ({
  type,
  title,
  message,
  actions,
  progress,
  onClose,
}) => {
  const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-500" />,
    error: <XCircle className="w-5 h-5 text-red-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
    warning: <AlertTriangle className="w-5 h-5 text-yellow-500" />,
  };

  const colors = {
    success: 'bg-green-900/20 border-green-500/50',
    error: 'bg-red-900/20 border-red-500/50',
    info: 'bg-blue-900/20 border-blue-500/50',
    warning: 'bg-yellow-900/20 border-yellow-500/50',
  };

  return (
    <div
      className={`
        ${colors[type]}
        border rounded-lg shadow-2xl p-4 min-w-[300px] max-w-md
        animate-toast-enter backdrop-blur-sm
      `}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 mt-0.5">{icons[type]}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-white mb-1">{title}</h4>
          {message && <p className="text-sm text-gray-300 mb-2">{message}</p>}

          {/* Progress bar */}
          {progress !== undefined && (
            <div className="w-full bg-gray-700 rounded-full h-1.5 mb-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {/* Actions */}
          {actions && actions.length > 0 && (
            <div className="flex gap-2 mt-3">
              {actions.map((action, index) => (
                <button
                  key={index}
                  onClick={() => {
                    action.onClick();
                    onClose();
                  }}
                  className="px-3 py-1 text-xs font-medium bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="flex-shrink-0 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// Toast container component
interface EnhancedToastContainerProps {
  toasts: EnhancedToastProps[];
  onClose: (id: string) => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export const EnhancedToastContainer: React.FC<EnhancedToastContainerProps> = ({
  toasts,
  onClose,
  position = 'top-right',
}) => {
  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
  };

  return (
    <div className={`fixed ${positionClasses[position]} z-[9999] flex flex-col gap-2`}>
      {toasts.map((toast) => (
        <EnhancedToast key={toast.id} {...toast} onClose={() => onClose(toast.id)} />
      ))}
    </div>
  );
};

export default EnhancedToast;
