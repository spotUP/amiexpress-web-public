/**
 * Confirmation on a Radix AlertDialog.
 *
 * The old modal was a div over a click-to-dismiss backdrop: no focus trap, no
 * escape handling, and nothing telling assistive technology a decision was
 * being asked for. It also let a destructive action sit one stray click away.
 *
 * `requireTypedConfirmation` is for actions that cannot be undone - deleting a
 * door, overwriting an .info file that already exists. The sysop types the
 * object's name back before the confirm button becomes usable.
 */

import { useEffect, useState } from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { AlertTriangle, Info, XCircle } from 'lucide-react';

export type ConfirmType = 'danger' | 'warning' | 'info';

const CONFIRM_ICON = {
  danger: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const CONFIRM_ICON_CLASS: Record<ConfirmType, string> = {
  danger: 'text-status-danger',
  warning: 'text-status-warn',
  info: 'text-status-info',
};

const CONFIRM_BUTTON_CLASS: Record<ConfirmType, string> = {
  danger: 'bg-status-danger text-content-inverse hover:bg-status-danger/90',
  warning: 'bg-status-warn text-content-inverse hover:bg-status-warn/90',
  info: 'bg-accent text-content-inverse hover:bg-accent-hover',
};

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: ConfirmType;
  /** When set, the confirm button stays disabled until this is typed back. */
  requireTypedConfirmation?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'warning',
  requireTypedConfirmation,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const Icon = CONFIRM_ICON[type];

  // A dialog reopened for a different object must not inherit the last answer.
  useEffect(() => {
    if (open) setTyped('');
  }, [open, requireTypedConfirmation]);

  const confirmBlocked = requireTypedConfirmation !== undefined && typed.trim() !== requireTypedConfirmation;

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in" />
        <AlertDialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-strong bg-surface-1 p-5 shadow-overlay data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95">
          <div className="flex items-start gap-3">
            <Icon size={18} className={`mt-0.5 shrink-0 ${CONFIRM_ICON_CLASS[type]}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <AlertDialogPrimitive.Title className="text-base font-semibold text-content-primary">
                {title}
              </AlertDialogPrimitive.Title>
              <AlertDialogPrimitive.Description className="mt-1 whitespace-pre-line text-sm text-content-secondary">
                {message}
              </AlertDialogPrimitive.Description>
            </div>
          </div>

          {requireTypedConfirmation !== undefined && (
            <label className="mt-4 block">
              <span className="block text-xs text-content-muted">
                Type <span className="font-mono text-content-primary">{requireTypedConfirmation}</span> to confirm
              </span>
              <input
                autoFocus
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                className="input-field mt-1 h-control w-full font-mono text-sm"
                aria-label={`Type ${requireTypedConfirmation} to confirm`}
              />
            </label>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <AlertDialogPrimitive.Cancel asChild>
              <button
                type="button"
                onClick={onCancel}
                className="h-control rounded border border-border bg-surface-2 px-3 text-sm text-content-secondary transition-colors hover:bg-surface-3 hover:text-content-primary"
              >
                {cancelText}
              </button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <button
                type="button"
                disabled={confirmBlocked}
                onClick={onConfirm}
                className={`h-control rounded px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${CONFIRM_BUTTON_CLASS[type]}`}
              >
                {confirmText}
              </button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
