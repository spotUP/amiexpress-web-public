/**
 * The C64 door adapter's transport seam (Phase 3, Task 3).
 *
 * Fake socket, fake timers, no emulator and no door: this pins the seam's
 * CONTRACT - when a frame is cut, what reaches the wire, what passes through
 * untouched, and that install/uninstall leaves the socket exactly as it found
 * it. The RUNTIME proof that executeDoor actually installs it lives in
 * tests/doors/door-min-columns-gate.test.ts; the byte-identity proof for ANSI
 * sessions lives in c64-door-adapter-identity.test.ts.
 */
import {
  C64_ADAPT_MAX_FRAME_MS,
  C64_ADAPT_TICK_MS,
  c64AdapterDrives,
  c64AdapterFor,
  installC64DoorAdapter,
  uninstallC64DoorAdapter,
} from '../../src/server/c64-door-adapter';

function fakeSocket(session: any) {
  const out: Array<[string, any]> = [];
  const socket: any = {
    id: `s${++socketCounter}`,
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

const c64 = () => ({ petsciiMode: true, screenWidth: 40 });
const ansi = () => ({ petsciiMode: false, screenWidth: 80 });

/**
 * The characters a rendered diff actually PAINTS, escape sequences removed.
 * renderDiff skips blank cells, so a run breaks at every space: the painted
 * text of "HELLO C64" is "HELLOC64".
 */
const painted = (s: string): string => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

/** Every CUP in a rendered frame, as [row, col] 1-based pairs. */
function cups(text: string): Array<[number, number]> {
  return [...text.matchAll(/\x1b\[(\d+);(\d+)H/g)].map((m) => [Number(m[1]), Number(m[2])] as [number, number]);
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
});

describe('c64AdapterDrives', () => {
  it('is true only for a petsciiMode session', () => {
    expect(c64AdapterDrives({ petsciiMode: true })).toBe(true);
    expect(c64AdapterDrives({ petsciiMode: false })).toBe(false);
    expect(c64AdapterDrives(undefined)).toBe(false);
    expect(c64AdapterDrives(null)).toBe(false);
    expect(c64AdapterDrives({})).toBe(false);
  });
});

describe('C64DoorFrameAdapter', () => {
  it('(1) holds output until the quiet gap, then emits ONE 40x25 frame', () => {
    const f = fakeSocket(c64());
    installC64DoorAdapter(f.socket, f.socket.session);
    f.socket.emit('ansi-output', '\x1b[2J\x1b[HHELLO C64');
    expect(f.out).toHaveLength(0);                       // nothing on the wire yet

    jest.advanceTimersByTime(C64_ADAPT_TICK_MS);
    expect(f.out).toHaveLength(1);
    const frame = f.ansi();
    expect(frame.startsWith('\x1b[2J\x1b[H')).toBe(true); // first frame is a full paint
    expect(painted(frame)).toContain('HELLOC64');   // the space is a blank cell, never painted
    for (const [row, col] of cups(frame)) {
      expect(row).toBeLessThanOrEqual(25);
      expect(col).toBeLessThanOrEqual(40);
    }
    uninstallC64DoorAdapter(f.socket);
  });

  it('(2) four writes 5 ms apart coalesce into exactly one ansi-output', () => {
    const f = fakeSocket(c64());
    installC64DoorAdapter(f.socket, f.socket.session);
    for (let i = 0; i < 4; i++) {
      f.socket.emit('ansi-output', `chunk${i} `);
      jest.advanceTimersByTime(5);
    }
    expect(f.out).toHaveLength(0);
    jest.advanceTimersByTime(C64_ADAPT_TICK_MS);
    expect(f.out).toHaveLength(1);
    expect(painted(f.ansi())).toContain('chunk0chunk1chunk2chunk3');
    uninstallC64DoorAdapter(f.socket);
  });

  it('(3) 40 writes 10 ms apart still reach the caller - the cap fires without a quiet gap', () => {
    const f = fakeSocket(c64());
    installC64DoorAdapter(f.socket, f.socket.session);
    for (let i = 0; i < 40; i++) {
      f.socket.emit('ansi-output', 'x');
      jest.advanceTimersByTime(10);
    }
    // 400 ms of unbroken output: the quiet-gap timer never expired, so only
    // C64_ADAPT_MAX_FRAME_MS can have produced this.
    expect(f.out.length).toBeGreaterThan(0);
    expect(painted(f.ansi())).toContain('x');
    uninstallC64DoorAdapter(f.socket);
  });

  it('(4) a tick with no new output emits nothing', () => {
    const f = fakeSocket(c64());
    installC64DoorAdapter(f.socket, f.socket.session);
    f.socket.emit('ansi-output', 'once');
    jest.advanceTimersByTime(C64_ADAPT_TICK_MS);
    expect(f.out).toHaveLength(1);
    jest.advanceTimersByTime(C64_ADAPT_MAX_FRAME_MS * 4);
    expect(f.out).toHaveLength(1);                       // no empty diff on the wire
    uninstallC64DoorAdapter(f.socket);
  });

  it('(5) flush() is idempotent', () => {
    const f = fakeSocket(c64());
    const adapter = installC64DoorAdapter(f.socket, f.socket.session)!;
    f.socket.emit('ansi-output', 'ONE');
    adapter.flush();
    expect(f.out).toHaveLength(1);
    adapter.flush();
    adapter.flush();
    expect(f.out).toHaveLength(1);
    uninstallC64DoorAdapter(f.socket);
  });

  it('(6) a non-ansi-output event passes through, flushing first, order preserved', () => {
    const f = fakeSocket(c64());
    installC64DoorAdapter(f.socket, f.socket.session);
    f.socket.emit('ansi-output', 'BEFORE');
    f.socket.emit('door-active', true);
    expect(f.out.map(([e]) => e)).toEqual(['ansi-output', 'door-active']);
    expect(f.out[0][1]).toContain('BEFORE');
    expect(f.out[1][1]).toBe(true);
    uninstallC64DoorAdapter(f.socket);
  });

  it('(7) a Buffer payload passes through untouched and the next frame is a full repaint', () => {
    const f = fakeSocket(c64());
    installC64DoorAdapter(f.socket, f.socket.session);
    f.socket.emit('ansi-output', 'FIRST');
    jest.advanceTimersByTime(C64_ADAPT_TICK_MS);
    const zmodem = Buffer.from([0x2a, 0x18, 0x42, 0x30, 0x30]);
    f.socket.emit('ansi-output', zmodem);
    expect(f.out[1][1]).toBe(zmodem);                    // same object, byte-for-byte

    f.socket.emit('ansi-output', 'SECOND');
    jest.advanceTimersByTime(C64_ADAPT_TICK_MS);
    const after = f.out[2][1] as string;
    expect(after.startsWith('\x1b[2J\x1b[H')).toBe(true); // baseline dropped -> full paint
    expect(after).toContain('FIRST');                     // the whole screen, not just the delta
    expect(after).toContain('SECOND');
    uninstallC64DoorAdapter(f.socket);
  });

  it('(8) petscii-bytes passes through and drops the diff baseline', () => {
    const f = fakeSocket(c64());
    installC64DoorAdapter(f.socket, f.socket.session);
    f.socket.emit('ansi-output', 'PAINTED');
    jest.advanceTimersByTime(C64_ADAPT_TICK_MS);
    const b64 = Buffer.from([0x93, 0x41]).toString('base64');
    f.socket.emit('petscii-bytes', b64);
    expect(f.out[1]).toEqual(['petscii-bytes', b64]);

    f.socket.emit('ansi-output', 'AFTER');
    jest.advanceTimersByTime(C64_ADAPT_TICK_MS);
    expect((f.out[2][1] as string).startsWith('\x1b[2J\x1b[H')).toBe(true);
    uninstallC64DoorAdapter(f.socket);
  });

  it('(9) uninstall flushes the last frame, restores the original emit and clears every timer', () => {
    const f = fakeSocket(c64());
    const original = f.socket.emit;
    installC64DoorAdapter(f.socket, f.socket.session);
    expect(f.socket.emit).not.toBe(original);
    f.socket.emit('ansi-output', 'goodbye');
    uninstallC64DoorAdapter(f.socket);
    expect(f.ansi()).toContain('goodbye');
    expect(f.socket.emit).toBe(original);
    expect(c64AdapterFor(f.socket)).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('(9b) uninstall on a socket that was never patched is a no-op', () => {
    const f = fakeSocket(c64());
    const original = f.socket.emit;
    expect(() => uninstallC64DoorAdapter(f.socket)).not.toThrow();
    expect(f.socket.emit).toBe(original);
  });

  it('(10) a non-PETSCII session gets no adapter and its emit is untouched', () => {
    const f = fakeSocket(ansi());
    const original = f.socket.emit;
    expect(installC64DoorAdapter(f.socket, f.socket.session)).toBeNull();
    expect(f.socket.emit).toBe(original);
    expect(c64AdapterFor(f.socket)).toBeNull();
    f.socket.emit('ansi-output', '-'.repeat(78));
    expect(f.ansi()).toBe('-'.repeat(78));               // 80-column bytes, verbatim
    expect(jest.getTimerCount()).toBe(0);
  });

  it('(11) installing twice returns the same adapter and patches emit once', () => {
    const f = fakeSocket(c64());
    const first = installC64DoorAdapter(f.socket, f.socket.session);
    const patched = f.socket.emit;
    const second = installC64DoorAdapter(f.socket, f.socket.session);
    expect(second).toBe(first);
    expect(f.socket.emit).toBe(patched);
    uninstallC64DoorAdapter(f.socket);
  });

  it('(12) is found through a SECOND emitter object built for the same session', () => {
    const session = c64();
    const a = fakeSocket(session);
    const b = fakeSocket(session);
    const adapter = installC64DoorAdapter(a.socket, session);
    expect(c64AdapterFor(b.socket)).toBe(adapter);        // keyed by session, not object identity
    expect(c64AdapterFor(session)).toBe(adapter);         // and from the session itself
    uninstallC64DoorAdapter(b.socket);
    expect(a.socket.emit).not.toBe(b.socket.emit);        // restored onto the socket that was patched
    expect(c64AdapterFor(a.socket)).toBeNull();
  });

  it('seeds _directEmit with the PRE-adapter emit so a mid-door ModemEmulator bypasses the adapter', () => {
    const f = fakeSocket(c64());
    const original = f.socket.emit;
    installC64DoorAdapter(f.socket, f.socket.session);
    expect(f.socket._directEmit).toBeDefined();
    f.socket._directEmit('ansi-output', 'BYPASS');
    expect(f.out).toEqual([['ansi-output', 'BYPASS']]);   // straight to the wire, unadapted
    expect(f.socket._directEmit).not.toBe(f.socket.emit);
    uninstallC64DoorAdapter(f.socket);
    expect(f.socket.emit).toBe(original);
  });

  /**
   * A socket.io Socket inherits `emit` from its prototype. Assigning the
   * captured original back on uninstall would pin that prototype method as an
   * OWN property of the instance for the rest of the connection's life - a
   * silent, permanent mutation of every web caller's socket, one per door.
   */
  it('(review 1) restores a PROTOTYPE emit by deleting our own property, not by pinning it', () => {
    class ProtoEmitSocket {
      readonly out: Array<[string, any]> = [];
      readonly id = 'proto-1';
      constructor(public session: any) {}
      emit(ev: string, d?: any): boolean {
        this.out.push([ev, d]);
        return true;
      }
    }
    const socket: any = new ProtoEmitSocket(c64());
    expect(Object.prototype.hasOwnProperty.call(socket, 'emit')).toBe(false); // inherited to start

    installC64DoorAdapter(socket, socket.session);
    expect(Object.prototype.hasOwnProperty.call(socket, 'emit')).toBe(true);  // ours while installed

    socket.emit('ansi-output', 'PROTO');
    uninstallC64DoorAdapter(socket);

    expect(Object.prototype.hasOwnProperty.call(socket, 'emit')).toBe(false); // and gone again
    expect(socket.emit).toBe(ProtoEmitSocket.prototype.emit);
    socket.emit('ansi-output', 'AFTER');
    expect(socket.out[socket.out.length - 1]).toEqual(['ansi-output', 'AFTER']);
  });

  it('(review 2) the silent uninstall drops the pending frame instead of repainting it', () => {
    const f = fakeSocket(c64());
    installC64DoorAdapter(f.socket, f.socket.session);
    f.socket.emit('ansi-output', 'STALE FRAME FROM A DEAD DOOR');

    uninstallC64DoorAdapter(f.socket, { silent: true });

    expect(f.out).toHaveLength(0);                     // nothing painted over the menu
    expect(jest.getTimerCount()).toBe(0);
    expect(c64AdapterFor(f.socket)).toBeNull();
  });

  it('(review 2) the ordinary uninstall still paints the door last frame', () => {
    const f = fakeSocket(c64());
    installC64DoorAdapter(f.socket, f.socket.session);
    f.socket.emit('ansi-output', 'THE DOOR FINAL SCREEN');
    uninstallC64DoorAdapter(f.socket);
    expect(f.ansi()).toContain('SCREEN');
  });

  it('(review 3) does not restore over a wrapper layered above it', () => {
    const f = fakeSocket(c64());
    const originalEmit = f.socket.emit;
    installC64DoorAdapter(f.socket, f.socket.session);
    const layered = jest.fn();
    f.socket.emit = layered;                           // something wrapped us after install

    uninstallC64DoorAdapter(f.socket);

    expect(f.socket.emit).toBe(layered);               // their layer survives
    expect(f.socket.emit).not.toBe(originalEmit);
    expect(c64AdapterFor(f.socket)).toBeNull();        // and the adapter is still gone
    expect(jest.getTimerCount()).toBe(0);
  });

  it('(review 3) a disposed-but-still-patched emit degrades to a pass-through', () => {
    const f = fakeSocket(c64());
    installC64DoorAdapter(f.socket, f.socket.session);
    const ourPatch = f.socket.emit;
    const layered = jest.fn();
    f.socket.emit = layered;
    uninstallC64DoorAdapter(f.socket);                 // cannot unpatch; adapter disposed

    ourPatch('ansi-output', 'STRAIGHT THROUGH');       // whatever still holds our patch
    expect(f.out).toEqual([['ansi-output', 'STRAIGHT THROUGH']]);
    expect(jest.getTimerCount()).toBe(0);              // and it armed no timers
  });

  it('(review 6) removes the _directEmit it seeded', () => {
    const f = fakeSocket(c64());
    installC64DoorAdapter(f.socket, f.socket.session);
    expect(f.socket._directEmit).toBeDefined();
    uninstallC64DoorAdapter(f.socket);
    expect('_directEmit' in f.socket).toBe(false);     // the socket ends as it started
  });

  it('an existing _directEmit is not overwritten', () => {
    const f = fakeSocket(c64());
    const preset = jest.fn();
    f.socket._directEmit = preset;
    installC64DoorAdapter(f.socket, f.socket.session);
    expect(f.socket._directEmit).toBe(preset);
    uninstallC64DoorAdapter(f.socket);
    expect(f.socket._directEmit).toBe(preset);        // not ours to remove
  });

  it('honours tickMs/maxFrameMs overrides', () => {
    const f = fakeSocket(c64());
    installC64DoorAdapter(f.socket, f.socket.session, { tickMs: 5, maxFrameMs: 20 });
    f.socket.emit('ansi-output', 'FAST');
    jest.advanceTimersByTime(4);
    expect(f.out).toHaveLength(0);
    jest.advanceTimersByTime(1);
    expect(f.out).toHaveLength(1);
    uninstallC64DoorAdapter(f.socket);
  });

  it('reduces an 80-column door row to 40 columns before it reaches the caller', () => {
    const f = fakeSocket(c64());
    installC64DoorAdapter(f.socket, f.socket.session);
    f.socket.emit('ansi-output', '\x1b[2J\x1b[H' + '-'.repeat(78) + '\r\n');
    jest.advanceTimersByTime(C64_ADAPT_TICK_MS);
    const frame = f.ansi();
    expect(frame).not.toContain('-'.repeat(41));
    expect(frame).toContain('-'.repeat(40));
    uninstallC64DoorAdapter(f.socket);
  });
});
