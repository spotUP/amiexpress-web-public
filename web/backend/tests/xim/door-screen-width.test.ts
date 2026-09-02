/**
 * The ONE answer to "how wide is this caller's screen?" for 68K doors.
 * BB_SCRWIDTH (bbs-info.ts, DoorMessageHandler.ts) and the launch-time
 * lineWrap (door.handler.ts) both read it, so a width-aware door and the
 * wrapLine() safety net can never disagree.
 */
import { doorScreenWidth, C64_COLUMNS, DEFAULT_DOOR_COLUMNS } from '../../src/amiga-emulation/xim/screen-width.util';

describe('doorScreenWidth', () => {
  it('answers 80 for every non-PETSCII session, whatever the terminal is (byte-identical to before)', () => {
    expect(doorScreenWidth({ petsciiMode: false, screenWidth: 40 })).toBe(80);
    expect(doorScreenWidth({ screenWidth: 132 })).toBe(80);
    expect(doorScreenWidth({})).toBe(80);
    expect(doorScreenWidth(undefined)).toBe(80);
    expect(doorScreenWidth(null)).toBe(80);
    expect(DEFAULT_DOOR_COLUMNS).toBe(80);
  });

  it('answers the session width for a PETSCII session', () => {
    expect(doorScreenWidth({ petsciiMode: true, screenWidth: 40 })).toBe(40);
    expect(doorScreenWidth({ petsciiMode: true, screenWidth: 64 })).toBe(64);
  });

  it('answers 40 for a PETSCII session whose width is missing, zero or not narrower than 80', () => {
    expect(doorScreenWidth({ petsciiMode: true })).toBe(C64_COLUMNS);
    expect(doorScreenWidth({ petsciiMode: true, screenWidth: 0 })).toBe(40);
    expect(doorScreenWidth({ petsciiMode: true, screenWidth: 80 })).toBe(40);
  });

  it('uses the caller-supplied fallback only for non-PETSCII sessions (lineWrap keeps wide terminals wide)', () => {
    expect(doorScreenWidth({ screenWidth: 132 }, 132)).toBe(132);
    expect(doorScreenWidth({ petsciiMode: true, screenWidth: 80 }, 132)).toBe(40);
  });
});
