"use strict";
/**
 * Modal dialogs, replacing the typed "naming mode" edit-screen.ts and
 * art-screen.ts each used to hand-roll (a `naming: string | null` field,
 * a keypress listener that diverted typed characters into it, and a
 * naming-branch in every space/delete/enter/escape handler).
 *
 * `screen.dialogOpen` is the ONE flag every screen-level key handler,
 * mouse handler, and (as of fix round 1 below) menu action in this door
 * reads to refuse input while a dialog owns the keyboard - and it is set
 * true / cleared HERE, around the await, by these two functions alone. It
 * is never a call site's job to arm or disarm it. That is the actual fix,
 * not a stylistic preference: the old `naming` guard (and this flag,
 * after it) leaked FOUR times across this plan - studio 2b: keyboard ops
 * fired mid-name because a new op wasn't routed through the guarded
 * wrapper; studio 2c task 4: canvas click and drag painted mid-name
 * because the new mouse handlers were never told to check it; studio 2c
 * task 5 fix round 1 (review-caught): a menu item's mouse click ran its
 * action while a dialog was already open, because `bindings.ts`'s
 * `menuItems()` handed a DropdownMenu the RAW, unguarded
 * `binding.handler` - a completely separate dispatch path from
 * `screen.key()`'s registered handlers. Every leak was a NEW CONSUMER
 * that forgot to consult the guard, not the guard itself misbehaving.
 * Centralising the SET in one place cannot fix "a new consumer forgot to
 * CHECK the flag" (nothing can - that is a one-line review item forever),
 * but it removes the OTHER half of the old bug class: a call site that
 * opens a dialog and forgets to arm the guard at all, or that arms it but
 * mismanages when it clears. dialogs.ts owns both halves of that
 * lifecycle; a caller only ever awaits a Promise. Fix round 1 additionally
 * moved the CHECK itself out of individual call sites and into
 * `bindings.ts`'s `buildBindingSet(bindings, isBlocked)`, which wraps
 * every `StudioBinding.handler` once - so `screen.key()` registration and
 * a menu's action dispatch through the identical guarded function, and a
 * future THIRD consumer of a StudioBinding's handler inherits the guard
 * automatically instead of needing its own reminder.
 *
 * Why a `screen.dialogOpen` check is still needed at all despite the SDK
 * widgets' own focus machinery (traced against the real SDK, not
 * assumed): `ConfirmModal` (confirm-modal.ts) IS built with
 * `trapFocus: true`, and `Element.show()` (element.ts) DOES call
 * `screen.trapFocus(this)` when that option is set - so a real
 * `ConfirmModal` already suppresses this door's registered `screen.key()`
 * handlers on its own (screen.ts's dispatch: a `focusTrap` sets
 * `suppressGlobalKeys`, which skips the registered-handler map entirely).
 * `Textbox` (promptText's own widget) sets no such option, so for
 * `promptText` specifically `screen.dialogOpen` remains load-bearing even
 * against the real Screen - the exact same keystroke its Textbox is
 * consuming still reaches every `screen.key()` binding this door
 * registers. Neither widget's focus trap does anything at all for a
 * MOUSE click on a menu item, though - `DropdownMenu.selectItem()`
 * (dropdown-menu.ts) calls `item.action?.()` directly with no
 * `screen.dialogOpen` check of its own, and mouse dispatch never consults
 * `screen.trapFocus()`'s `suppressGlobalKeys` either (that only gates the
 * keyboard path) - which is exactly what let round 4 through. Since
 * bindings.ts can't know which dialog kind (if any) is open, and the
 * redundancy costs nothing, `screen.dialogOpen` is checked uniformly
 * everywhere a StudioBinding's handler can be invoked from, rather than
 * relying on ConfirmModal's trap for its own case and dialogOpen only for
 * promptText's.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.promptText = promptText;
exports.confirm = confirm;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
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
function promptText(screen, title, initial = '') {
    screen.dialogOpen = true;
    return new Promise((resolve) => {
        const box = new blessed_1.Box({
            parent: screen,
            top: 'center', left: 'center', width: 44, height: 3,
            label: ` ${title} `,
            tags: true,
            border: { type: 'line' },
            style: { border: { fg: 'cyan' }, fg: 'white', bg: 'black' },
        });
        const input = new blessed_1.Textbox({
            parent: box,
            top: 0, left: 1, width: '100%-2', height: 1,
            value: initial,
            mouse: true,
            style: { fg: 'white', focus: { fg: 'lightyellow' } },
        });
        const finish = (value) => {
            input.destroy();
            box.destroy();
            screen.dialogOpen = false;
            screen.render();
            resolve(value);
        };
        input.on('submit', (value) => {
            const trimmed = (value ?? '').trim();
            if (!trimmed)
                return; // refuse an empty/whitespace-only name; the dialog stays open
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
function confirm(screen, message) {
    screen.dialogOpen = true;
    return new Promise((resolve) => {
        const finish = (result) => {
            // hide() BEFORE destroy(), not destroy() alone (fix round 1, minor
            // 3, review-caught): ConfirmModal is built with `trapFocus: true`,
            // and Element.hide() (element.ts) is what releases that trap - but
            // ONLY while `!this.destroyed`. _handleConfirm()/_handleCancel()
            // (confirm-modal.ts) call this onConfirm/onCancel callback FIRST and
            // call their OWN this.hide() SECOND - so calling destroy() straight
            // from here (the original code) left the widget already destroyed
            // by the time that second hide() ran, and Element.hide()'s
            // `if (this.destroyed) return;` guard skipped the trap release
            // entirely, leaving correctness dependent on screen.ts's defensive
            // self-heal on the next keypress rather than the widget's own
            // lifecycle. Calling hide() here runs that release properly (the
            // widget is not yet destroyed at this point); destroy() right after
            // still reclaims the widget instead of leaking a hidden instance,
            // and hide()'s own `if (!this._hidden) return;` guard makes
            // ConfirmModal's later, redundant this.hide() call a safe no-op.
            modal.hide();
            modal.destroy();
            screen.dialogOpen = false;
            screen.render();
            resolve(result);
        };
        const modal = new blessed_1.ConfirmModal({
            parent: screen,
            message,
            confirmColor: 'red',
            cancelColor: 'green',
            style: { border: { fg: 'yellow' } },
            onConfirm: () => finish(true),
            onCancel: () => finish(false),
        });
        modal.display();
    });
}
