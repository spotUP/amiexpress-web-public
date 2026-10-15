/**
 * "the active > arrow ... it kept changing and what doubled differed"
 * (sysop, walking JoinCnf's list at 40 columns, 2026-09-14).
 *
 * A cursor key makes the door REPAINT: it rewrites the row the marker left
 * and the row it moved to. This emulator writes those rows 200-400 ms apart
 * - measured in the door logs - and the adapter ended a frame after 30 ms of
 * quiet, so the caller was shown the list mid-repaint: one entry in its old
 * position AND its new one. Which entry doubled depended on where the cut
 * landed, which is why it kept changing.
 *
 * A TIMER CANNOT KNOW A REPAINT HAS FINISHED. The door knows: it stops
 * painting and asks for a key. That is the frame boundary, and once a door
 * has shown it asks, the adapter stops guessing with the quiet gap.
 */
import {
  C64_ADAPT_MAX_FRAME_MS,
  C64_ADAPT_TICK_MS,
  c64AdapterFor,
  installC64DoorAdapter,
  uninstallC64DoorAdapter,
} from '../../src/server/c64-door-adapter';

jest.useFakeTimers();

function caller() {
  const wire: string[] = [];
  const socket: any = {
    id: 'repaint',
    emit(event: string, ...args: any[]) {
      if (event === 'ansi-output' && typeof args[0] === 'string') wire.push(args[0]);
      return true;
    },
  };
  installC64DoorAdapter(socket, { petsciiMode: true, petsciiColumns: 40 } as any, {});
  return { socket, wire, adapter: c64AdapterFor(socket)! };
}

/**
 * The text a frame paints, escapes removed.
 *
 * `renderDiff` repaints only the cells that CHANGED, so a row arrives in
 * pieces with a CUP between them - the space either side of a marker does
 * not move and is not re-sent. What matters here is that both halves of the
 * repaint are in the SAME frame, not how many runs it took.
 */
const painted = (wire: string[]): string =>
  wire.join('').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

afterEach(() => { jest.clearAllTimers(); });

describe('a repaint is not cut in half', () => {
  it('holds the frame across a slow repaint once the door has asked for a key', () => {
    const { socket, wire, adapter } = caller();

    // The door paints its list and asks for a key: that is a frame.
    socket.emit('ansi-output', '\x1b[H\x1b[2J');
    socket.emit('ansi-output', '[01] one\r\n[02] two\r\n');
    adapter.flushForInput();
    const first = wire.length;
    expect(first).toBeGreaterThan(0);

    // Now the cursor key: the door rewrites one row, then STALLS longer than
    // both the quiet gap and the cap before writing the other.
    wire.length = 0;
    socket.emit('ansi-output', '\x1b[1;1H> [01] one <');
    jest.advanceTimersByTime(C64_ADAPT_TICK_MS + C64_ADAPT_MAX_FRAME_MS + 500);
    expect({ cutMidRepaint: wire.length > 0 }).toEqual({ cutMidRepaint: false });

    // The door finishes and asks again - now the caller sees it, once.
    socket.emit('ansi-output', '\x1b[2;1H  [02] two  ');
    adapter.flushForInput();
    expect(wire.length).toBeGreaterThan(0);
    // BOTH halves of the repaint in one frame: the row the marker moved TO
    // and the row it left. Cut in half, one of these was missing and the
    // caller saw the old marker and the new one at once.
    const text = painted(wire);
    expect(text).toContain('> [01] one');
    expect(text).toContain('<');
    expect(text).toContain('[02] two');

    uninstallC64DoorAdapter(socket);
  });

  it('still cuts on the timer for a door that has never asked for a key', () => {
    const { socket, wire, adapter } = caller();
    void adapter;
    socket.emit('ansi-output', '\x1b[H\x1b[2Jstreaming output');
    jest.advanceTimersByTime(C64_ADAPT_TICK_MS + 1);
    expect(wire.length).toBeGreaterThan(0);
    uninstallC64DoorAdapter(socket);
  });

  it('a door that asks once and then paints for ever is still shown, eventually', () => {
    const { socket, wire, adapter } = caller();
    socket.emit('ansi-output', 'ready');
    adapter.flushForInput();
    wire.length = 0;

    socket.emit('ansi-output', '\x1b[H\x1b[2Jand now a very long listing');
    jest.advanceTimersByTime(C64_ADAPT_MAX_FRAME_MS + 1);
    expect({ heldForever: wire.length === 0 }).toEqual({ heldForever: true });
    jest.advanceTimersByTime(20_000);
    expect(wire.length).toBeGreaterThan(0);

    uninstallC64DoorAdapter(socket);
  });
});
