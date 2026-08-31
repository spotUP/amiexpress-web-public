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
  /**
   * An extra decision the dialog carries, answered with the confirmation.
   *
   * `confirm` still resolves false on cancel; on confirm it resolves the
   * checkbox's state, so a caller that asked for one reads it straight out of
   * the answer instead of keeping page state the dialog knows nothing about.
   */
  checkbox?: {
    label: string;
    description?: string;
    defaultChecked?: boolean;
  };
}

/**
 * What a confirm with a checkbox answers.
 *
 * Not a bare boolean: "confirmed, box unticked" and "cancelled" are different
 * answers, and collapsing them into false would have deleted nothing while
 * looking like it worked - or worse, the other way round.
 */
export interface ConfirmWithCheckboxResult {
  confirmed: boolean;
  checked: boolean;
}

interface NotificationContextType {
  showToast: (message: string, type?: ToastType) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
  showWarning: (message: string) => void;
  confirm: {
    (options: ConfirmOptions & { checkbox: NonNullable<ConfirmOptions['checkbox']> }): Promise<ConfirmWithCheckboxResult>;
    (options: ConfirmOptions): Promise<boolean>;
  };
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

let toastSequence = 0;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean | ConfirmWithCheckboxResult) => void;
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
    ((options: ConfirmOptions) =>
      new Promise<boolean | ConfirmWithCheckboxResult>((resolve) => {
        setConfirmDialog({ options, resolve });
      })) as NotificationContextType['confirm'],
    []
  );

  const closeConfirm = useCallback(
    (confirmed: boolean, checked = false) => {
      const options = confirmDialog?.options;
      confirmDialog?.resolve(options?.checkbox ? { confirmed, checked } : confirmed);
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
            checkbox={confirmDialog.options.checkbox}
            onConfirm={(checked) => closeConfirm(true, checked)}
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
