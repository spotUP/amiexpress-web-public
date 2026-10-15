/**
 * Modal - Centered modal dialog component
 *
 * Responsive and centered in all resolutions
 */

import { ReactNode, useEffect } from 'react';
import './Modal.css';

export interface ModalProps {
  isOpen: boolean;
  onClose?: () => void;
  title?: string;
  children: ReactNode;
  showCloseButton?: boolean;
}

export function Modal({ isOpen, onClose, title, children, showCloseButton = true }: ModalProps) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        {showCloseButton && onClose && (
          <button className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        )}
        {title && (
          <div className="modal-header">
            <h2>{title}</h2>
          </div>
        )}
        <div className="modal-content">
          {children}
        </div>
      </div>
    </div>
  );
}

export interface ModalButtonsProps {
  children: ReactNode;
}

export function ModalButtons({ children }: ModalButtonsProps) {
  return <div className="modal-buttons">{children}</div>;
}

export interface ModalButtonProps {
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  children: ReactNode;
  disabled?: boolean;
}

export function ModalButton({ onClick, variant = 'primary', children, disabled }: ModalButtonProps) {
  return (
    <button
      className={`modal-button modal-button-${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
