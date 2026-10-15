/**
 * C64 40-col plan, Task 8 (gap b): a TypeScript door's prose goes through
 * the session wrap choke.
 *
 * `BBSApi.write()` / `writeLine()` emitted straight to the socket, so every
 * TS door that says something in words - a status line, a result, a menu
 * hint - could hand a C64 a row wider than its screen, and the row folded
 * and ate the one beneath it. Task 6 fixed two doors (phreakwars,
 * ami-stripper) at the door; the door is not the right level. The choke is:
 * one place that knows the caller's width, so a door written next month is
 * covered without knowing a C64 exists.
 *
 * The guards are what keep this safe for everything that is NOT prose:
 *  - an ANSI caller: identity, at any width (`petsciiMode === true` only),
 *  - positioned output - a blessed screen's frame, a cursor move, a clear -
 *    is never rewrapped (`positionsCursorAbsolutely`), so an adapted
 *    blessed door paints exactly the bytes it painted before,
 *  - the width is the DOOR's width (`doorScreenWidth`), the same one
 *    `getTerminalSize()` hands the door, so a PETSCII session still
 *    carrying a stale 80 from the browser's xterm is wrapped at 40.
 */
import { createBBSApi } from '../../src/doors/BBSApi';
import { printableLength } from '../../src/utils/wrap-for-session.util';

class StubSocket {
  emitted: Array<{ event: string; data: any }> = [];
  emit(event: string, data: any): boolean {
    this.emitted.push({ event, data });
    return true;
  }
  on(): this { return this; }
  off(): this { return this; }
  removeListener(): this { return this; }
}

function apiFor(session: any): { api: any; socket: StubSocket } {
  const socket = new StubSocket();
  return { api: createBBSApi(socket as any, session), socket };
}

const ansiOut = (socket: StubSocket): string =>
  socket.emitted.filter((e) => e.event === 'ansi-output').map((e) => String(e.data)).join('');

const PETSCII = { petsciiMode: true, screenWidth: 40, screenHeight: 25 };
/** 60 characters of prose: over a C64 row, under an 80-column one. */
const PROSE = 'The sysop has left a message for you in conference two.';

describe('BBSApi.write on a PETSCII session', () => {
  it('wraps a 60-character prose write to the C64 row', () => {
    const { api, socket } = apiFor({ ...PETSCII });
    api.write(PROSE);

    const out = ansiOut(socket);
    for (const row of out.split('\r\n')) {
      expect(printableLength(row)).toBeLessThanOrEqual(40);
    }
    // Wrapped, not clipped: every word survives, and it really did split.
    expect(out).toContain('\r\n');
    for (const word of PROSE.split(' ')) {
      expect(out).toContain(word);
    }
  });

  it('wraps writeLine the same way and keeps its trailing newline', () => {
    const { api, socket } = apiFor({ ...PETSCII });
    api.writeLine(PROSE);

    const out = ansiOut(socket);
    expect(out.endsWith('\r\n')).toBe(true);
    for (const row of out.split('\r\n')) {
      expect(printableLength(row)).toBeLessThanOrEqual(40);
    }
  });

  it('wraps at 40 even when the session still carries the browser\'s stale 80', () => {
    const { api, socket } = apiFor({ petsciiMode: true, screenWidth: 80, screenHeight: 25 });
    api.write(PROSE);

    for (const row of ansiOut(socket).split('\r\n')) {
      expect(printableLength(row)).toBeLessThanOrEqual(40);
    }
  });

  it('leaves positioned output alone - a blessed door paints its own screen', () => {
    // A real frame off a blessed door: clear, home, then a row placed with
    // an absolute cursor move. Rewrapping this would move the art.
    const frame =
      '\x1b[2J\x1b[H\x1b[1;1H' +
      '\x1b[32mINSTALLED DOORS - a header row longer than forty columns\x1b[0m' +
      '\x1b[2;1Hrow two';
    const { api, socket } = apiFor({ ...PETSCII });
    api.write(frame);

    expect(ansiOut(socket)).toBe(frame);
  });
});

describe('BBSApi.write on an ANSI session', () => {
  // A real door write capture: DOORMAN's own status line, bytes and all.
  const DOORMAN_STATUS =
    '\x1b[36mDOORMAN\x1b[0m: 37 installed doors, 12 in the repository, 2 updates available\r\n';

  it('is byte-identical at 80 columns', () => {
    const { api, socket } = apiFor({ screenWidth: 80, screenHeight: 25 });
    api.write(DOORMAN_STATUS);
    expect(ansiOut(socket)).toBe(DOORMAN_STATUS);
  });

  it('is byte-identical on a narrow ANSI terminal (a phone in portrait)', () => {
    // Not a C64: a 32-column browser window must keep the bytes it has
    // always had. petsciiMode is the only gate.
    const { api, socket } = apiFor({ screenWidth: 32, screenHeight: 25 });
    api.write(DOORMAN_STATUS);
    api.writeLine(PROSE);
    expect(ansiOut(socket)).toBe(DOORMAN_STATUS + PROSE + '\r\n');
  });

  it('is byte-identical when the session is missing entirely', () => {
    const { api, socket } = apiFor(undefined);
    api.write(DOORMAN_STATUS);
    expect(ansiOut(socket)).toBe(DOORMAN_STATUS);
  });
});
