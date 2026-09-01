/**
 * Modal dialogs, replacing the typed "naming mode" edit-screen.ts and
 * art-screen.ts each used to hand-roll (a `naming: string | null` field,
 * a keypress listener that diverted typed characters into it, and a
 * naming-branch in every space/delete/enter/escape handler).
 *
 * `screen.dialogOpen` is the ONE flag every screen-level key handler and
 * mouse handler in this door reads to refuse input while a dialog owns the
 * keyboard - and it is set true / cleared HERE, around the await, by these
 * two functions alone. It is never a call site's job to arm or disarm it.
 * That is the actual fix, not a stylistic preference: the old `naming`
 * guard leaked three times across this plan (studio 2b: keyboard ops fired
 * mid-name because a new op wasn't routed through the guarded wrapper;
 * studio 2c task 4: canvas click and drag painted mid-name because the new
 * mouse handlers were never told to check it) - every leak was a NEW INPUT
 * PATH that forgot to consult the guard, not the guard itself misbehaving.
 * Centralising the SET in one place cannot fix "a new handler forgot to
 * CHECK the flag" (nothing can - that is a one-line review item forever),
 * but it removes the OTHER half of the old bug class: a call site that
 * opens a dialog and forgets to arm the guard at all, or that arms it but
 * mismanages when it clears. dialogs.ts owns both halves of that
 * lifecycle; a caller only ever awaits a Promise.
 *
 * Why the guard is still needed at every call site despite that: neither
 * ConfirmModal (confirm-modal.ts) nor Textbox (textbox.ts) call
 * `screen.trapFocus()` - only the optional `saveFocus`/`focusPush`
 * bookkeeping, which does not suppress anything. Traced against
 * screen.ts's key-dispatch method: registered `screen.key()` handlers
 * (this door's opKey table, plus the raw escape/delete bindings) run
 * BEFORE the focused element's own keypress emit, and nothing skips them
 * unless `screen.trapFocus()` was called - which these dialogs don't call.
 * So the exact same keystroke a dialog's Textbox is consuming ALSO reaches
 * every screen.key() binding this door registers, same as it always did.
 * `screen.dialogOpen` is what stands in for the missing trap.
 */

import { Box, Textbox, ConfirmModal } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

/**
 * A centred, bordered single-line text prompt.
 *
 * Resolves the TRIMMED submitted value on Enter - a blank or whitespace-
 * only submit is refused (the dialog stays open; matches "validates
 * non-empty trimmed" from the task interface) - or `null` if ESC cancels
 * it. Works for any single-line name entry in this door: edit-screen.ts's
 * new-animation flow and art-screen.ts's new-file-name flow both share
 * this one function rather than each re-implementing a naming mode.
 *
 * Deliberately does NOT filter which characters can be typed (the old
 * `naming` fields restricted typing to `[a-z0-9-]` live, dropping every
 * other keystroke silently). Downstream validation differs per caller -
 * edit-doc.ts's addAnimation() enforces the animation-name pattern and
 * reports a rejection through the caller's own tryOp/statusFlash path;
 * assets.ts's resolveAssetPath() enforces filesystem containment for a
 * typed file name - so this dialog leaves that to its caller instead of
 * hard-coding one pattern that would be wrong for the other use.
 */
export function promptText(screen: any, title: string, initial = ''): Promise<string | null> {
  screen.dialogOpen = true;
  return new Promise<string | null>((resolve) => {
    const box = new Box({
      parent: screen,
      top: 'center', left: 'center', width: 44, height: 3,
      label: ` ${title} `,
      tags: true,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' }, fg: 'white', bg: 'black' },
    });
    const input = new Textbox({
      parent: box,
      top: 0, left: 1, width: '100%-2', height: 1,
      value: initial,
      mouse: true,
      style: { fg: 'white', focus: { fg: 'lightyellow' } },
    });

    const finish = (value: string | null): void => {
      input.destroy();
      box.destroy();
      screen.dialogOpen = false;
      screen.render();
      resolve(value);
    };

    input.on('submit', (value: string) => {
      const trimmed = (value ?? '').trim();
      if (!trimmed) return; // refuse an empty/whitespace-only name; the dialog stays open
      finish(trimmed);
    });
    input.on('cancel', () => finish(null));

    box.setFront();
    input.focus();
    screen.render();
  });
}

/**
 * A centred yes/no confirmation for a destructive action, built on the
 * SDK's own ConfirmModal (confirm-modal.ts). `confirmColor: 'red'` /
 * `cancelColor: 'green'` follows the SAME convention confirm-modal.ts's
 * own doc comment and door-manager's delete dialog both already use for a
 * destructive confirm: the dangerous choice is coloured red, the safe way
 * out is green - not the widget's own green-confirm/red-cancel defaults,
 * which read backwards for a "delete this?" prompt.
 *
 * Resolves `true` on Confirm, `false` on Cancel OR on ESC (ConfirmModal's
 * own `key(['escape'], ...)` already routes to the same cancel handler).
 */
export function confirm(screen: any, message: string): Promise<boolean> {
  screen.dialogOpen = true;
  return new Promise<boolean>((resolve) => {
    const finish = (result: boolean): void => {
      modal.destroy();
      screen.dialogOpen = false;
      screen.render();
      resolve(result);
    };

    const modal = new ConfirmModal({
      parent: screen,
      message,
      confirmColor: 'red',
      cancelColor: 'green',
      style: { border: { fg: 'yellow' } },
      onConfirm: () => finish(true),
      onCancel: () => finish(false),
    } as any);

    modal.display();
  });
}
