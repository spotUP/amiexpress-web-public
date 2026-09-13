/**
 * The preloader a caller sees before a slow door opens.
 *
 * It drew a 60-column box centred inside a hardcoded 80, from row 8, and
 * repainted the whole thing - CLEAR_SCREEN included - ten times a second.
 * On a 40-column PETSCII screen that is a frame off the edge; on a short
 * terminal the box starts below the last row; and the repaint costs about
 * 7 KB a second at the exact moment the board is busy importing a door.
 *
 * "all our typescript doors have a broken preloader/progressbar" (sysop,
 * 2026-09-13). The door rules name both faults: geometry comes from the
 * screen, and an animation tick touches ONE row, never the frame.
 */

import { showPreloaderWhile } from '../../utils/door-preloader';

/** A socket that records what the board put on the wire. */
function wireSpy() {
  const chunks: string[] = [];
  return {
    socket: { emit: (event: string, data: unknown) => { if (event === 'ansi-output') chunks.push(String(data)); } },
    all: () => chunks.join(''),
    chunks: () => chunks,
  };
}

/** Every column an absolute cursor move addresses. */
function columnsAddressed(text: string): number[] {
  const cols: number[] = [];
  for (const m of text.matchAll(/\x1b\[(\d+);(\d+)H/g)) cols.push(Number(m[2]));
  return cols;
}

function rowsAddressed(text: string): number[] {
  const rows: number[] = [];
  for (const m of text.matchAll(/\x1b\[(\d+);(\d+)H/g)) rows.push(Number(m[1]));
  return rows;
}

/** The longest run of printable characters the frame puts on one line. */
function widestRun(text: string): number {
  const plain = text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '\n');
  return Math.max(0, ...plain.split('\n').map((l) => l.length));
}

describe('the preloader fits the caller', () => {
  it('stays inside a C64 at 40x25', async () => {
    const spy = wireSpy();
    await showPreloaderWhile(spy.socket, 'Card Lobby', async () => 'done', { cols: 40, rows: 25 });

    const out = spy.all();
    for (const c of columnsAddressed(out)) expect(c).toBeLessThanOrEqual(40);
    for (const r of rowsAddressed(out)) expect(r).toBeLessThanOrEqual(25);
    // 60 columns of box never fitted; whatever it draws now must.
    expect(widestRun(out)).toBeLessThanOrEqual(40);
  });

  it('stays inside a short terminal, where row 8 plus a box ran off the bottom', async () => {
    const spy = wireSpy();
    await showPreloaderWhile(spy.socket, 'Card Lobby', async () => 'done', { cols: 80, rows: 12 });
    for (const r of rowsAddressed(spy.all())) expect(r).toBeLessThanOrEqual(12);
  });

  it('uses the room a wide terminal has', async () => {
    const narrow = wireSpy();
    const wide = wireSpy();
    await showPreloaderWhile(narrow.socket, 'Card Lobby', async () => 'done', { cols: 80, rows: 25 });
    await showPreloaderWhile(wide.socket, 'Card Lobby', async () => 'done', { cols: 132, rows: 40 });
    expect(widestRun(wide.all())).toBeGreaterThan(widestRun(narrow.all()));
  });

  it('clears the screen once, not on every tick', async () => {
    const spy = wireSpy();
    // Hold the import open long enough for several animation ticks.
    await showPreloaderWhile(
      spy.socket,
      'Slow Door',
      () => new Promise((r) => setTimeout(() => r('done'), 450)),
      { cols: 80, rows: 25 },
    );

    const clears = spy.all().split('\x1b[2J').length - 1;
    expect(clears).toBe(1);
  });

  it('spends one cursor move and one character per tick, not a frame', async () => {
    const spy = wireSpy();
    await showPreloaderWhile(
      spy.socket,
      'Slow Door',
      () => new Promise((r) => setTimeout(() => r('done'), 450)),
      { cols: 80, rows: 25 },
    );

    // A tick is anything that is neither the cursor hide/show nor the one
    // frame (identified by the single clear it carries).
    const ticks = spy.chunks().filter(
      (c) => !c.includes('\x1b[2J') && !c.includes('\x1b[?25'),
    );
    expect(ticks.length).toBeGreaterThan(1);
    for (const t of ticks) {
      // A whole repainted box was ~700 bytes. A tick is a move, a colour,
      // one spinner character and a reset.
      expect(t.length).toBeLessThan(32);
    }
  });

  it('hands back what the loader returned, and rethrows what it threw', async () => {
    const spy = wireSpy();
    await expect(
      showPreloaderWhile(spy.socket, 'Door', async () => 'the module', { cols: 80, rows: 25 }),
    ).resolves.toBe('the module');

    await expect(
      showPreloaderWhile(spy.socket, 'Door', async () => { throw new Error('import failed'); }, { cols: 80, rows: 25 }),
    ).rejects.toThrow('import failed');
  });

  it('runs the loader untouched when there is no socket to draw on', async () => {
    await expect(
      showPreloaderWhile(null, 'Door', async () => 'the module'),
    ).resolves.toBe('the module');
  });
});

/**
 * A frame a caller cannot render is worse than no frame.
 *
 * The box was drawn with U+2500 line-drawing whatever the terminal was. A
 * telnet or Amiga caller has no such glyphs, so the one thing shown before
 * a slow door opened arrived as mojibake - "the spinner has some other crap
 * on the screen as well" (sysop, 2026-09-13). achievements/notices.ts had
 * already settled this rule: box-drawing only when unicodeCapable === true,
 * so an UNKNOWN terminal stays on ASCII.
 */
describe('the preloader draws glyphs the caller has', () => {
  const BOX_DRAWING = /[─-╿]/;

  it('uses ASCII for a terminal that has not claimed unicode', async () => {
    const spy = wireSpy();
    await showPreloaderWhile(spy.socket, 'Door', async () => 'done', { cols: 80, rows: 25 });
    expect(BOX_DRAWING.test(spy.all())).toBe(false);
    expect(spy.all()).toContain('+');
  });

  it('stays on ASCII when the flag is merely truthy, not true', async () => {
    const spy = wireSpy();
    await showPreloaderWhile(
      spy.socket, 'Door', async () => 'done',
      { cols: 80, rows: 25, unicode: 'yes' as unknown as boolean },
    );
    expect(BOX_DRAWING.test(spy.all())).toBe(false);
  });

  it('uses box-drawing for a terminal that renders it', async () => {
    const spy = wireSpy();
    await showPreloaderWhile(spy.socket, 'Door', async () => 'done', { cols: 80, rows: 25, unicode: true });
    expect(BOX_DRAWING.test(spy.all())).toBe(true);
  });
});
