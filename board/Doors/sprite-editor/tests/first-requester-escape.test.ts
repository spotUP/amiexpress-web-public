/**
 * Escape on the FIRST requester leaves you in the door, on a blank page.
 *
 * The door opens with a requester because nothing is loaded yet. Cancelling
 * it used to return to an editor that did not exist: the list was
 * destroyed, nothing took focus, and `start()` went on to await a promise
 * that only `screen.destroy()` resolves - so the caller sat on an empty
 * screen, holding the node, until they dropped carrier ("i pressed esc in
 * the sprite selector and got a black screen", sysop, 2026-09-13).
 *
 * The first fix handed the board back. The sysop's call was to stay in the
 * door instead: Escape means "not that one", not "not today", and a blank
 * page with the menu bar live beats the BBS prompt.
 *
 * These drive `start()` - the entry point index.ts awaits - rather than a
 * helper, because a door that hangs here hangs for a caller. start() is
 * SUPPOSED to keep running now, so each test waits for the editor to
 * appear, then destroys the screen the way a quit would and requires
 * start() to return. Both fail on the black-screen code: nothing ever
 * opens, so the wait times out.
 */

import assert from 'assert';
import { SpriteStudioDoor } from '../studio';

/** Resolve, or fail loudly rather than hanging the suite. */
function within(ms: number, promise: Promise<unknown>, what: string): Promise<void> {
  return Promise.race([
    promise.then(() => undefined),
    new Promise<void>((_, reject) => setTimeout(() => reject(new Error(what)), ms)),
  ]);
}

async function untilTrue(ms: number, ok: () => boolean, what: string): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (ok()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timed out waiting for: ${what}`);
}

function makeCtx(): any {
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 100, height: 30 }),
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    connectionType: 'web', unicodeCapable: true,
  };
  const socket: any = {
    id: 'test-socket', on: () => {}, once: () => {}, emit: () => {},
    off: () => {}, removeAllListeners: () => {},
  };
  return {
    bbs, socket, params: [],
    output: { write: () => {}, writeLine: () => {} },
    bbsSession: { userId: 1, username: 'sysop', nodeId: 1, secLevel: 255, screenHeight: 30, socket },
    user: { id: 1, username: 'sysop', name: 'sysop', accessLevel: 255 },
  };
}

export async function escapingTheFirstRequesterOpensABlankPage(): Promise<void> {
  const studio: any = new SpriteStudioDoor();
  studio.ctx = makeCtx();
  // The caller presses Escape: pick() answers null, as it does when a list
  // is cancelled. Nothing is opened by the requester itself.
  studio.pick = async () => null;

  const running = studio.start();
  await untilTrue(5000, () => studio.doc !== null && studio.editor !== null,
    'the blank editor to open - a black screen is what this test exists to catch');

  // A page to draw on, and nowhere to save it YET.
  assert.ok(studio.doc, 'there is a document');
  assert.strictEqual(studio.file, '', 'it has never been saved, so it has no file');
  assert.strictEqual(studio.door, '', 'and no door to save into');
  assert.strictEqual(studio.doc.sprite.name, 'untitled', 'it is untitled');

  // The door is still open: quitting is what ends it, not Escape.
  studio.screen.destroy();
  await within(5000, running, 'start() never returned after the screen was destroyed');
}

export async function aBoardWithNoSpritesAtAllAlsoGetsABlankPage(): Promise<void> {
  // Reached the other way: the board has no sprites anywhere, so the
  // requester shows its "No sprites" message and returns without a list.
  // With nothing to open, a blank page is the only way into this door.
  const studio: any = new SpriteStudioDoor();
  studio.ctx = makeCtx();

  let told = 0;
  studio.message = async () => { told++; };
  studio.openSpriteRequester = async () => { await studio.message(); };

  const running = studio.start();
  await untilTrue(5000, () => studio.doc !== null && studio.editor !== null,
    'the blank editor to open when there was nothing to open');

  assert.strictEqual(told, 1, 'the caller was told why, once');
  assert.strictEqual(studio.file, '', 'the blank page has no file');

  studio.screen.destroy();
  await within(5000, running, 'start() never returned after the screen was destroyed');
}

export async function savingTheBlankPageAsksWhereItGoes(): Promise<void> {
  // save() on an untitled document must not write to an empty path -
  // writeSprite('', '') either throws or writes somewhere nobody asked for.
  // The first save IS "save as": it asks which door, then for a name.
  const studio: any = new SpriteStudioDoor();
  studio.ctx = makeCtx();
  studio.pick = async () => null;

  const running = studio.start();
  await untilTrue(5000, () => studio.doc !== null, 'the blank editor to open');

  let askedWhere = 0;
  studio.saveUntitledAsked = async () => { askedWhere++; };
  await studio.save();
  assert.strictEqual(askedWhere, 1, 'saving an untitled page asks where it goes');

  studio.screen.destroy();
  await within(5000, running, 'start() never returned after the screen was destroyed');
}
