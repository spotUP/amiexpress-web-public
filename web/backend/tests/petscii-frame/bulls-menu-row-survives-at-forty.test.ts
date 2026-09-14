/**
 * "the bulletin list is broken up" - the sysop's 40-column Bulls walk,
 * 2026-09-13.
 *
 * Bulls paints its menu at an indent of 18 with a dot leader between the
 * number and the label: `[01] ......................... Top Uploaders`, 62
 * columns wide. Nothing in the ladder wanted such a row - `deindent` leaves 44,
 * four too many; `record` declines because the right-hand field is prose;
 * `narrow` needs gutters and dots are not blanks - so it fell to the bottom
 * rung, which calls a row of punctuation ART and hard-splits it. The caller
 * read `[01] .................` with `........ Top Uploaders` on the row below:
 * the leader severed, the label orphaned, the screen twice as tall.
 *
 * This drives the REAL capture (fixtures/bulls-narrow-shadow.json: every
 * ansi-output the door emitted under the emulator with its narrow shadow in
 * effect) through the REAL adapter at 40 columns, and reads the wire.
 *
 * The rung that fixes it is `leader` in sdk/petscii/frame/adapt.ts; its own
 * unit tests live beside it. This one is the reachability proof: the door's
 * own bytes, the installed adapter, the caller's screen.
 */
import * as fs from 'fs';
import * as path from 'path';
import { installC64DoorAdapter, uninstallC64DoorAdapter } from '../../src/server/c64-door-adapter';

const capture: { chunks: string[] } = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'bulls-narrow-shadow.json'), 'utf8'),
);

/** The six bulletin labels, in the order Bulls lists them. */
const BULLETINS = [
  'Top Uploaders',
  'Top Downloaders',
  'Top Message Writers',
  'Top Upload CPS',
  'Top Download CPS',
  'Last Callers',
];

/**
 * Replay the wire onto a 40x25 grid, honouring the CUP/erase/cursor-forward
 * moves renderDiff emits, and return its rows. The adapter paints by absolute
 * position, so the only honest way to ask what the caller SEES is to play the
 * bytes back the way his terminal would.
 */
function screenOf(wire: string): string[] {
  const grid: string[][] = Array.from({ length: 25 }, () => new Array(40).fill(' '));
  let row = 0;
  let col = 0;
  for (let i = 0; i < wire.length; ) {
    const esc = /^\x1b\[([0-9;?]*)([A-Za-z])/.exec(wire.slice(i));
    if (esc) {
      const nums = esc[1].split(';').filter((p) => /^\d+$/.test(p)).map(Number);
      if (esc[2] === 'H' || esc[2] === 'f') {
        row = (nums[0] ?? 1) - 1;
        col = (nums[1] ?? 1) - 1;
      } else if (esc[2] === 'J') {
        for (const r of grid) r.fill(' ');
      } else if (esc[2] === 'K') {
        for (let x = col; x < 40; x++) grid[row][x] = ' ';
      } else if (esc[2] === 'C') {
        col += nums[0] ?? 1;
      }
      i += esc[0].length;
      continue;
    }
    const ch = wire[i];
    if (ch === '\r') { col = 0; i++; continue; }
    if (ch === '\n') { row++; col = 0; i++; continue; }
    if (row >= 0 && row < 25 && col >= 0 && col < 40) grid[row][col] = ch;
    col++;
    i++;
  }
  return grid.map((r) => r.join('').replace(/ +$/, ''));
}

function bullsAtForty(): string[] {
  const wire: string[] = [];
  const socket: any = {
    id: 'bulls-40',
    emit(event: string, ...args: any[]) {
      if (event === 'ansi-output' && typeof args[0] === 'string') wire.push(args[0]);
      return true;
    },
  };
  const session = { petsciiMode: true, petsciiColumns: 40 };
  const adapter = installC64DoorAdapter(socket, session as any, {});
  expect(adapter).not.toBeNull();
  for (const chunk of capture.chunks) socket.emit('ansi-output', chunk);
  adapter!.flush();
  uninstallC64DoorAdapter(socket);
  return screenOf(wire.join(''));
}

describe('Bulls at 40 columns', () => {
  it('gives each bulletin ONE row, its number and its label on the same row', () => {
    const screen = bullsAtForty();
    BULLETINS.forEach((label, i) => {
      const n = `[0${i + 1}]`;
      const rows = screen.filter((r) => r.includes(n));
      expect({ n, rows: rows.length }).toEqual({ n, rows: 1 });
      // The number, the leader and the label, in that order, on that row.
      expect(rows[0]).toMatch(new RegExp(`^\\[0${i + 1}\\] \\.+ ${label}$`));
    });
  });

  it('never splits a leader across a row boundary', () => {
    const screen = bullsAtForty();
    // A row that STARTS with dots is the tail of a severed leader - the exact
    // shape the sysop photographed.
    expect(screen.filter((r) => /^\.{2,}/.test(r))).toEqual([]);
  });

  it('paints nothing wider than the caller has', () => {
    for (const row of bullsAtForty()) expect(row.length).toBeLessThanOrEqual(40);
  });

  it('keeps the whole screen inside the 25 rows a C64 has', () => {
    const screen = bullsAtForty();
    expect(screen.filter((r) => r.length > 0).length).toBeLessThanOrEqual(25);
    // The door's prompt is still on screen, which is what paging would cost.
    expect(screen.some((r) => r.includes('Select Bulletin'))).toBe(true);
  });
});
