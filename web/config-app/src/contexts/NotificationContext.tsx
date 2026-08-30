import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { Toast, ToastProvider } from '../components/ui/Toast';
import type { ToastType } from '../components/ui/Toast';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import type { ConfirmType } from '../components/ui/ConfirmDialog';

/**
 * The public surface here is unchanged - showSuccess, showError, showInfo,
 * showWarning, showToast and confirm keep their exact signatures, so none of
 * the pages that call them change. Only the implementation moved onto Radix.
 *
 * `confirm` gains one optional field, `requireTypedConfirmation`. Callers that
 * do not pass it behave exactly as before.
 */

interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
  open: boolean;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: ConfirmType;
  /**
   * For an action that cannot be undone: the sysop types this value back
   * before the confirm button becomes usable.
   */
  requireTypedConfirmation?: string;
}

interface NotificationContextType {
  showToast: (message: string, type?: ToastType) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
  showWarning: (message: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

let toastSequence = 0;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    // A counter, not Math.random: two toasts raised in the same millisecond
    // must not be able to collide on a key.
    toastSequence += 1;
    const id = `toast-${toastSequence}`;
    setToasts((current) => [...current, { id, message, type, open: true }]);
  }, []);

  const showSuccess = useCallback((message: string) => showToast(message, 'success'), [showToast]);
  const showError = useCallback((message: string) => showToast(message, 'error'), [showToast]);
  const showInfo = useCallback((message: string) => showToast(message, 'info'), [showToast]);
  const showWarning = useCallback((message: string) => showToast(message, 'warning'), [showToast]);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setConfirmDialog({ options, resolve });
      }),
    []
  );

  const closeConfirm = useCallback(
    (answer: boolean) => {
      confirmDialog?.resolve(answer);
      setConfirmDialog(null);
    },
    [confirmDialog]
  );

  // Radix animates the exit, so the toast is marked closed first and dropped
  // once it is gone.
  const setToastOpen = useCallback((id: string, open: boolean) => {
    setToasts((current) =>
      open ? current : current.map((toast) => (toast.id === id ? { ...toast, open: false } : toast))
    );
    if (!open) {
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, 300);
    }
  }, []);

  return (
    <NotificationContext.Provider
      value={{ showToast, showSuccess, showError, showInfo, showWarning, confirm }}
    >
      <ToastProvider>
        {children}

        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            open={toast.open}
            onOpenChange={(open) => setToastOpen(toast.id, open)}
          />
        ))}

        {confirmDialog && (
          <ConfirmDialog
            open
            title={confirmDialog.options.title}
            message={confirmDialog.options.message}
            confirmText={confirmDialog.options.confirmText}
            cancelText={confirmDialog.options.cancelText}
            type={confirmDialog.options.type}
            requireTypedConfirmation={confirmDialog.options.requireTypedConfirmation}
            onConfirm={() => closeConfirm(true)}
            onCancel={() => closeConfirm(false)}
          />
        )}
      </ToastProvider>
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
}
