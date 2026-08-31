/**
 * The no-files black screen.
 *
 * Reported live 2026-08-31: opening the load dialog with no images saved
 * showed the "No Files" message, and dismissing it left a black screen.
 *
 * showOpenDialog hid the editor BEFORE the browser knew whether it had
 * anything to show. The browser's own empty-list path shows a message and
 * returns - it never hid the editor, so it never shows it again either.
 * The premature hide was the only hide, and nothing restored it.
 *
 * The rule the fix encodes: the widget that hides the editor owns showing
 * it again. This test drives the exact reported path on a stubbed
 * instance, so it fails if anyone reintroduces a hide upstream of the
 * empty-list check.
 *
 * This door is the fork base for the sprite/asset studio (see the design
 * doc in thoughts/shared/plans/), which is why the bug gates that work.
 */

import assert from 'assert';
import { ANSIEditorDoor } from '../index';

function stubbedDoor() {
  const door: any = Object.create(ANSIEditorDoor.prototype);
  const editor = {
    hidden: false,
    hide() { this.hidden = true; },
    show() { this.hidden = false; },
    focus() { /* nothing to focus in a test */ },
  };
  const messages: string[] = [];
  door.editor = editor;
  door.screen = { render() { /* no terminal in tests */ } };
  door.showMessage = (title: string) => { messages.push(title); };
  return { door, editor, messages };
}

export async function anEmptyFileListLeavesTheEditorVisible(): Promise<void> {
  const { door, editor, messages } = stubbedDoor();
  door.listFiles = async () => [];

  await door.showOpenDialog();

  assert.deepStrictEqual(messages, ['No Files'], 'the dialog still appears');
  assert.ok(
    !editor.hidden,
    'the editor must still be visible once the No Files dialog is dismissed - ' +
    'hiding it with nothing to restore it is the reported black screen'
  );
}
