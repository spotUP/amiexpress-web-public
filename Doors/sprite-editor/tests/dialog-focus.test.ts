/**
 * A dialog opened by a MOUSE CLICK must still take the keyboard.
 *
 * Reported live 2026-09-01, clicking the strip's play button on a
 * single-frame animation: "i clicked play and got a dialog saying this
 * animation is a single frame and i cant dismiss the dialog".
 *
 * The dialog focused itself, and then lost focus again inside the same
 * mouse dispatch - the click carries on to the elements under it, and the
 * editor's canvas takes focus back. Escape then went to the canvas, the
 * dialog's own key handler never ran, and the only way out was to close
 * the door. The SDK's answer to this is a focus TRAP, which reasserts
 * itself whenever focus is outside it (screen.ts says so in its own
 * comment, from the LiveChat help screen that had the same bug); the
 * door's own requesters were never using it.
 */

import assert from 'assert';
import { Screen, Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { SpriteStudioDoor } from '../studio';

function makeScreen(): any {
  return new Screen({ title: 'dialog-focus', responsive: true, width: 100, height: 30 } as any);
}

/** Resolve, or fail loudly rather than hanging the suite. */
function within(ms: number, promise: Promise<unknown>, what: string): Promise<void> {
  return Promise.race([
    promise.then(() => undefined),
    new Promise<void>((_, reject) => setTimeout(() => reject(new Error(what)), ms)),
  ]);
}

function press(screen: any, name: string): void {
  screen._handleKey(name === 'escape' ? '\x1b' : '', { name, full: name });
}

export async function aMessageClosesEvenAfterSomethingStealsFocus(): Promise<void> {
  const screen = makeScreen();
  const studio: any = new SpriteStudioDoor();
  studio.screen = screen;
  try {
    const shown = studio.message('Play', 'This animation has a single frame.');
    // Exactly what a click does: the element under the dialog takes focus
    // back inside the same dispatch.
    const thief = new Box({ parent: screen, top: 0, left: 0, width: 4, height: 1, focusable: true } as any);
    thief.focus();

    press(screen, 'escape');
    await within(500, shown, 'the message did not close on Escape after focus was stolen');
    assert.strictEqual((screen as any).dialogOpen, false, 'and it must clear the dialog guard');
  } finally { screen.destroy(); }
}

export async function aPickerClosesEvenAfterSomethingStealsFocus(): Promise<void> {
  const screen = makeScreen();
  const studio: any = new SpriteStudioDoor();
  studio.screen = screen;
  try {
    const picked = studio.pick('Which door', ['pengo', 'frogger']);
    const thief = new Box({ parent: screen, top: 0, left: 0, width: 4, height: 1, focusable: true } as any);
    thief.focus();

    press(screen, 'escape');
    await within(500, picked, 'the picker did not close on Escape after focus was stolen');
  } finally { screen.destroy(); }
}

export async function playingASingleFrameAnimationIsNotADialog(): Promise<void> {
  // The message was never worth a modal: nothing has gone wrong, there is
  // simply nothing to play. It says so in the title bar and gets on with it.
  const screen = makeScreen();
  const studio: any = new SpriteStudioDoor();
  studio.screen = screen;
  let modals = 0;
  studio.message = async () => { modals++; };
  const flashes: string[] = [];
  studio.flash = (text: string) => { flashes.push(text); };
  studio.editor = { setUnderlay() {}, setLabel() {}, refreshExtraToolbar() {}, setCoreCanvas() {}, getCoreCanvas: () => null };
  studio.doc = {
    sprite: { name: 'x', cellW: 1, cellH: 1, animations: { idle: { ticksPerFrame: 4, loop: true, frames: [[[null]]] } } },
    animation: 'idle', frame: 0, dirty: false,
  };
  try {
    studio.playInPlace();
    assert.strictEqual(modals, 0, 'no modal for a one-frame animation');
    assert.strictEqual(studio.playing, false, 'and nothing is playing');
    assert.deepStrictEqual(flashes, ['Only one frame in this animation']);
  } finally { screen.destroy(); }
}
