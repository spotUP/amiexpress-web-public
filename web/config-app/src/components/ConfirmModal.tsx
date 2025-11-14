import { AlertTriangle, Info, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'warning',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => setIsVisible(true), 10);
    }
  }, [isOpen]);

  const handleConfirm = () => {
    setIsVisible(false);
    setTimeout(onConfirm, 200);
  };

  const handleCancel = () => {
    setIsVisible(false);
    setTimeout(onCancel, 200);
  };

  const getIcon = () => {
    switch (type) {
      case 'danger':
        return <XCircle size={48} className="text-red-400" />;
      case 'warning':
        return <AlertTriangle size={48} className="text-yellow-400" />;
      case 'info':
      default:
        return <Info size={48} className="text-blue-400" />;
    }
  };

  const getConfirmButtonClass = () => {
    switch (type) {
      case 'danger':
        return 'bg-red-600 hover:bg-red-700 border-red-500';
      case 'warning':
        return 'bg-yellow-600 hover:bg-yellow-700 border-yellow-500';
      case 'info':
      default:
        return 'bg-blue-600 hover:bg-blue-700 border-blue-500';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className={`
          absolute inset-0 bg-black transition-opacity duration-300
          ${isVisible ? 'opacity-50' : 'opacity-0'}
        `}
        onClick={handleCancel}
      />

      {/* Modal */}
      <div
        className={`
          relative bg-bbs-surface border-2 border-bbs-primary rounded-lg shadow-2xl
          max-w-md w-full mx-4 p-6 transform transition-all duration-300
          ${isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}
        `}
      >
        {/* Icon */}
        <div className="flex justify-center mb-4">{getIcon()}</div>

        {/* Title */}
        <h2 className="text-xl font-bold text-bbs-text text-center mb-3">{title}</h2>

        {/* Message */}
        <p className="text-bbs-muted text-center mb-6 whitespace-pre-line">{message}</p>

        {/* Buttons */}
        <div className="flex space-x-3">
          <button
            onClick={handleCancel}
            className="flex-1 px-4 py-2 bg-bbs-primary hover:bg-bbs-primary/80 border border-bbs-primary text-bbs-text rounded transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={`flex-1 px-4 py-2 border text-white rounded transition-colors ${getConfirmButtonClass()}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
