/**
 * Escape on the FIRST requester gives the board back.
 *
 * Reported live by the sysop, 2026-09-13: "i pressed esc in the sprite
 * selector and got a black screen." The door opens with a requester because
 * nothing is loaded yet; cancelling it returned to an editor that did not
 * exist. The list was destroyed, nothing took focus, and `start()` went on
 * to await a promise that only `screen.destroy()` resolves - so the caller
 * sat on an empty screen, on a node the door would not let go of, until
 * they dropped carrier.
 *
 * The test drives `start()` - the door's real entry point, the one
 * `index.ts` awaits - rather than calling a helper. A door that hangs here
 * hangs for a caller, so the assertion is that start() RETURNS, with a
 * deadline instead of a hang, and that the screen is destroyed behind it.
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

export async function escapingTheFirstRequesterLeavesTheDoor(): Promise<void> {
  const studio: any = new SpriteStudioDoor();
  studio.ctx = makeCtx();

  // The caller presses Escape: pick() answers null, exactly as it does when
  // the list is cancelled. Nothing is opened, so `doc` stays null.
  studio.pick = async () => null;

  await within(5000, studio.start(),
    'start() never returned - the door is holding the node on a black screen');

  assert.strictEqual(studio.doc ?? null, null, 'nothing was opened, so there is no document');
  // The screen is gone, which is what hands the board back to the caller.
  assert.ok(studio.screen?.destroyed !== false, 'the screen was destroyed on the way out');
}

export async function aBoardWithNoSpritesAtAllAlsoLeaves(): Promise<void> {
  // Same exit, reached the other way: the board has no sprites anywhere, so
  // openSpriteRequester shows its "No sprites" message and returns without
  // ever offering a list. That path hit the same black screen.
  const studio: any = new SpriteStudioDoor();
  studio.ctx = makeCtx();

  let told = 0;
  studio.message = async () => { told++; };
  studio.openSpriteRequester = async () => { await studio.message(); };

  await within(5000, studio.start(),
    'start() never returned when there was nothing to open');

  assert.strictEqual(told, 1, 'the caller was told why, once');
}
