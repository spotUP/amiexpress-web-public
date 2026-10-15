/**
 * A NUL DOES NOT ANSWER A DOOR'S QUESTION - express.e:5164.
 *
 * `readChar` loops `UNTIL (((wasControl=FALSE) OR (raw)) AND (ch<>0)) OR ...`.
 * Character 0 never satisfies a read in express: it keeps waiting. This port
 * accepted it, replied to the door and cleared the wait.
 *
 * The cost is not a stray character - it is every character AFTER it. Once the
 * hotkey is completed nothing is waiting, so the keys the caller actually
 * presses arrive and are discarded. The sysop: "i am stuck in the global wall
 * prompt now" (2026-09-15). The board's own log shows the shape exactly -
 * GWall printed `pUSH tHE bUTTON ?! [y/N]`, called `HotKey()`, and then
 * `doorInputHandler received: "" (len=1)` with no key pressed; the emulator
 * resumed, and the `n` and `m` he typed afterwards were each received and
 * dropped.
 *
 * `a-door-waits-for-a-person.test.ts` removed one SOURCE of character 0 (a
 * five-second budget expiring under a caller still reading). This refuses the
 * character itself, so no other source can answer for the caller.
 */
import { XIMIOHandler } from '../../src/amiga-emulation/xim/io';

const NUL = String.fromCharCode(0);

/** The smallest stand-ins the handler needs to take input and reply. */
function handlerWaitingForAHotkey() {
  // Reads answer 0 and writes are accepted; the emulator is not what is
  // under test, only whether the handler is still waiting.
  const delivered: number[] = [];
  const emulator: any = new Proxy({}, {
    get: (_t, name) => {
      if (name === 'isPaused') return () => true;
      if (name === 'writeMemory') return (addr: number, value: number) => {
        // The character handed to the door: msgAddr + MESSAGE_STRING_OFFSET.
        if (addr === 0x126dfe + 0x14) delivered.push(value);
      };
      if (typeof name === 'string' && (name.startsWith('read') || name === 'getRegister')) return () => 0;
      return () => undefined;
    },
  });
  const execLibrary: any = { replyMsg: () => {} };
  const socket: any = { emit: () => {}, id: 'nul-test' };
  /*
   * The parser is a collaborator this test does not care about: it only has to
   * not be the thing that fails. A permissive double keeps the test about the
   * one rule it is pinning, instead of growing a stub per method.
   */
  const messageParser: any = new Proxy({}, {
    get: (_t, name) => (name === 'writeStringPointer' ? () => true : () => undefined),
  });
  const state: any = { carrierDropped: false };
  const handler: any = new (XIMIOHandler as any)(
    emulator, execLibrary, socket, messageParser, state, {} as any,
  );

  // The state a door sits in between `HotKey()` and the caller pressing a key.
  handler.waitingForHotkey = true;
  handler.hotkeyMessage = { msgAddr: 0x126dfe, stringPtr: 0x126e12 };
  handler.delivered = delivered;
  return handler;
}

describe('a NUL is not a keypress', () => {
  it('leaves the door waiting when a NUL arrives', () => {
    const handler = handlerWaitingForAHotkey();

    handler.queueInput(NUL);

    // Still waiting: the caller has not pressed anything yet.
    expect(handler.waitingForHotkey).toBe(true);
  });

  it('still answers the real key the caller presses afterwards', () => {
    // The half that was actually broken: once the NUL had been accepted
    // nothing was waiting, and this `n` went nowhere.
    const handler = handlerWaitingForAHotkey();

    handler.queueInput(NUL);
    handler.queueInput('n');

    // The door is handed 'n' and ONLY 'n'. Before the fix the NUL was
    // delivered as the answer and the real key was dropped, so this read
    // [0] instead of [0x6e].
    expect(handler.delivered).toEqual(['n'.charCodeAt(0)]);
    expect(handler.waitingForHotkey).toBe(false);
  });

  it('answers a real key on its own, unchanged', () => {
    const handler = handlerWaitingForAHotkey();
    handler.queueInput('y');
    expect(handler.delivered).toEqual(['y'.charCodeAt(0)]);
    expect(handler.waitingForHotkey).toBe(false);
  });
});
