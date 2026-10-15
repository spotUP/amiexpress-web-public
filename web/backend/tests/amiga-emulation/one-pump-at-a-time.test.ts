/**
 * Two deasync pumps must never nest, and the outer one owns it.
 *
 * The 68K path makes asynchronous things look synchronous to a door in two
 * places, both with `deasync.loopWhile`: `AEDoorLibrary.waitForReply` under
 * `DOOR_ASYNC_WAIT=1`, and the XIM processor draining a handler promise for
 * commands 7, 8, 507, 617 and 618 so a file's contents reach the socket
 * before the reply unblocks the door.
 *
 * The second runs INSIDE the first, so turning the flag on would nest them -
 * which is why it has been dark since 2026-04-21 while the starvation it was
 * written to fix took the live board down on 2026-09-13.
 *
 * `ownPump` is the register that lets the inner site ask. These pin the
 * register itself: the depth counting, the restore-on-throw that stops a
 * stuck `true` from silently disabling every drain for the life of the
 * process, and the default - nothing pumping - which is what every board
 * runs today.
 */

import { isPumping, ownPump, resetPumpOwner } from '../../src/amiga-emulation/api/pump-owner';

describe('one pump at a time', () => {
  afterEach(() => resetPumpOwner());

  it('says nobody is pumping until somebody is', () => {
    expect(isPumping()).toBe(false);
  });

  it('reads true for whatever runs inside the owner', () => {
    let seen: boolean | null = null;
    ownPump(() => { seen = isPumping(); });

    expect(seen).toBe(true);
  });

  it('goes back to nobody afterwards', () => {
    ownPump(() => undefined);

    expect(isPumping()).toBe(false);
  });

  it('hands back what the body returned', () => {
    expect(ownPump(() => 'the reply')).toBe('the reply');
  });

  it('still reads true inside an outer owner when an inner one finishes', () => {
    // waitForReply is called from a trap handler, and a door can issue a
    // command whose handling issues another. A boolean would read false
    // after the inner one returned, and the inner drain would start a second
    // pump inside the outer one - the exact thing this register prevents.
    const readings: boolean[] = [];
    ownPump(() => {
      ownPump(() => { readings.push(isPumping()); });
      readings.push(isPumping());
    });
    readings.push(isPumping());

    expect(readings).toEqual([true, true, false]);
  });

  it('restores the count when the body throws', () => {
    // A throw from inside the loop - or from the emulator underneath it -
    // must not leave the register stuck on. Stuck on means every inner drain
    // silently stops draining, for the life of the process.
    expect(() => ownPump(() => { throw new Error('the emulator fell over'); }))
      .toThrow('the emulator fell over');

    expect(isPumping()).toBe(false);
  });

  it('survives a throw from inside a nested owner', () => {
    expect(() => ownPump(() => {
      ownPump(() => { throw new Error('inner'); });
    })).toThrow('inner');

    expect(isPumping()).toBe(false);
  });
});
