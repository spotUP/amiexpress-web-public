/**
 * Toasts on Radix.
 *
 * The hand-rolled version animated with a pair of setTimeouts, could not be
 * dismissed from the keyboard, and announced nothing to a screen reader.
 * Radix gives focus management, the escape and swipe behaviour, and the live
 * region; the styling is ours.
 */

import * as ToastPrimitive from '@radix-ui/react-toast';
import { AlertTriangle, CheckCircle, Info, X, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

const TOAST_ICON = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const TOAST_ICON_CLASS: Record<ToastType, string> = {
  success: 'text-status-ok',
  error: 'text-status-danger',
  warning: 'text-status-warn',
  info: 'text-status-info',
};

const TOAST_BORDER: Record<ToastType, string> = {
  success: 'border-status-ok/40',
  error: 'border-status-danger/40',
  warning: 'border-status-warn/40',
  info: 'border-border-strong',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <ToastPrimitive.Provider duration={5000} swipeDirection="right">
      {children}
      <ToastPrimitive.Viewport className="fixed right-4 top-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none" />
    </ToastPrimitive.Provider>
  );
}

interface ToastProps {
  message: string;
  type: ToastType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function Toast({ message, type, open, onOpenChange }: ToastProps) {
  const Icon = TOAST_ICON[type];

  return (
    <ToastPrimitive.Root
      open={open}
      onOpenChange={onOpenChange}
      className={`flex items-start gap-3 rounded-lg border bg-surface-2 p-3 shadow-overlay data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:slide-in-from-right-4 data-[swipe=end]:animate-out ${TOAST_BORDER[type]}`}
    >
      <Icon size={16} className={`mt-0.5 shrink-0 ${TOAST_ICON_CLASS[type]}`} aria-hidden="true" />
      <ToastPrimitive.Description className="min-w-0 flex-1 whitespace-pre-line text-sm text-content-primary">
        {message}
      </ToastPrimitive.Description>
      <ToastPrimitive.Close
        aria-label="Dismiss"
        className="shrink-0 text-content-muted transition-colors hover:text-content-primary"
      >
        <X size={14} aria-hidden="true" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}
