/**
 * The adapter's LAST RESORT, and the keys that make it usable.
 *
 * Plan phase 5 (thoughts/shared/plans/2026-09-02-c64-door-adapter.md, rule 6):
 * a positioned full-screen UI has no 40-column fold that keeps it usable, so
 * the caller is shown a 40-column WINDOW on the 80-column frame and moves it
 * with the cursor keys. The rule and its clamp landed on 2026-09-15 and
 * nothing could reach them: the ladder never chooses `viewport` for itself,
 * and no key was mapped to the offset.
 *
 * Three things have to hold for this to be a feature rather than a function:
 * a door DECLARES it (C64_VIEWPORT, never inferred), the window MOVES, and
 * the keys that move it are taken from the door ONLY for such a door.
 */
import {
  installC64DoorAdapter,
  uninstallC64DoorAdapter,
} from '../../src/server/c64-door-adapter';
import { doorViewportsAt40 } from '../../src/utils/door-min-columns.util';
import { routeDoorInput, panKeyOf } from '../../src/services/door-input-routing';

const realSetTimeout = global.setTimeout;
const wait = (ms: number) => new Promise((resolve) => realSetTimeout(resolve, ms));

/** An 80-column frame whose two halves are told apart at a glance. */
function wideFrame(): string {
  const rows: string[] = ['\x1b[2J\x1b[H'];
  for (let row = 0; row < 20; row++) {
    rows.push(`\x1b[${row + 1};1H` + 'L'.repeat(40) + 'R'.repeat(40));
  }
  return rows.join('');
}

async function paint(viewport: boolean) {
  const seen: string[] = [];
  const socket: any = {
    emit: (_event: string, payload: any) => {
      if (typeof payload === 'string') seen.push(payload);
      return true;
    },
  };
  socket.session = { terminalType: 'c64', petsciiMode: true, screenWidth: 40, screenHeight: 25 };
  const adapter = installC64DoorAdapter(socket, socket.session, { viewport });
  expect(adapter).not.toBeNull();
  socket.emit('ansi-output', wideFrame());
  await wait(60);
  return {
    adapter: adapter!,
    wire: () => seen.join(''),
    clear: () => { seen.length = 0; },
    done: () => uninstallC64DoorAdapter(socket),
  };
}

describe('a door that cannot be folded is shown through a window', () => {
  jest.setTimeout(30000);

  test('the declaration is what turns it on - nothing infers it', () => {
    expect(doorViewportsAt40({ toolTypes: { C64_VIEWPORT: '1' } } as any)).toBe(true);
    expect(doorViewportsAt40({ toolTypes: { C64_VIEWPORT: 'yes' } } as any)).toBe(true);
    expect(doorViewportsAt40({ toolTypes: { C64_ADAPT: '1' } } as any)).toBe(false);
    expect(doorViewportsAt40({} as any)).toBe(false);
    expect(doorViewportsAt40(null)).toBe(false);
  });

  test('the window opens on the left edge and pans right, never past the frame', async () => {
    const run = await paint(true);
    try {
      expect(run.adapter.isViewport()).toBe(true);
      expect(run.adapter.windowOffset()).toBe(0);
      // At the left edge the caller sees the left half and none of the right.
      expect(run.wire()).toContain('L'.repeat(40));
      expect(run.wire()).not.toContain('R');

      run.clear();
      expect(run.adapter.pan(40)).toBe(true);
      expect(run.adapter.windowOffset()).toBe(40);
      // And now the other half, which was off the screen a moment ago.
      expect(run.wire()).toContain('R'.repeat(40));

      // Past the right edge is a no-op, not an error: that is a caller
      // holding the key down.
      expect(run.adapter.pan(40)).toBe(false);
      expect(run.adapter.windowOffset()).toBe(40);

      // HOME comes back to the left edge.
      expect(run.adapter.panHome()).toBe(true);
      expect(run.adapter.windowOffset()).toBe(0);
    } finally { run.done(); }
  });

  test('without the declaration the frame is FOLDED, and there is no window to pan', async () => {
    const run = await paint(false);
    try {
      expect(run.adapter.isViewport()).toBe(false);
      expect(run.adapter.pan(40)).toBe(false);
      expect(run.adapter.windowOffset()).toBe(0);
      // The fold is what an ordinary adapted door gets: both halves reach the
      // caller, because the rows were reduced rather than windowed.
      expect(run.wire()).toContain('R');
    } finally { run.done(); }
  });
});

describe('the cursor keys move the window, and only for such a door', () => {
  const doorRunning = {
    doorActive: true,
    hasDoorInputHandler: true,
    hasCommandListener: false,
    bbsPauseActive: false,
  };

  test('the C64 keys and the ANSI arrows both read as a pan', () => {
    expect(panKeyOf('\x1d')).toBe('right');   // CRSR right
    expect(panKeyOf('\x9d')).toBe('left');    // CRSR left
    expect(panKeyOf('\x13')).toBe('home');    // HOME
    expect(panKeyOf('\x1b[C')).toBe('right');
    expect(panKeyOf('\x1b[D')).toBe('left');
    expect(panKeyOf('a')).toBeNull();
    expect(panKeyOf('')).toBeNull();
  });

  test('a windowed door gives its cursor keys to the window', () => {
    const route = routeDoorInput('\x1d', { ...doorRunning, viewportPan: true });
    expect(route.pan).toBe('right');
    expect(route.toDoorHandler).toBe(false);
    expect(route.toCommandListeners).toBe(false);
    expect(route.toBbs).toBe(false);
  });

  test('every other door keeps them - this is the only key a door loses', () => {
    const route = routeDoorInput('\x1d', { ...doorRunning, viewportPan: false });
    expect(route.pan).toBeNull();
    expect(route.toDoorHandler).toBe(true);
  });

  test('and a windowed door still gets every key that is not a pan key', () => {
    const route = routeDoorInput('q', { ...doorRunning, viewportPan: true });
    expect(route.pan).toBeNull();
    expect(route.toDoorHandler).toBe(true);
  });

  test('a board pause still outranks the window', () => {
    const route = routeDoorInput('\r', {
      ...doorRunning, viewportPan: true, bbsPauseActive: true,
    });
    expect(route.pan).toBeNull();
    expect(route.toBbs).toBe(true);
  });
});
