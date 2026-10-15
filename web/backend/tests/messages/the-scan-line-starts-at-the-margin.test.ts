/**
 * THE MAIL SCAN'S LINE STARTS AT THE LEFT MARGIN.
 *
 * The sysop, 2026-09-22, joining a conference on a C64: "the amiga demoscene
 * conference has a cut off up rough internal no new mail today line". What
 * was on his screen was `ough Internal - No mail today!` - the TAIL of
 * `Scanning Conference: Up Rough Internal - No mail today!`, with its first
 * twenty-five characters gone.
 *
 * Fed the whole string, the transducer wraps it correctly at forty columns:
 * `Scanning Conference: Up Rough Internal -` and then ` No mail today!`. The
 * head was not mis-wrapped, it was never on a row of its own - the line
 * began at column fifteen, because something before it left the cursor
 * there, and this line carried on from where the cursor was.
 *
 * So the guard is a leading CR, and what this file pins is the PROPERTY: on
 * a C64's glass, with the cursor parked mid-row, the line still reads from
 * the left margin and nothing of it is lost.
 */
import { scanningConferenceLine } from '../../src/handlers/message/message-scan.handler';
import {
  AnsiToPetsciiTransducer,
  PetsciiMachine,
  screenCodeToPetscii,
} from '@amiexpress/bbs-door-sdk/petscii';

const COLS = 40;

/** One row of the C64's glass as text. */
function glassRow(display: PetsciiMachine, y: number): string {
  let row = '';
  for (let x = 0; x < COLS; x++) {
    const p = screenCodeToPetscii(display.state.screen[y * COLS + x] & 0x7f);
    if (p >= 0x20 && p <= 0x3f) { row += String.fromCharCode(p); continue; }
    if (display.state.charsetBank === 1) {
      if (p >= 0x41 && p <= 0x5a) { row += String.fromCharCode(p - 0x41 + 0x61); continue; }
      if (p >= 0xc1 && p <= 0xda) { row += String.fromCharCode(p - 0xc1 + 0x41); continue; }
    } else if (p >= 0x41 && p <= 0x5f) { row += String.fromCharCode(p); continue; }
    row += (p === 0x40 || (p >= 0x5b && p <= 0x5f)) ? String.fromCharCode(p) : ' ';
  }
  return row.replace(/\s+$/, '');
}

/**
 * The emits the scan makes for one conference with nothing new in it - the
 * FIRST of them from the board's own builder, so this drives the string the
 * caller gets rather than a copy of it.
 */
const SCAN = (confName: string) => [
  scanningConferenceLine(confName),
  'No mail today!\r\n',
];

describe('a scan line written after something left the cursor mid-row', () => {
  it('still reads from the left margin on a C64', () => {
    const t = new AnsiToPetsciiTransducer();
    const display = new PetsciiMachine();

    // Fifteen columns of something else, and NO newline after it - the state
    // the caller's screen was in.
    display.feed(t.transduce('SOMETHING ELSE'));
    for (const chunk of SCAN('Up Rough Internal')) display.feed(t.transduce(chunk));

    const rows = [0, 1, 2].map(y => glassRow(display, y));
    expect(rows[0]).toBe('Scanning Conference: Up Rough Internal -');
    expect(rows[1]).toBe(' No mail today!');
    // ...and nothing of the line is missing.
    expect(rows.join('')).toContain('Up Rough Internal');
  });

  it('is unchanged when the cursor was already at the margin', () => {
    const t = new AnsiToPetsciiTransducer();
    const display = new PetsciiMachine();

    for (const chunk of SCAN('Amiga Demoscene!')) display.feed(t.transduce(chunk));

    expect(glassRow(display, 0)).toBe('Scanning Conference: Amiga Demoscene! -');
  });
});

describe('the line the board builds', () => {
  it('opens with the carriage return that is the whole guard', () => {
    expect(scanningConferenceLine('Anything')).toMatch(/^\r/);
  });

  it('is otherwise the line it has always been', () => {
    expect(scanningConferenceLine('Amiga Demoscene!').replace(/^\r/, ''))
      .toBe('\x1b[32mScanning Conference\x1b[33m: \x1b[0mAmiga Demoscene! - ');
  });
});
