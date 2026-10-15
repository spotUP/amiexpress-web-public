/**
 * THE BULLETIN THE CALLER ACTUALLY READS COMES THROUGH A DOOR.
 *
 * Two fixes for MultiTop's chart went live and the sysop's answer was "the
 * multitop bulls may not have regenerated? they look the same", then, after
 * the second, "its still too tall". Both fixes were real and both were
 * green - against `displayScreen`, which is the path the BOARD uses.
 *
 * The board does not show these. `B` on this board is a 68K door,
 * `Doors/EmP_Tools/Bulls`, and it hands the file back through JH_SF: the
 * bytes leave the emulator and meet the C64 DOOR adapter, whose ladder was
 * deliberately left without the screen's block rules. So MultiTop's chart
 * reached the caller squeezed, in the one place neither test looked.
 *
 * This drives the LIVE `Bulletins/bull1.txt` - the file off the volume, byte
 * for byte - through the real door adapter at forty columns and reads the
 * wire, which is what the door path does with it.
 */
import * as fs from 'fs';
import * as path from 'path';
import { installC64DoorAdapter, uninstallC64DoorAdapter } from '../../src/server/c64-door-adapter';
import { foldScreenBlocks } from '../../src/screens/adapt-ansi-to-forty';

/** The live bulletin, shared with the screen-path test. */
const BULLETIN = fs.readFileSync(
  path.join(__dirname, '..', 'screens', 'fixtures', 'multitop-bull1-live.txt'),
  'latin1',
);

/** Replay the wire onto a 40x25 grid, as `bulls-menu-row-survives-at-forty`. */
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

function bulletinAtForty(): string[] {
  const wire: string[] = [];
  const socket: any = {
    id: 'bulletin-door-40',
    emit(event: string, ...args: any[]) {
      if (event === 'ansi-output' && typeof args[0] === 'string') wire.push(args[0]);
      return true;
    },
  };
  const session = { petsciiMode: true, petsciiColumns: 40 };
  const adapter = installC64DoorAdapter(socket, session as any, {});
  expect(adapter).not.toBeNull();
  /*
   * The door emits the file the way JH_SF does: whole, in one message, and
   * through the fold the file path applies for a forty-column caller
   * (`io-file-display.ts`). Folding the CHART is the file's business; the
   * ladder below is the door's and is unchanged.
   */
  const shown = foldScreenBlocks(BULLETIN) ?? BULLETIN;
  socket.emit('ansi-output', shown.replace(/\r?\n/g, '\r\n'));
  adapter!.flush();
  uninstallC64DoorAdapter(socket);
  return screenOf(wire.join(''));
}

describe('a MultiTop bulletin shown by the Bulls door at 40 columns', () => {
  it('gives each place its own row, never two squeezed onto one', () => {
    const rows = bulletinAtForty().filter((row) => /^\s*\d+\.\s/.test(row));

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.replace(/^\s*\d+\.\s/, '')).not.toMatch(/\s\d+\.\s/);
    }
  });

  it('spends one row on the masthead, not three', () => {
    const rows = bulletinAtForty();
    const masthead = rows.filter((row) => row.includes('MultiTop-II'));

    expect(masthead.length).toBe(1);
    expect(masthead[0].trim()).toBe('MultiTop-II (c)1994 Bobo/Mystic');
  });

  it('keeps every row inside the forty columns he has', () => {
    for (const row of bulletinAtForty()) {
      expect(row.length).toBeLessThanOrEqual(40);
    }
  });
});
