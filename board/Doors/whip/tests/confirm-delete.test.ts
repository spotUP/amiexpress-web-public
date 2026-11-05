/**
 * WHIP asks before deleting, and it asks with the SDK's modal.
 *
 * Two copies of a raw `blessed.question` box did this before - one per
 * screen - drawing their own frame and colours and trapping no focus. That
 * is the shape every CARD LOBBY defect on 2026-09-02 lived in.
 *
 * Driven, not read: a real Screen, the real dialog, and real keys through
 * `program.emit('keypress')` - the same route the door's own keys take. A
 * source pin would prove the call exists, not that Enter deletes and Escape
 * does not.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { confirmDelete } from '../ui/confirm-delete';

function open(): any {
  return new Screen({ title: 'whip', width: 80, height: 25 } as any);
}

function press(screen: any, ch: string, name: string): void {
  screen.program.emit('keypress', ch, { name, full: name });
}

function modals(screen: any): any[] {
  return screen.children.filter((c: any) => c.constructor?.name === 'ConfirmModal');
}

const settle = () => new Promise((r) => setTimeout(r, 30));

export async function itAsksWithTheSdkModalNotItsOwnBox(): Promise<void> {
  const screen = open();
  try {
    const answer = confirmDelete(screen, 'project', 'STATE OF THE ART');
    await settle();

    const open_ = modals(screen);
    assert.strictEqual(open_.length, 1, 'exactly one ConfirmModal is up');
    assert.ok(String(open_[0].getLabel?.() ?? open_[0].options?.label ?? '').includes('Delete project'),
      'the dialog says what it is about to delete');

    press(screen, '\x1b', 'escape');
    await answer;
  } finally { screen.destroy(); }
}

export async function enterOnTheDefaultButtonDeletes(): Promise<void> {
  const screen = open();
  try {
    const answer = confirmDelete(screen, 'task', 'fix the scroller');
    await settle();

    // ConfirmModal focuses the destructive button; Enter presses it.
    press(screen, '\r', 'enter');
    assert.strictEqual(await answer, true, 'Enter on the focused button confirms');
  } finally { screen.destroy(); }
}

export async function escapeCancels(): Promise<void> {
  const screen = open();
  try {
    const answer = confirmDelete(screen, 'task', 'fix the scroller');
    await settle();

    press(screen, '\x1b', 'escape');
    assert.strictEqual(await answer, false, 'Escape is the safe answer');
  } finally { screen.destroy(); }
}

export async function theDialogDoesNotOutliveTheAnswer(): Promise<void> {
  const screen = open();
  try {
    for (const _ of [1, 2, 3]) {
      const answer = confirmDelete(screen, 'project', 'DESERT DREAM');
      await settle();
      press(screen, '\x1b', 'escape');
      await answer;
      await settle();
    }

    assert.strictEqual(modals(screen).length, 0,
      'a closed dialog is destroyed, not left hidden among the screen children');
  } finally { screen.destroy(); }
}

/**
 * And it holds the keyboard while it is up.
 *
 * The dialog CARD LOBBY could not close was one whose Escape was bound to a
 * widget focus never reached. A raw `question` box leaves focus wherever it
 * was; `ConfirmModal` traps it and focuses a button, which is what makes
 * Enter and Escape mean anything at all.
 */
export async function theDialogHoldsTheKeyboardWhileItIsUp(): Promise<void> {
  const screen = open();
  try {
    const answer = confirmDelete(screen, 'project', 'HARDWIRED');
    await settle();

    const dialog = modals(screen)[0];
    assert.ok(dialog, 'the dialog must be up');

    assert.ok(dialog.hasFocusedChild(),
      'focus sits inside the dialog, not on whatever was behind it');

    press(screen, '\x1b', 'escape');
    await answer;
  } finally { screen.destroy(); }
}
