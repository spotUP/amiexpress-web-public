/**
 * An editing dialog, on Radix Dialog.
 *
 * Nine pages hand-rolled one: a `fixed inset-0` div over a dimmed backdrop,
 * with no `role="dialog"`, no focus trap, no Escape handler and nothing
 * telling assistive technology that the rest of the page had gone away. A
 * keyboard user could tab straight out of the form and into the table behind
 * it, and never get back.
 *
 * ConfirmDialog and Toast moved to Radix for exactly this reason; this is the
 * same move for the editing dialogs. The visual shell is unchanged, so the
 * pages keep their own layout inside it.
 */

import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

interface ModalProps {
  open: boolean;
  /** Announced as the dialog's name, and shown as its heading. */
  title: string;
  /** Called on Escape, on a backdrop click, and by the close button. */
  onClose: () => void;
  /** Tailwind max-width class; the pages use lg, 2xl and 4xl. */
  maxWidth?: string;
  /**
   * Draw the heading, or leave it to the caller.
   *
   * Several dialogs have a sticky header bar of their own, with a close
   * button in it. Those keep their header and get the accessible name from a
   * visually hidden title instead, so a screen reader still announces the
   * dialog by name.
   */
  showHeader?: boolean;
  children: ReactNode;
}

export function Modal({
  open,
  title,
  onClose,
  maxWidth = 'max-w-lg',
  showHeader = true,
  children,
}: ModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content
          className={`fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full ${maxWidth} -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg shadow-xl ${
            showHeader
              ? 'border border-border bg-surface-1 p-6'
              : 'border border-border bg-surface-1'
          }`}
        >
          <DialogPrimitive.Title
            className={showHeader ? 'text-xl font-semibold text-content-primary mb-4' : 'sr-only'}
          >
            {title}
          </DialogPrimitive.Title>
          {/* Radix warns without one, and a form's own labels are the
              description a sysop actually reads. */}
          <DialogPrimitive.Description className="sr-only">
            {title}
          </DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
