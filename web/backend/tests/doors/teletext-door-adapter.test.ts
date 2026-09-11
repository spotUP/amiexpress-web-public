/**
 * The teletext 68K door adapter: tall doors pause, wide doors gate.
 *
 * User-visible symptoms (sysop, T mode): a tall 68K door scrolled past
 * with no pause at all, and an 80-column door ran raw instead of being
 * refused like on PETSCII.
 *
 * Cause: the frame adapter (reconstruct 80-col frames, reduce to 40,
 * pause-walk behind the express.e prompt in xim/io.ts) only drove
 * PETSCII sessions, and the MIN_COLUMNS gate blanket-exempted teletext
 * ("let the door cope"). The reduction is width logic - the PETSCII
 * transducer sits further downstream and never runs for a T caller - so
 * both predicates widen to the 40-column grid instead of the encoding.
 *
 * These tests pin the teletext half without touching the PETSCII pins:
 * drives(), the gate clause, and one frame through the real seam.
 */
import {
  C64_ADAPT_TICK_MS,
  c64AdapterDrives,
  c64AdapterFor,
  installC64DoorAdapter,
  uninstallC64DoorAdapter,
} from '../../src/server/c64-door-adapter';
import { doorOpensForC64 } from '../../src/utils/door-min-columns.util';

function fakeSocket(session: any) {
  const out: Array<[string, any]> = [];
  const socket: any = {
    id: `ttx${++socketCounter}`,
    session,
    emit: (ev: string, d?: any) => {
      out.push([ev, d]);
      return true;
    },
  };
  return {
    socket,
    out,
    ansi: () => out.filter(([e]) => e === 'ansi-output').map(([, d]) => d).join(''),
  };
}
let socketCounter = 0;

const ttx = () => ({ texttvMode: true, screenWidth: 40, screenHeight: 25 });
const ansi80 = () => ({ petsciiMode: false, screenWidth: 80 });
const c64 = () => ({ petsciiMode: true, screenWidth: 40 });

const painted = (s: string): string => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
});

describe('the frame adapter drives teletext too', () => {
  it('drives a 40-column teletext session', () => {
    expect(c64AdapterDrives(ttx())).toBe(true);
  });

  it('still refuses the 80-column callers', () => {
    expect(c64AdapterDrives(ansi80())).toBe(false);
    expect(c64AdapterDrives({ petsciiMode: true, screenWidth: 80, petsciiColumns: 80 })).toBe(false);
  });

  it('still drives the C64', () => {
    expect(c64AdapterDrives(c64())).toBe(true);
  });
});

describe('the gate treats teletext like a C64', () => {
  const adapted = { type: 'XIM', toolTypes: { C64_ADAPT: '40' } };
  const unmarked = { type: 'XIM', toolTypes: {} };

  it('an adapted door opens for teletext', () => {
    expect(doorOpensForC64(adapted, ttx())).toBe(true);
  });

  it('an unmarked 80-column door does not open for teletext', () => {
    expect(doorOpensForC64(unmarked, ttx())).toBe(false);
  });

  it('a 64-column claim does not open a 40-column teletext session', () => {
    expect(doorOpensForC64({ type: 'XIM', toolTypes: { C64_ADAPT: '64' } }, ttx())).toBe(false);
  });

  it('the C64 answers do not move', () => {
    expect(doorOpensForC64(adapted, c64())).toBe(true);
    expect(doorOpensForC64(unmarked, c64())).toBe(false);
  });
});

describe('an adapted door frame reaches a teletext caller reduced', () => {
  it('an 80-column line paints within 40 columns', () => {
    const f = fakeSocket(ttx());
    installC64DoorAdapter(f.socket, f.socket.session);
    f.socket.emit('ansi-output', '\x1b[2J\x1b[H' + '0123456789'.repeat(8));
    expect(f.out).toHaveLength(0);

    jest.advanceTimersByTime(C64_ADAPT_TICK_MS);
    expect(f.out).toHaveLength(1);
    const frame = f.ansi();
    for (const m of frame.matchAll(/\x1b\[(\d+);(\d+)H/g)) {
      expect(Number(m[2])).toBeLessThanOrEqual(40);
    }
    expect(painted(frame)).toContain('0123456789');
    uninstallC64DoorAdapter(f.socket);
  });

  it('a tall frame reports unseen rows for the pause walk', () => {
    const f = fakeSocket(ttx());
    const adapter = installC64DoorAdapter(f.socket, f.socket.session);
    expect(adapter).not.toBeNull();
    // Tabular door rows with gutters fold one-to-two, so 20 source lines
    // paint 40 adapted rows onto the 25-row window, leaving unseen rows
    // for xim/io.ts to walk behind the pause prompt.
    const tall = Array.from({ length: 20 }, (_, i) => `Calls: ${i} / Yday: 71  |  U: 0 / D: 5 / 95k  |  Hrs: 43 / Rec: 9999`);
    f.socket.emit('ansi-output', tall.join('\r\n'));
    jest.advanceTimersByTime(C64_ADAPT_TICK_MS);
    expect(adapter!.unseenRows()).toBeGreaterThan(0);
    uninstallC64DoorAdapter(f.socket);
  });

  it('uninstall leaves the socket exactly as found', () => {
    const f = fakeSocket(ttx());
    const before = f.socket.emit;
    installC64DoorAdapter(f.socket, f.socket.session);
    expect(f.socket.emit).not.toBe(before);
    uninstallC64DoorAdapter(f.socket);
    expect(f.socket.emit).toBe(before);
    expect(c64AdapterFor(f.socket)).toBeNull();
  });
});
