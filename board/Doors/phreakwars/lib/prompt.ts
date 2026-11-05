/**
 * Free-text fields, read as LINES by the SDK's own reader.
 *
 * The door is a mode machine driven by `door.onInput`, which delivers one
 * KEYSTROKE per call. That is right for the menu keys and wrong for the three
 * places the player types prose - the hacker handle, a message subject and a
 * message body - which used to validate each keystroke as though it were the
 * whole line ("Handle must be 3-15 characters long." after the first letter,
 * sysop 2026-09-03) and echoed nothing.
 *
 * Nothing here re-implements a line editor. `BBSApi.getLine()` - the board's
 * own reader, the AEDoor `Prompt()` equivalent every door gets as `ctx.bbs`
 * (`web/backend/src/doors/BBSApi.ts:368`) - already does the echo, the
 * backspace, the Enter and the length cap, and it walks the delivered payload
 * character by character, so a paste or a batched burst lands intact.
 *
 * WHY NOT `ctx.input.getLine()`. The SDK's own reader
 * (`sdk/src/core/Input.ts:83`) cannot see Enter: `parseKeyPress`
 * (`sdk/src/core/Input.ts:180-186`) rewrites every ASCII 1-26 key as a ctrl
 * letter, so CR arrives at the Enter test as `m`, fails it, and is echoed into
 * the field as a character. Backspace (8) becomes `h` the same way. Measured,
 * not assumed - it typed "spotm" in the regression suite. Fixing that is a
 * change to a reader every TS door shares; this door uses the one that works.
 *
 * WHAT THIS WRAPPER IS FOR. `getLine` installs its own
 * `session.doorInputHandler` and DELETES it when the line is done
 * (`BBSApi.ts:385`). Called from inside `door.onInput` - i.e. from inside the
 * handler the SDK's input loop installed - that delete would take the loop's
 * handler away for good and leave the door deaf again, which is exactly the bug
 * fixed in 83f125aff. So the loop's handler is captured before the read and put
 * back after it, and the read composes with the mode machine instead of
 * dismantling it. Called from `onStart` (the new-player handle) there is no
 * loop handler yet, the capture is undefined, and the restore is a no-op.
 */
import type { DoorContext } from '@amiexpress/bbs-door-sdk';

/** The shape of the one session property both live keystroke routers call. */
interface SessionWithDoorInput {
  doorInputHandler?: ((input: string) => void) | null;
}

/**
 * The reader, as the backend actually implements it. The SDK's `BBSApi`
 * interface does not declare `getLine`, the same gap the door already works
 * around for `getTerminalSize` (server.ts).
 */
interface BbsWithLineReader {
  getLine(prompt?: string, maxLength?: number): Promise<string>;
}

/**
 * Read one line, echoing as the player types, and hand the door's keystroke
 * loop back its handler afterwards.
 *
 * The prompt is NOT passed to `getLine`: this door prints every row through
 * `say()`, which wraps to the caller's width (a C64 has forty columns), and
 * `getLine`'s own prompt path would bypass that.
 */
export async function readLine(ctx: DoorContext, maxLength: number): Promise<string> {
  const bbs = ctx.bbs as unknown as BbsWithLineReader | undefined;
  if (!bbs || typeof bbs.getLine !== 'function') {
    throw new Error('[PhreakWars] no BBS line reader on the door context');
  }

  const session = ctx.bbsSession as SessionWithDoorInput | undefined;
  const loopHandler = session?.doorInputHandler;
  try {
    return await bbs.getLine(undefined, maxLength);
  } finally {
    if (session) session.doorInputHandler = loopHandler;
  }
}
